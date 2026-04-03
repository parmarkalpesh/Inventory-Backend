const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

const inventoryRoutes = require("../routes/inventory");

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use("/api", inventoryRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Error:", err);
  const statusCode = err.status || 500;
  const message = err.message || "Internal Server Error";

  res.status(statusCode).json({
    message,
    error: process.env.NODE_ENV === "development" ? err : undefined,
  });
});

// 🔥 MongoDB Connection (IMPORTANT for serverless)
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const mongoUri =
  process.env.MONGODB_URI ||
  "mongodb://parmarkalpesh1586_db_user:3ONnTht8xzrGVHaA@ac-z9qujyu-shard-00-00.urd6t0z.mongodb.net:27017,ac-z9qujyu-shard-00-01.urd6t0z.mongodb.net:27017,ac-z9qujyu-shard-00-02.urd6t0z.mongodb.net:27017/Inventory?authSource=admin&replicaSet=atlas-us990e-shard-0&tls=true&retryWrites=true&w=majority&appName=Cluster0";

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(mongoUri, {
      bufferCommands: false,
    });
  }

  try {
    cached.conn = await cached.promise;
    console.log("✅ MongoDB Connected");
  } catch (e) {
    cached.promise = null;
    console.error("❌ MongoDB Error:", e);
    throw e;
  }

  return cached.conn;
}

// 🔥 Serverless handler
module.exports = async (req, res) => {
  await connectDB();
  return app(req, res);
};
