const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

const inventoryRoutes = require("./routes/inventory");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use("/api", inventoryRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  const statusCode = err.status || 500;
  const message = err.message || "Internal Server Error";
  res
    .status(statusCode)
    .json({ message, error: process.env.VERCEL ? undefined : err });
});

// MongoDB Connection
const mongoUri =
  process.env.MONGODB_URI ||
  "mongodb://parmarkalpesh1586_db_user:3ONnTht8xzrGVHaA@ac-z9qujyu-shard-00-00.urd6t0z.mongodb.net:27017,ac-z9qujyu-shard-00-01.urd6t0z.mongodb.net:27017,ac-z9qujyu-shard-00-02.urd6t0z.mongodb.net:27017/Inventory?authSource=admin&replicaSet=atlas-us990e-shard-0&tls=true&retryWrites=true&w=majority&appName=Cluster0";

const connectMongoDB = async () => {
  try {
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    // Don't crash the app, allow it to serve requests
    // MongoDB will retry on next request
  }
};

// Connect to MongoDB
connectMongoDB();

// Only start the listener if not running in Vercel's serverless environment
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export the app for Vercel serverless deployment
module.exports = app;
