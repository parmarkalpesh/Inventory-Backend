const express = require("express");
const router = express.Router();
const multer = require("multer");
const inventoryController = require("../controllers/inventoryController");
const authController = require("../controllers/authController");
const dispatchUploadController = require("../controllers/dispatchUploadController");
const verifyToken = require("../middleware/auth");

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const upload = multer({ dest: "uploads/" });

// Auth
router.post("/auth/login", asyncHandler(authController.login));

// Protected routes
router.post(
  "/upload",
  verifyToken,
  upload.single("file"),
  asyncHandler(inventoryController.uploadExcel),
);
router.get(
  "/inventory",
  verifyToken,
  asyncHandler(inventoryController.getInventory),
);
router.delete(
  "/inventory/:productId",
  verifyToken,
  asyncHandler(inventoryController.deleteProduct),
);
router.post(
  "/dispatch",
  verifyToken,
  asyncHandler(inventoryController.dispatchFIFO),
);
router.get(
  "/dashboard",
  verifyToken,
  asyncHandler(inventoryController.getDashboardStats),
);
router.get(
  "/dispatch-report/excel",
  verifyToken,
  asyncHandler(inventoryController.exportDispatchReport),
);

// Upload History
router.get(
  "/upload-history",
  verifyToken,
  asyncHandler(dispatchUploadController.getUploadHistory),
);
router.get(
  "/upload-history/download/:id",
  verifyToken,
  asyncHandler(inventoryController.downloadUploadedFile),
);

// Dispatch Upload Dashboard
router.post(
  "/upload-dispatch",
  verifyToken,
  upload.single("file"),
  asyncHandler(dispatchUploadController.uploadDispatchExcel),
);
router.get(
  "/dispatch-dashboard",
  verifyToken,
  asyncHandler(dispatchUploadController.getDispatchDashboard),
);

module.exports = router;
