const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: [
      'price_increase',
      'price_decrease',
      'out_of_stock',
      'back_in_stock',
      'supplier_unavailable',
      'supplier_available',
      'low_stock',
      'competitor_price'
    ],
    required: true
  },
  oldValue: {
    type: mongoose.Schema.Types.Mixed
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed
  },
  message: {
    type: String,
    required: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  read: {
    type: Boolean,
    default: false
  },
  emailSent: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Index for efficient queries
alertSchema.index({ productId: 1, createdAt: -1 });
alertSchema.index({ read: 1, createdAt: -1 });

module.exports = mongoose.model('Alert', alertSchema);

