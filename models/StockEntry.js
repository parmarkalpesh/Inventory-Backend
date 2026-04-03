const mongoose = require('mongoose');

const stockEntrySchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    location: { type: String, required: true },
    qty: { type: Number, required: true },
    remainingQty: { type: Number, required: true },
    arrivalDate: { type: Date, required: true },
    shipName: { type: String },
    shipCity: { type: String },
    invoiceNo: { type: String },
    poNumber: { type: String },
    customerMatDescription: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// Indexing for FIFO: sorting by arrivalDate is crucial
stockEntrySchema.index({ productId: 1, arrivalDate: 1 });
stockEntrySchema.index({ remainingQty: 1 });

module.exports = mongoose.model('StockEntry', stockEntrySchema);
