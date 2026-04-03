const mongoose = require('mongoose');

const dispatchLogSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    qty: { type: Number, required: true },
    dispatchedFrom: [{
        stockEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockEntry' },
        location: { type: String },
        qty: { type: Number },
        invoiceNo: { type: String },
        shipName: { type: String },
        arrivalDate: { type: Date }
    }],
    date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DispatchLog', dispatchLogSchema);
