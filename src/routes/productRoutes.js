const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProduct,
  addProduct,
  updateProduct,
  deleteProduct,
  syncProduct,
  exportProducts,
  bulkDeleteProducts,
  bulkSyncProducts
} = require('../controllers/productController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(getProducts)
  .post(addProduct);

router.get('/export', exportProducts);

// Bulk operations
router.delete('/bulk', bulkDeleteProducts);
router.post('/bulk-sync', bulkSyncProducts);

router.route('/:id')
  .get(getProduct)
  .put(updateProduct)
  .delete(deleteProduct);

router.post('/:id/sync', syncProduct);

module.exports = router;

