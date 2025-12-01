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

// Security & CORS
app.use(helmet());
app.use(cors({ origin: '*' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// DB connection guard
app.use((req, res, next) => {
  if (req.path === '/health') return next();

  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: 'Database not connected yet'
    });
  }
  next();
});

// Debug logging
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log('➡️', req.method, req.url);
    next();
  });
}

// ----------------- API ROUTES --------------------
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
    message: 'API OK',
    timestamp: new Date().toISOString()
  });
});

module.exports = app;
