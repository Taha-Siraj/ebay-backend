const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  monitoringFrequency: {
    type: Number,
    default: 30,
    min: 15,
    max: 1440
  },
  emailAlerts: {
    type: Boolean,
    default: true
  },
  webhookUrl: {
    type: String,
    trim: true
  },
  alertTypes: {
    priceIncrease: {
      type: Boolean,
      default: true
    },
    priceDecrease: {
      type: Boolean,
      default: true
    },
    outOfStock: {
      type: Boolean,
      default: true
    },
    supplierUnavailable: {
      type: Boolean,
      default: true
    },
    lowStock: {
      type: Boolean,
      default: true
    },
    competitorPrice: {
      type: Boolean,
      default: true
    }
  },
  priceChangeThreshold: {
    type: Number,
    default: 5,
    min: 0,
    max: 100
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp
settingsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Settings', settingsSchema);

