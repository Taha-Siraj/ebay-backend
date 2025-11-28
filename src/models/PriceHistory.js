const mongoose = require('mongoose');

const priceHistorySchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },
  source: {
    type: String,
    enum: ['ebay', 'supplier', 'competitor'],
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  stock: {
    type: String,
    enum: ['in_stock', 'out_of_stock', 'low_stock', 'unknown'],
    default: 'unknown'
  },
  checkedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Index for efficient queries
priceHistorySchema.index({ productId: 1, checkedAt: -1 });

module.exports = mongoose.model('PriceHistory', priceHistorySchema);

