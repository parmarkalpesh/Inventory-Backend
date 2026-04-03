const Product = require("../models/Product");
const StockEntry = require("../models/StockEntry");
const DispatchLog = require("../models/DispatchLog");
const UploadLog = require("../models/UploadLog");
const ExcelJS = require("exceljs");
const mongoose = require("mongoose");
const path = require('path');
const fs = require('fs');

exports.uploadExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const workbook = new ExcelJS.Workbook();
    // Use buffer for serverless (memory storage)
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.getWorksheet(1);

    const data = [];
    const headers = [];

    // Get headers from the first row
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber] = cell.value;
    });

    // Iterate through rows starting from the second row
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row

      const rowObject = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = headers[colNumber];
        if (header) {
          // If the cell is a formula, get the result. If it's a date, it should already be a Date object.
          let value = cell.value;
          if (value && typeof value === 'object' && value.result !== undefined) {
            value = value.result;
          }
          rowObject[header] = value;
        }
      });
      data.push(rowObject);
    });

    const productOps = [];
    const stockEntries = [];

    // Helper function to parse dates from Excel
    // Handles: Excel serial numbers, DD-MM-YYYY strings, and Date objects
    // Returns a Date object at midnight UTC representing the calendar date
    const parseDate = (dateVal) => {
      if (!dateVal && dateVal !== 0) {
        // If no date, use current date at midnight UTC
        const now = new Date();
        return new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        );
      }

      // Handle Date objects (exceljs often returns Date objects)
      if (dateVal instanceof Date) {
        return new Date(
          Date.UTC(
            dateVal.getUTCFullYear(),
            dateVal.getUTCMonth(),
            dateVal.getUTCDate(),
            0,
            0,
            0,
            0,
          ),
        );
      }

      // Handle Excel serial numbers (numeric values)
      // Excel serial number: days since January 1, 1900
      if (typeof dateVal === "number" && dateVal > 0 && dateVal < 100000) {
        // Excel's epoch: January 1, 1900
        // Note: Excel incorrectly treats 1900 as a leap year
        const excelEpoch = new Date(Date.UTC(1900, 0, 0)); // December 30, 1899 in UTC
        const excelDate = new Date(excelEpoch.getTime() + dateVal * 86400000); // 86400000 = milliseconds per day
        return new Date(
          Date.UTC(
            excelDate.getUTCFullYear(),
            excelDate.getUTCMonth(),
            excelDate.getUTCDate(),
            0,
            0,
            0,
            0,
          ),
        );
      }

      // Convert to string for consistent parsing
      const dateStr = String(dateVal).trim();

      // Try to parse DD-MM-YYYY or DD/MM/YYYY format
      const parts = dateStr.split(/[-/]/);
      if (
        parts.length === 3 &&
        parts[0].length === 2 &&
        parts[1].length === 2 &&
        parts[2].length === 4
      ) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);

        // Validate date values
        if (
          day > 0 &&
          day <= 31 &&
          month > 0 &&
          month <= 12 &&
          year > 1900 &&
          year < 2100
        ) {
          // Create date at midnight UTC: this represents the exact calendar date you want
          return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        }
      }

      // If parsing fails, try standard date parsing
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        // Extract the calendar date in UTC and return at midnight UTC
        return new Date(
          Date.UTC(
            d.getUTCFullYear(),
            d.getUTCMonth(),
            d.getUTCDate(),
            0,
            0,
            0,
            0,
          ),
        );
      }

      // Fallback: current date at midnight UTC
      const now = new Date();
      return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
    };

    for (const row of data) {
      const materialCode = row["Material"];
      const itemName = row["Customer Mat. Description"];
      const qty = Number(row["INV QTY"]) || 0;
      const location = row["LOCATION"];

      // CLEANING: Ignore rows where Location contains "ALREADY GIVEN"
      if (
        location &&
        String(location).toUpperCase().includes("ALREADY GIVEN")
      ) {
        continue;
      }

      if (!itemName) continue;

      // Group by Customer Mat. Description (Item Name)
      productOps.push({
        updateOne: {
          filter: { sku: itemName.trim() },
          update: {
            name: itemName.trim(),
            description: materialCode ? `Material: ${materialCode}` : "",
            $inc: { totalQty: qty },
          },
          upsert: true,
        },
      });
    }

    await Product.bulkWrite(productOps);

    const products = await Product.find({
      sku: {
        $in: data
          .map((r) => r["Customer Mat. Description"]?.trim())
          .filter(Boolean),
      },
    });
    const productMap = products.reduce(
      (acc, p) => ({ ...acc, [p.sku]: p._id }),
      {},
    );

    for (const row of data) {
      const itemName = row["Customer Mat. Description"];
      const location = row["LOCATION"];

      if (!itemName) continue;
      if (
        location &&
        String(location).toUpperCase().includes("ALREADY GIVEN")
      ) {
        continue;
      }

      const materialCode = row["Material"];
      const shipName = row["SHIP NAME"];
      const shipCity = row["SHIP CITY"];
      const invoiceNo = row["Invoice No."];
      const arrivalDateVal = row["Invoice Date"];
      const qty = Number(row["INV QTY"] || 0);
      const poNumber = row["PURCHASE ORDER NUMBER"];

      stockEntries.push({
        productId: productMap[itemName.trim()],
        location: location || "Unknown",
        qty: qty,
        remainingQty: qty,
        arrivalDate: parseDate(arrivalDateVal),
        shipName: shipName ? String(shipName).trim() : "",
        shipCity: shipCity ? String(shipCity).trim() : "",
        invoiceNo: invoiceNo ? String(invoiceNo).trim() : "",
        poNumber: poNumber ? String(poNumber).trim() : "",
        customerMatDescription: itemName.trim(),
      });
    }

    await StockEntry.insertMany(stockEntries);

    const uploadLog = new UploadLog({
      uploadType: 'inventory',
      originalFileName: req.file.originalname,
      filePath: 'memory-storage', // File stored in memory for serverless
      rowCount: data.length
    });
    await uploadLog.save();

    res
      .status(200)
      .json({ message: "Excel data uploaded and processed successfully", logId: uploadLog._id });
  } catch (error) {
    console.error("Upload Error:", error);
    res
      .status(500)
      .json({ message: "Error processing Excel file", error: error.message });
  }
};

exports.getInventory = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const pipeline = [
      {
        $lookup: {
          from: "stockentries",
          localField: "_id",
          foreignField: "productId",
          as: "batches",
        },
      },
      { $unwind: "$batches" }
    ];

    const matchQuery = { "batches.remainingQty": { $gt: 0 } };

    if (startDate && endDate) {
        const start = new Date(startDate);
        start.setHours(0,0,0,0);
        const end = new Date(endDate);
        end.setHours(23,59,59,999);
        matchQuery["batches.arrivalDate"] = { $gte: start, $lte: end };
    }

    pipeline.push({ $match: matchQuery });

    const inventory = await Product.aggregate([
      ...pipeline,
      {
        $group: {
          _id: {
            productId: "$_id",
            sku: "$sku",
            name: "$name",
            description: "$description",
            location: "$batches.location",
          },
          totalLocationQty: { $sum: "$batches.remainingQty" },
          batches: {
            $push: {
              _id: "$batches._id",
              qty: "$batches.qty",
              remainingQty: "$batches.remainingQty",
              arrivalDate: "$batches.arrivalDate",
              shipName: "$batches.shipName",
              shipCity: "$batches.shipCity",
              invoiceNo: "$batches.invoiceNo",
              poNumber: "$batches.poNumber",
              customerMatDescription: "$batches.customerMatDescription",
            },
          },
        },
      },
      {
        $group: {
          _id: {
            productId: "$_id.productId",
            sku: "$_id.sku",
            name: "$_id.name",
            description: "$_id.description",
          },
          locations: {
            $push: {
              location: "$_id.location",
              totalQty: "$totalLocationQty",
              batches: "$batches",
            },
          },
          totalProductQty: { $sum: "$totalLocationQty" },
        },
      },
      {
        $sort: { "_id.name": 1 },
      },
      {
        $project: {
          _id: 0,
          productId: "$_id.productId",
          sku: "$_id.sku",
          name: "$_id.name",
          description: "$_id.description",
          totalProductQty: 1,
          locations: 1,
        },
      },
    ]);

    res.status(200).json(inventory);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching inventory", error: error.message });
  }
};

exports.dispatchFIFO = async (req, res) => {
  try {
    const { productId, qty } = req.body;
    let remainingToDispatch = qty;

    const product = await Product.findById(productId);
    if (!product || product.totalQty < qty) {
      throw new Error("Insufficient stock or product not found");
    }

    const batches = await StockEntry.find({
      productId,
      remainingQty: { $gt: 0 },
    }).sort({ arrivalDate: 1 });

    const dispatchedFrom = [];

    for (const batch of batches) {
      if (remainingToDispatch <= 0) break;

      const deduct = Math.min(batch.remainingQty, remainingToDispatch);
      batch.remainingQty -= deduct;
      await batch.save();

      dispatchedFrom.push({
        stockEntryId: batch._id,
        location: batch.location,
        qty: deduct,
        invoiceNo: batch.invoiceNo,
        shipName: batch.shipName,
      });

      remainingToDispatch -= deduct;
    }

    if (remainingToDispatch > 0) {
      throw new Error("FIFO logic failed: Not enough stock in sorted batches");
    }

    // Update Product totalQty
    product.totalQty -= qty;
    await product.save();

    // Save Log
    const log = new DispatchLog({
      productId,
      qty,
      dispatchedFrom,
    });
    await log.save();

    res.status(200).json({ message: "Dispatch successful", dispatchedFrom });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.exportDispatchReport = async (req, res) => {
  try {
    const logs = await DispatchLog.find()
      .populate('productId', 'name sku description')
      .sort({ date: -1 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Inventory System';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Dispatch Report', {
      pageSetup: { fitToPage: true, orientation: 'landscape' },
    });

    // ── Column definitions ──────────────────────────────────────────────────
    sheet.columns = [
      { header: 'Sr. No.',              key: 'sr',          width: 8  },
      { header: 'Dispatch Date',        key: 'date',        width: 18 },
      { header: 'Product Name',         key: 'product',     width: 40 },
      { header: 'SKU / Material Code',  key: 'sku',         width: 28 },
      { header: 'Total Qty Dispatched', key: 'totalQty',    width: 22 },
      { header: 'Source Location',      key: 'location',    width: 22 },
      { header: 'Batch Qty',            key: 'batchQty',    width: 14 },
      { header: 'Invoice No.',          key: 'invoiceNo',   width: 20 },
      { header: 'Ship Name',            key: 'shipName',    width: 26 },
    ];

    // ── Style the header row ────────────────────────────────────────────────
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top:    { style: 'thin', color: { argb: 'FFAAAAAA' } },
        left:   { style: 'thin', color: { argb: 'FFAAAAAA' } },
        bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } },
        right:  { style: 'thin', color: { argb: 'FFAAAAAA' } },
      };
    });
    headerRow.height = 28;

    // ── Helper: format date as DD-MM-YYYY ───────────────────────────────────
    const fmtDate = (d) => {
      if (!d) return 'N/A';
      const dt = new Date(d);
      const dd = String(dt.getUTCDate()).padStart(2, '0');
      const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = dt.getUTCFullYear();
      return `${dd}-${mm}-${yyyy}`;
    };

    // ── Populate rows ───────────────────────────────────────────────────────
    let sr = 1;
    let rowIndex = 2; // data starts at row 2

    for (const log of logs) {
      const productName = log.productId?.name || 'Unknown';
      const sku         = log.productId?.sku  || log.productId?.description || '';
      const dispDate    = fmtDate(log.date);
      const batches     = log.dispatchedFrom || [];

      if (batches.length === 0) {
        // Single row with no batch detail
        const row = sheet.addRow({
          sr:       sr++,
          date:     dispDate,
          product:  productName,
          sku,
          totalQty: log.qty,
          location: '',
          batchQty: '',
          invoiceNo:'',
          shipName: '',
        });
        styleDataRow(row, rowIndex++);
      } else {
        // One row per batch; merge sr/date/product/sku/totalQty across them
        const startRow = rowIndex;

        // Fetch full stock-entry details so we have invoiceNo + shipName
        const stockEntryIds = batches.map(b => b.stockEntryId).filter(Boolean);
        const stockEntries  = await StockEntry.find({ _id: { $in: stockEntryIds } });
        const seMap = stockEntries.reduce((acc, se) => {
          acc[String(se._id)] = se;
          return acc;
        }, {});

        for (let i = 0; i < batches.length; i++) {
          const b   = batches[i];
          const se  = seMap[String(b.stockEntryId)] || {};
          const row = sheet.addRow({
            sr:       i === 0 ? sr : '',
            date:     i === 0 ? dispDate : '',
            product:  i === 0 ? productName : '',
            sku:      i === 0 ? sku : '',
            totalQty: i === 0 ? log.qty : '',
            location: b.location || '',
            batchQty: b.qty,
            invoiceNo: se.invoiceNo || b.invoiceNo || '',
            shipName:  se.shipName  || b.shipName  || '',
          });
          styleDataRow(row, rowIndex++);
        }

        // Merge spanning cells when more than one batch row
        if (batches.length > 1) {
          const endRow = startRow + batches.length - 1;
          ['A','B','C','D','E'].forEach(col => {
            sheet.mergeCells(`${col}${startRow}:${col}${endRow}`);
            const cell = sheet.getCell(`${col}${startRow}`);
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          });
        }
        sr++;
      }
    }

    // ── Row style helper ────────────────────────────────────────────────────
    function styleDataRow(row, idx) {
      const bg = idx % 2 === 0 ? 'FFF0F4FF' : 'FFFFFFFF';
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font      = { size: 10 };
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border    = {
          top:    { style: 'hair', color: { argb: 'FFCCCCCC' } },
          left:   { style: 'hair', color: { argb: 'FFCCCCCC' } },
          bottom: { style: 'hair', color: { argb: 'FFCCCCCC' } },
          right:  { style: 'hair', color: { argb: 'FFCCCCCC' } },
        };
      });
      row.height = 20;
    }

    // ── Summary row ─────────────────────────────────────────────────────────
    const totalDispatched = logs.reduce((sum, l) => sum + l.qty, 0);
    const summaryRow = sheet.addRow({
      sr:       '',
      date:     '',
      product:  'TOTAL',
      sku:      '',
      totalQty: totalDispatched,
      location: '',
      batchQty: '',
      invoiceNo:'',
      shipName: '',
    });
    summaryRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    summaryRow.height = 24;

    // ── Send the file ───────────────────────────────────────────────────────
    const now  = new Date();
    const dateStamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const filename  = `dispatch_report_${dateStamp}.xlsx`;

    res.setHeader('Content-Type',        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export Error:', error);
    res.status(500).json({ message: 'Error exporting report', error: error.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const totalProducts = await Product.countDocuments();
    const totalStock = await Product.aggregate([
      { $group: { _id: null, total: { $sum: "$totalQty" } } },
    ]);

    const lowStockItems = await Product.find({ totalQty: { $lt: 20 } });

    let dateFilter = {};
    if (startDate && endDate) {
        const start = new Date(startDate);
        start.setHours(0,0,0,0);
        const end = new Date(endDate);
        end.setHours(23,59,59,999);
        dateFilter = { $gte: start, $lte: end };
    }

    const logQuery = Object.keys(dateFilter).length ? { date: dateFilter } : {};
    const recentLogs = await DispatchLog.find(logQuery)
      .populate("productId", "name sku description")
      .sort({ date: -1 })
      .limit(10);

    // FIFO Order View: All available stock entries sorted by date
    const stockQuery = { remainingQty: { $gt: 0 } };
    if (Object.keys(dateFilter).length) {
        stockQuery.arrivalDate = dateFilter;
    }

    const fifoOrderView = await StockEntry.find(stockQuery)
      .populate("productId", "name")
      .sort({ arrivalDate: 1 });

    res.status(200).json({
      totalProducts,
      totalStock: totalStock[0]?.total || 0,
      lowStockCount: lowStockItems.length,
      lowStockItems,
      recentLogs,
      fifoOrderView,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching stats", error: error.message });
  }
};

exports.downloadUploadedFile = async (req, res) => {
  try {
    const log = await UploadLog.findById(req.params.id);
    if (!log) return res.status(404).json({ message: 'Upload history not found' });

    // Files stored in memory (serverless) cannot be downloaded
    if (log.filePath === 'memory-storage') {
        return res.status(400).json({ message: 'File downloads are not available for files processed in serverless environment. Please re-upload the file to download it.' });
    }

    const absolutePath = path.resolve(log.filePath);
    if (!fs.existsSync(absolutePath)) {
        return res.status(404).json({ message: 'File no longer exists on server' });
    }

    res.download(absolutePath, log.originalFileName);
  } catch (error) {
    res.status(500).json({ message: 'Error downloading file', error: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    
    const deletedProduct = await Product.findByIdAndDelete(productId);
    if (!deletedProduct) {
      return res.status(404).json({ message: "Product not found" });
    }

    await StockEntry.deleteMany({ productId: productId });
    await DispatchLog.deleteMany({ productId: productId });

    res.status(200).json({ message: "Product and associated stock deleted successfully" });
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ message: "Error deleting product", error: error.message });
  }
};
