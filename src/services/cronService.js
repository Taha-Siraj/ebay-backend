const cron = require('node-cron');
const { checkProductsForUser } = require('./monitoringService');
const Settings = require('../models/Settings');
const User = require('../models/User');

/**
 * Cron Service
 * Manages per-user cron schedules based on individual monitoring frequencies
 * Removed global MONITOR_FREQUENCY - now uses Settings model per user
 */

// Store active cron jobs per user
const userCronJobs = new Map();

const ensureUserSettings = async (userId) => {
  let settings = await Settings.findOne({ userId });
  if (!settings) {
    settings = await Settings.create({ userId });
  }
  return settings;
};

/**
 * Convert monitoring frequency (minutes) to cron expression
 * Minimum frequency: 15 minutes
 */
const frequencyToCron = (frequencyMinutes) => {
  // Ensure minimum of 15 minutes
  const minutes = Math.max(15, frequencyMinutes);
  
  // If frequency is less than 60 minutes, use */X format
  if (minutes < 60) {
    return `*/${minutes} * * * *`;
  }
  
  // If frequency is less than 24 hours, use hourly format
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `0 */${hours} * * *`;
  }
  
  // For daily or longer, run once per day at midnight
  return '0 0 * * *';
};

/**
 * Create or update cron job for a specific user
 */
const createUserCron = async (userId, settings) => {
  // Stop existing cron if any
  if (userCronJobs.has(userId)) {
    userCronJobs.get(userId).stop();
    userCronJobs.delete(userId);
  }

  const resolvedSettings = settings || await ensureUserSettings(userId);

  // Get monitoring frequency from settings
  const monitoringFrequency = resolvedSettings?.monitoringFrequency || 30; // Default 30 minutes
  const cronExpression = frequencyToCron(monitoringFrequency);

  // Reduced logging - only log on creation
  if (process.env.NODE_ENV === 'development') {
    console.log(`Creating cron job for user ${userId} with frequency ${monitoringFrequency} minutes`);
  }

  // Create new cron job
  const cronJob = cron.schedule(cronExpression, async () => {
    // Reduced logging - only log errors
    try {
      const user = await User.findById(userId);
      if (user) {
        const userSettings = await ensureUserSettings(userId);
        await checkProductsForUser(user, userSettings);
      }
    } catch (error) {
      console.error(`Cron job error for user ${userId}:`, error);
    }
  }, {
    scheduled: false // Don't start immediately
  });

  // Start the cron job
  cronJob.start();
  userCronJobs.set(userId, cronJob);

  return cronJob;
};

/**
 * Initialize cron jobs for all users
 */
const initializeCronJobs = async () => {
  try {
    console.log('Initializing user-specific cron jobs...');
    
    // Get all users with settings
    const users = await User.find({});
    
    for (const user of users) {
      await createUserCron(user._id);
    }

    console.log(`Initialized ${userCronJobs.size} user cron jobs`);
  } catch (error) {
    console.error('Error initializing cron jobs:', error);
  }
};

/**
 * Start cron system
 * Initializes cron jobs for all users
 */
const startCron = async () => {
  await initializeCronJobs();
  
  // Run initial check after 5 seconds (only if DB is connected)
  setTimeout(async () => {
    console.log('Running initial product check for all users...');
    try {
      // checkProductsForUser() without params checks all users
      const result = await checkProductsForUser();
      if (result) {
        console.log(`Initial check complete. Checked: ${result.checked || 0}, Skipped: ${result.skipped || 0}`);
      }
    } catch (error) {
      console.error('Initial check error:', error);
      // Don't crash the server if initial check fails
    }
  }, 5000);
};

/**
 * Stop all cron jobs
 */
const stopCron = () => {
  userCronJobs.forEach((cronJob, userId) => {
    cronJob.stop();
    console.log(`Stopped cron job for user ${userId}`);
  });
  userCronJobs.clear();
  console.log('All cron jobs stopped');
};

/**
 * Restart cron for a specific user (when settings change)
 */
const restartUserCron = async (userId) => {
  try {
    await createUserCron(userId);
    console.log(`Restarted cron job for user ${userId}`);
  } catch (error) {
    console.error(`Error restarting cron for user ${userId}:`, error);
  }
};

/**
 * Restart all cron jobs
 */
const restartCron = async () => {
  stopCron();
  await initializeCronJobs();
  console.log('All cron jobs restarted');
};

module.exports = {
  startCron,
  stopCron,
  restartCron,
  restartUserCron,
  createUserCron
};

