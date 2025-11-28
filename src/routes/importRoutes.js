const express = require('express');
const router = express.Router();
const { importStore } = require('../controllers/importController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// @route   POST /api/import/store
// @desc    Import all listings from an eBay store
// @access  Private
router.post('/store', importStore);

module.exports = router;

