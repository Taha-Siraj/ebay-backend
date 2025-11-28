const express = require('express');
const router = express.Router();
const {
  getSettings,
  updateSettings,
  sendTestEmail
} = require('../controllers/settingsController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(getSettings)
  .put(updateSettings);

router.post('/test-email', sendTestEmail);

module.exports = router;

