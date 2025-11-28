const mongoose = require('mongoose');

let memoryServer;
let isConnected = false; // 🔥 serverless-friendly global flag

const getDatabaseName = () => process.env.MONGO_DB_NAME || 'ebaymonitor';

const connectDB = async () => {
  try {
    // 🔥 Prevent duplicate connections (Vercel fix)
    if (isConnected && mongoose.connection.readyState === 1) {
      return mongoose.connection;
    }

    // ---------------- TEST ENVIRONMENT ---------------- //
    if (process.env.NODE_ENV === 'test') {
      if (!memoryServer) {
        const { MongoMemoryServer } = require('mongodb-memory-server');
        memoryServer = await MongoMemoryServer.create({
          instance: {
            dbName: `${getDatabaseName()}_test`
          }
        });
      }

      const uri = memoryServer.getUri();
      const conn = await mongoose.connect(uri);

      isConnected = true; // mark connected

      console.log('📌 Connected in-memory DB:', conn.connection.name);
      return conn;
    }

    // ---------------- PRODUCTION / DEVELOPMENT ---------------- //
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI environment variable is not set');
    }

    const conn = await mongoose.connect(process.env.MONGO_URI, {
      dbName: getDatabaseName(),
      maxPoolSize: 1, // 🔥 Important for serverless
      serverSelectionTimeoutMS: 5000
    });

    isConnected = true; // 🔥 mark connected

    console.log('📌 Connected DB:', conn.connection.name);
    console.log('📌 DB Host:', conn.connection.host);

    return conn;

  } catch (err) {
    console.error('❌ DB Error:', err.message);
    console.error('❌ DB Error Stack:', err.stack);

    throw new Error('Database connection not available. Please try again in a moment.');
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
    isConnected = false;

    if (memoryServer) {
      await memoryServer.stop();
      memoryServer = null;
    }
  } catch (err) {
    console.error('❌ DB Disconnect Error:', err.message);
  }
};

module.exports = { connectDB, disconnectDB };
