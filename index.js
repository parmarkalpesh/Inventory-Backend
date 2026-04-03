const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const inventoryRoutes = require('./routes/inventory');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', inventoryRoutes);

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://parmarkalpesh1586_db_user:3ONnTht8xzrGVHaA@ac-z9qujyu-shard-00-00.urd6t0z.mongodb.net:27017,ac-z9qujyu-shard-00-01.urd6t0z.mongodb.net:27017,ac-z9qujyu-shard-00-02.urd6t0z.mongodb.net:27017/Inventory?authSource=admin&replicaSet=atlas-us990e-shard-0&tls=true&retryWrites=true&w=majority&appName=Cluster0')
    .then(() => {
        console.log('Connected to MongoDB');
        // Only start the listener if not running in Vercel's serverless environment
        if (!process.env.VERCEL) {
            app.listen(PORT, () => {
                console.log(`Server running on port ${PORT}`);
            });
        }
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
    });

// Export the app for Vercel serverless deployment
module.exports = app;
