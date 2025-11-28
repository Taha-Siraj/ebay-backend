const express = require('express');
const router = express.Router();
const {
  getAlerts,
  markAlertRead,
  markAllAlertsRead,
  deleteAlert,
  exportAlerts,
  bulkMarkAlertsRead,
  bulkDeleteAlerts
} = require('../controllers/alertController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', getAlerts);
router.get('/export', exportAlerts);
router.put('/read-all', markAllAlertsRead);

// Bulk operations
router.put('/bulk-read', bulkMarkAlertsRead);
router.delete('/bulk', bulkDeleteAlerts);

router.put('/:id/read', markAlertRead);
router.delete('/:id', deleteAlert);

module.exports = router;

