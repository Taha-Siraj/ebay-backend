const Settings = require('../models/Settings');
const { restartUserCron } = require('../services/cronService');
const { sendTestEmail } = require('../services/emailService');

// @desc    Get user settings
// @route   GET /api/settings
// @access  Private
exports.getSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne({ userId: req.user._id });

    // Create default settings if not exists
    if (!settings) {
      settings = await Settings.create({ userId: req.user._id });
    }

    res.status(200).json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching settings'
    });
  }
};

// @desc    Update user settings
// @route   PUT /api/settings
// @access  Private
exports.updateSettings = async (req, res) => {
  try {
    const {
      monitoringFrequency,
      emailAlerts,
      alertTypes,
      priceChangeThreshold,
      webhookUrl
    } = req.body;

    // Validate monitoring frequency
    if (monitoringFrequency !== undefined) {
      if (monitoringFrequency < 15 || monitoringFrequency > 1440) {
        return res.status(400).json({
          success: false,
          message: 'Monitoring frequency must be between 15 and 1440 minutes'
        });
      }
    }

    if (webhookUrl !== undefined && webhookUrl !== '') {
      try {
        new URL(webhookUrl);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Webhook URL must be a valid URL'
        });
      }
    }

    // Validate price change threshold
    if (priceChangeThreshold !== undefined) {
      if (priceChangeThreshold < 0 || priceChangeThreshold > 100) {
        return res.status(400).json({
          success: false,
          message: 'Price change threshold must be between 0 and 100 percent'
        });
      }
    }

    let settings = await Settings.findOne({ userId: req.user._id });
    const wasNew = !settings;
    const frequencyChanged = settings && monitoringFrequency !== undefined && 
                            settings.monitoringFrequency !== monitoringFrequency;

    if (!settings) {
      settings = await Settings.create({
        userId: req.user._id,
        ...req.body
      });
    } else {
      if (monitoringFrequency !== undefined) {
        settings.monitoringFrequency = monitoringFrequency;
      }
      if (emailAlerts !== undefined) {
        settings.emailAlerts = emailAlerts;
      }
      if (alertTypes !== undefined) {
        settings.alertTypes = { ...settings.alertTypes, ...alertTypes };
      }
      if (priceChangeThreshold !== undefined) {
        settings.priceChangeThreshold = priceChangeThreshold;
      }
      if (webhookUrl !== undefined) {
        settings.webhookUrl = webhookUrl || '';
      }

      await settings.save();
    }

    // Restart cron for this user if monitoring frequency changed
    if (frequencyChanged || wasNew) {
      console.log('Monitoring frequency changed, restarting cron for user');
      await restartUserCron(req.user._id);
    }

    res.status(200).json({
      success: true,
      data: settings,
      message: 'Settings updated successfully'
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating settings'
    });
  }
};

// @desc    Send test email
// @route   POST /api/settings/test-email
// @access  Private
exports.sendTestEmail = async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const emailSent = await sendTestEmail(user.email);

    if (emailSent) {
      res.status(200).json({
        success: true,
        message: `Test email sent successfully to ${user.email}`
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send test email. Please check your SMTP configuration.'
      });
    }
  } catch (error) {
    console.error('Send test email error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending test email'
    });
  }
};

