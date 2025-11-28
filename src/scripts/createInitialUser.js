const bcrypt = require('bcryptjs');
const User = require('../models/User');

const ADMIN_EMAIL = process.env.INIT_ADMIN_EMAIL || 'admin@system.com';
const ADMIN_PASSWORD = process.env.INIT_ADMIN_PASSWORD || 'Admin@123';

const createInitialUser = async () => {
  try {
    const existing = await User.findOne({ email: ADMIN_EMAIL });
    if (existing) {
      console.log('✔ Initial user already exists');
      return existing;
    }

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    const user = await User.findOneAndUpdate(
      { email: ADMIN_EMAIL },
      {
        name: 'Admin User',
        email: ADMIN_EMAIL,
        passwordHash,
        role: 'admin'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log('✔ Initial admin user created:');
    console.log(`Email: ${ADMIN_EMAIL}`);
    console.log(`Password: ${ADMIN_PASSWORD}`);

    return user;
  } catch (err) {
    console.error('❌ Failed to create initial user:', err);
    return null;
  }
};

module.exports = { createInitialUser };


