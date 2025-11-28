require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error("❌ MONGO_URI is missing in .env file");
    }

    // Ensure database name is in URI
    let finalUri = mongoUri;
    
    if (finalUri.match(/\/\?appName=/)) {
      finalUri = finalUri.replace(/\/\?appName=.*$/, '/ebaymonitor?retryWrites=true&w=majority');
    } else if (finalUri.endsWith('/')) {
      finalUri = finalUri.replace(/\/$/, '/ebaymonitor?retryWrites=true&w=majority');
    } else {
      const hasDbName = finalUri.match(/\/([^\/\?]+)(\?|$)/);
      const dbNameInUri = hasDbName && hasDbName[1] && 
                          !hasDbName[1].includes('@') && 
                          hasDbName[1] !== 'mongodb.net';
      
      if (!dbNameInUri) {
        if (finalUri.includes('?')) {
          finalUri = finalUri.replace(/(mongodb\+?srv?:\/\/[^\/]+)(\/[^?]*)?(\?.*)$/, (match, base, db, query) => {
            return `${base}/ebaymonitor${query}`;
          });
        } else {
          finalUri = finalUri.replace(/(mongodb\+?srv?:\/\/[^\/]+)(\/[^?]*)?$/, (match, base, db) => {
            return `${base}/ebaymonitor?retryWrites=true&w=majority`;
          });
        }
      }
    }

    await mongoose.connect(finalUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 20000,
      serverSelectionTimeoutMS: 20000,
    });
    
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    process.exit(1);
  }
};

const seedDemoUser = async () => {
  try {
    // Check if user with email "demo@ebaymonitor.com" exists
    const existingUser = await User.findOne({ email: 'demo@ebaymonitor.com' });
    
    if (existingUser) {
      console.log('ℹ️  Demo user already exists');
      await mongoose.connection.close();
      process.exit(0);
    }

    // Create demo user
    const user = await User.create({
      name: 'Demo User',
      email: 'demo@ebaymonitor.com',
      passwordHash: 'demo123', // Will be hashed by pre-save hook
      role: 'user'
    });

    console.log('DEMO USER CREATED SUCCESSFULLY');
    console.log(`Email: ${user.email}`);
    console.log(`Name: ${user.name}`);
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating demo user:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
};

// Run seed
connectDB().then(() => {
  seedDemoUser();
});

