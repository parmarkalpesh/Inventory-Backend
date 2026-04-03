const express = require('express');
const router = express.Router();
const multer = require('multer');
const inventoryController = require('../controllers/inventoryController');
const authController = require('../controllers/authController');
const dispatchUploadController = require('../controllers/dispatchUploadController');
const verifyToken = require('../middleware/auth');

const upload = multer({ dest: 'uploads/' });

// Auth
router.post('/auth/login', authController.login);

// Protected routes
router.post('/upload', verifyToken, upload.single('file'), inventoryController.uploadExcel);
router.get('/inventory', verifyToken, inventoryController.getInventory);
router.delete('/inventory/:productId', verifyToken, inventoryController.deleteProduct);
router.post('/dispatch', verifyToken, inventoryController.dispatchFIFO);
router.get('/dashboard', verifyToken, inventoryController.getDashboardStats);
router.get('/dispatch-report/excel', verifyToken, inventoryController.exportDispatchReport);

// Upload History
router.get('/upload-history', verifyToken, dispatchUploadController.getUploadHistory);
router.get('/upload-history/download/:id', verifyToken, inventoryController.downloadUploadedFile);

// Dispatch Upload Dashboard
router.post('/upload-dispatch', verifyToken, upload.single('file'), dispatchUploadController.uploadDispatchExcel);
router.get('/dispatch-dashboard', verifyToken, dispatchUploadController.getDispatchDashboard);

module.exports = router;
