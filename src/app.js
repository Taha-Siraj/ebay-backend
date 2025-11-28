require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');

// Routes
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const alertRoutes = require('./routes/alertRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const metricsRoutes = require('./routes/metricsRoutes');
const importRoutes = require('./routes/importRoutes');

const app = express();

// Global middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  })
);

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Database connection guard to avoid hitting routes while Mongo is still connecting
app.use((req, res, next) => {
  if (req.path === '/health') {
    return next();
  }

  if (mongoose.connection.readyState !== 1) {
    console.error('⚠️ Database not connected! ReadyState:', mongoose.connection.readyState);
    return res.status(503).json({
      success: false,
      message: 'Database connection not available. Please try again in a moment.'
    });
  }

  return next();
});

// Extra request logging in development for easier debugging
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log('➡️ Incoming:', req.method, req.url);
    next();
  });
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/import', importRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'eBay Monitoring API is running',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('🔥 SERVER ERROR:', err);
  console.error('🔥 SERVER ERROR STACK:', err.stack);

  if (res.headersSent) {
    return next(err);
  }

  return res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Server error'
  });
});

module.exports = app;


