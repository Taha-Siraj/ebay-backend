require('dotenv').config();
const app = require('./app');
const { connectDB } = require('./config/database');
const { startCron } = require('./services/cronService');
const { createInitialUser } = require('./scripts/createInitialUser');
const path = require('path');
const express = require('express');

const startServer = async () => {
  try {
    await connectDB();
    await createInitialUser();

    const PORT = process.env.PORT || 5000;
    const __dirname1 = path.resolve();

    // Correct frontend path (frontend is OUTSIDE backend folder)
    const frontendPath = path.join(__dirname1, '../frontend/dist');
    console.log("Serving frontend from:", frontendPath);

    // ----------------- FRONTEND STATIC -----------------
    app.use(express.static(frontendPath));

    // ----------------- SPA FALLBACK -----------------
    app.get('*', (req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });

    // ----------------- 404 (AFTER FRONTEND) -----------------
    app.use((req, res) => {
      res.status(404).json({ success: false, message: 'Route not found' });
    });

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`🔗 API: http://localhost:${PORT}/api`);
      console.log(`💚 Health: http://localhost:${PORT}/health`);
      startCron();
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

if (require.main === module) startServer();
