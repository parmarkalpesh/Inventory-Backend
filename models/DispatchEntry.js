const mongoose = require('mongoose');

const dispatchEntrySchema = new mongoose.Schema({
    invoiceDate: { type: Date, required: true },
    invoiceNumber: { type: String, required: true },
    salesOrder: { type: String },
    customerAccount: { type: String },
    customerName: { type: String },
    itemNumber: { type: String },
    itemName: { type: String, required: true },
    configuration: { type: String },
    site: { type: String },
    warehouse: { type: String },
    invoiceQty: { type: Number, required: true },
    unit: { type: String },
    invoiceUnitPrice: { type: Number },
    invoiceAmount: { type: Number },
    unitPriceOfSoLine: { type: Number },
    differenceOfPrice: { type: Number },
    consistent: { type: String },
    uploadLogId: { type: mongoose.Schema.Types.ObjectId, ref: 'UploadLog' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DispatchEntry', dispatchEntrySchema);
