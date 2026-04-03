const express = require('express');
const router = express.Router();
const multer = require('multer');
const inventoryController = require('../controllers/inventoryController');

const upload = multer({ dest: 'uploads/' });

router.post('/upload', upload.single('file'), inventoryController.uploadExcel);
router.get('/inventory', inventoryController.getInventory);
router.post('/dispatch', inventoryController.dispatchFIFO);
router.get('/dashboard', inventoryController.getDashboardStats);
router.get('/report/preview', inventoryController.getDispatchReportPreview);
router.get('/report/export', inventoryController.exportDispatchReport);

module.exports = router;
