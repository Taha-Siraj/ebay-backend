require('dotenv').config();
const app = require('./app');
const { connectDB } = require('./config/database');
const { startCron } = require('./services/cronService');
const { createInitialUser } = require('./scripts/createInitialUser');

const startServer = async () => {
  try {
    await connectDB();
    await createInitialUser();

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      console.log(`\n🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 API: http://localhost:${PORT}`);
      console.log(`💚 Health check: http://localhost:${PORT}/health\n`);

      startCron();
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

module.exports = { app, startServer };
