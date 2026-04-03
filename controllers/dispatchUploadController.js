const ExcelJS = require('exceljs');
const DispatchEntry = require('../models/DispatchEntry');
const UploadLog = require('../models/UploadLog');
const Product = require('../models/Product');

exports.uploadDispatchExcel = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const workbook = new ExcelJS.Workbook();
        // Use buffer for serverless (memory storage)
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.getWorksheet(1);

        const data = [];
        const headers = [];

        worksheet.getRow(1).eachCell((cell, colNumber) => {
            headers[colNumber] = cell.value?.toString().trim();
        });

        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber === 1) return;
            const rowObject = {};
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                const header = headers[colNumber];
                if (header) {
                    let value = cell.value;
                    if (value && typeof value === 'object' && value.result !== undefined) {
                        value = value.result;
                    }
                    rowObject[header] = value;
                }
            });
            data.push(rowObject);
        });

        // Parse Date helper
        const parseDate = (dateVal) => {
            if (!dateVal && dateVal !== 0) return new Date();
            if (dateVal instanceof Date) return dateVal;
            if (typeof dateVal === 'number' && dateVal > 0 && dateVal < 100000) {
                const excelEpoch = new Date(Date.UTC(1900, 0, 0));
                return new Date(excelEpoch.getTime() + (dateVal - 1) * 86400000); // Excel bug offset handled by -1
            }
            const d = new Date(dateVal);
            if (!isNaN(d.getTime())) return d;
            return new Date();
        };

        const uploadLog = new UploadLog({
            uploadType: 'dispatch',
            originalFileName: req.file.originalname,
            filePath: 'memory-storage', // File stored in memory for serverless
            rowCount: data.length
        });
        await uploadLog.save();

        const dispatchEntries = [];
        for (const row of data) {
            const invoiceQty = Number(row['Invoice Quantity']) || 0;
            if (invoiceQty <= 0) continue;

            dispatchEntries.push({
                invoiceDate: parseDate(row['Invoice date']),
                invoiceNumber: row['Invoice Number'] || '',
                salesOrder: row['Sales order'] || '',
                customerAccount: row['Customer account'] || '',
                customerName: row['Customer name'] || '',
                itemNumber: row['Item number'] || '',
                itemName: row['Item name'] || '',
                configuration: row['Configuration'] || '',
                site: row['Site'] || '',
                warehouse: row['Warehouse'] || '',
                invoiceQty: invoiceQty,
                unit: row['Unit'] || '',
                invoiceUnitPrice: Number(row['Invoice Unit price']) || 0,
                invoiceAmount: Number(row['Invoice Amount']) || 0,
                unitPriceOfSoLine: Number(row['Unit price of SO line']) || 0,
                differenceOfPrice: Number(row['Difference of price']) || 0,
                consistent: row['Consistent'] || '',
                uploadLogId: uploadLog._id
            });
        }

        if (dispatchEntries.length > 0) {
            await DispatchEntry.insertMany(dispatchEntries);
        }

        res.status(200).json({ message: 'Dispatch data uploaded successfully', logId: uploadLog._id });
    } catch (error) {
        console.error('Dispatch Upload Error:', error);
        res.status(500).json({ message: 'Error processing Dispatch file', error: error.message });
    }
};

exports.getDispatchDashboard = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const pipeline = [];

        if (startDate && endDate) {
            const start = new Date(startDate);
            start.setHours(0,0,0,0);
            const end = new Date(endDate);
            end.setHours(23,59,59,999);
            pipeline.push({
                $match: {
                    invoiceDate: { $gte: start, $lte: end }
                }
            });
        }

        pipeline.push({
            $group: {
                _id: "$itemName",
                totalDispatched: { $sum: "$invoiceQty" },
                latestDispatchDate: { $max: "$invoiceDate" }
            }
        });

        const dispatchSummary = await DispatchEntry.aggregate(pipeline);

        const itemNames = dispatchSummary.map(d => d._id);
        const products = await Product.find({ name: { $in: itemNames } });
        
        const dashboardData = dispatchSummary.map(dispatch => {
            const product = products.find(p => p.name === dispatch._id);
            const totalAvailable = product ? product.totalQty : 0;
            return {
                itemName: dispatch._id,
                totalDispatched: dispatch.totalDispatched,
                totalAvailable: totalAvailable,
                latestDispatchDate: dispatch.latestDispatchDate
            };
        });

        res.status(200).json(dashboardData);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching dispatch dashboard', error: error.message });
    }
};

exports.getUploadHistory = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let query = {};
        
        if (startDate && endDate) {
            const start = new Date(startDate);
            start.setHours(0,0,0,0);
            const end = new Date(endDate);
            end.setHours(23,59,59,999);
            
            query.uploadDate = { $gte: start, $lte: end };
        }

        const history = await UploadLog.find(query).sort({ uploadDate: -1 });
        res.status(200).json(history);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching upload history', error: error.message });
    }
};
