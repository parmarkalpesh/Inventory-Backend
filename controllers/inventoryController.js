const Product = require("../models/Product");
const StockEntry = require("../models/StockEntry");
const DispatchLog = require("../models/DispatchLog");
const xlsx = require("xlsx");
const mongoose = require("mongoose");

exports.uploadExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const workbook = xlsx.readFile(req.file.path, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

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

    res
      .status(200)
      .json({ message: "Excel data uploaded and processed successfully" });
  } catch (error) {
    console.error("Upload Error:", error);
    res
      .status(500)
      .json({ message: "Error processing Excel file", error: error.message });
  }
};

exports.getInventory = async (req, res) => {
  try {
    const inventory = await Product.aggregate([
      {
        $lookup: {
          from: "stockentries",
          localField: "_id",
          foreignField: "productId",
          as: "batches",
        },
      },
      { $unwind: "$batches" },
      { $match: { "batches.remainingQty": { $gt: 0 } } },
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
        invoiceNo: batch.invoiceNo || '',
        shipName: batch.shipName || '',
        arrivalDate: batch.arrivalDate,
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

exports.getDispatchReportPreview = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = {};
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate + 'T00:00:00.000Z');
      if (endDate)   filter.date.$lte = new Date(endDate   + 'T23:59:59.999Z');
    }
    const logs = await DispatchLog.find(filter)
      .populate('productId', 'name sku description')
      .sort({ date: -1 });
    res.status(200).json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching report', error: error.message });
  }
};

exports.exportDispatchReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const filter = {};
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate + 'T00:00:00.000Z');
      if (endDate)   filter.date.$lte = new Date(endDate   + 'T23:59:59.999Z');
    }

    const logs = await DispatchLog.find(filter)
      .populate('productId', 'name sku description')
      .sort({ date: -1 });

    // Build flat rows for Excel
    const rows = [];
    for (const log of logs) {
      const dispatchDate = log.date
        ? new Date(log.date).toLocaleDateString('en-GB') // DD/MM/YYYY
        : 'N/A';

      const productName = log.productId?.name || 'Unknown';
      const sku = log.productId?.sku || '';

      if (log.dispatchedFrom && log.dispatchedFrom.length > 0) {
        for (const df of log.dispatchedFrom) {
          const arrivalDate = df.arrivalDate
            ? new Date(df.arrivalDate).toLocaleDateString('en-GB')
            : 'N/A';

          rows.push({
            'Dispatch Date'    : dispatchDate,
            'Product Name'     : productName,
            'SKU / Material'   : sku,
            'Location'         : df.location || 'N/A',
            'Dispatched Qty'   : df.qty,
            'Invoice No.'      : df.invoiceNo || 'N/A',
            'Ship Name'        : df.shipName  || 'N/A',
            'Arrival Date'     : arrivalDate,
            'Total Dispatch Qty': log.qty,
          });
        }
      } else {
        rows.push({
          'Dispatch Date'    : dispatchDate,
          'Product Name'     : productName,
          'SKU / Material'   : sku,
          'Location'         : 'N/A',
          'Dispatched Qty'   : log.qty,
          'Invoice No.'      : 'N/A',
          'Ship Name'        : 'N/A',
          'Arrival Date'     : 'N/A',
          'Total Dispatch Qty': log.qty,
        });
      }
    }

    // Generate Excel workbook
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(rows);

    // Auto column widths (estimate)
    const colWidths = [
      { wch: 14 }, { wch: 40 }, { wch: 20 }, { wch: 20 },
      { wch: 14 }, { wch: 18 }, { wch: 24 }, { wch: 14 }, { wch: 18 }
    ];
    ws['!cols'] = colWidths;

    xlsx.utils.book_append_sheet(wb, ws, 'Dispatch Report');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const filename = `Dispatch_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    console.error('Export Error:', error);
    res.status(500).json({ message: 'Error generating report', error: error.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    const totalStock = await Product.aggregate([
      { $group: { _id: null, total: { $sum: "$totalQty" } } },
    ]);

    const lowStockItems = await Product.find({ totalQty: { $lt: 20 } });

    const recentLogs = await DispatchLog.find()
      .populate("productId", "name sku description")
      .sort({ date: -1 })
      .limit(10);

    // FIFO Order View: All available stock entries sorted by date
    const fifoOrderView = await StockEntry.find({ remainingQty: { $gt: 0 } })
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
