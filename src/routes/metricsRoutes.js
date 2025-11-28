const express = require('express');
const router = express.Router();
const { getMetrics } = require('../controllers/metricsController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', getMetrics);

module.exports = router;

