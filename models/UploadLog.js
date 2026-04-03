const mongoose = require('mongoose');

const uploadLogSchema = new mongoose.Schema({
    uploadType: { type: String, enum: ['inventory', 'dispatch'], required: true },
    originalFileName: { type: String, required: true },
    uploadDate: { type: Date, default: Date.now },
    uploadedBy: { type: String, default: 'Admin' },
    filePath: { type: String, required: true },
    rowCount: { type: Number, default: 0 }
});

module.exports = mongoose.model('UploadLog', uploadLogSchema);
