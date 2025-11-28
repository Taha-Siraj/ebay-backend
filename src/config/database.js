const mongoose = require('mongoose');

let memoryServer;

const getDatabaseName = () => process.env.MONGO_DB_NAME || 'ebaymonitor';

const connectDB = async () => {
  try {
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
      console.log('📌 Connected in-memory DB:', conn.connection.name);
      return conn;
    }

    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI environment variable is not set');
    }

    const conn = await mongoose.connect(process.env.MONGO_URI, {
      dbName: getDatabaseName()
    });

    console.log('📌 Connected DB:', conn.connection.name);
    console.log('📌 DB Host:', conn.connection.host);
    return conn;
  } catch (err) {
    console.error('❌ DB Error:', err.message);
    console.error('❌ DB Error Stack:', err.stack);
    throw err;
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.connection.close();

    if (memoryServer) {
      await memoryServer.stop();
      memoryServer = null;
    }
  } catch (err) {
    console.error('❌ DB Disconnect Error:', err.message);
  }
};

module.exports = { connectDB, disconnectDB };
