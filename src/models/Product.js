const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Product title is required'],
    trim: true
  },
  ebayUrl: {
    type: String,
    required: [true, 'eBay URL is required'],
    trim: true
  },
  ebayItemId: {
    type: String,
    required: true,
    trim: true
  },
  ebayPrice: {
    type: Number,
    default: 0
  },
  supplierUrl: {
    type: String,
    trim: true
  },
  supplierPrice: {
    type: Number,
    default: 0
  },
  stockStatus: {
    type: String,
    enum: ['in_stock', 'out_of_stock', 'low_stock', 'unknown'],
    default: 'unknown'
  },
  supplierStockStatus: {
    type: String,
    enum: ['in_stock', 'out_of_stock', 'low_stock', 'unknown'],
    default: 'unknown'
  },
  lastCheckedAt: {
    type: Date,
    default: Date.now
  },
  images: {
    type: [String],
    default: []
  },
  tags: [{
    type: String,
    trim: true
  }],
  notes: {
    type: String,
    trim: true
  },
  minPriceThreshold: {
    type: Number,
    default: 0
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  profit: {
    type: Number,
    default: 0
  },
  profitMargin: {
    type: Number,
    default: 0
  },
  competitorListings: {
    type: [
      {
        sellerName: String,
        price: Number,
        shippingCost: Number,
        location: String,
        listingId: String,
        url: String,
        feedbackScore: Number,
        lastSeenAt: {
          type: Date,
          default: Date.now
        },
        _id: false
      }
    ],
    default: []
  },
  competitorStats: {
    type: {
      lowestPrice: Number,
      sellerName: String,
      listingId: String,
      url: String,
      totalSellers: {
        type: Number,
        default: 0
      },
      differenceToOurPrice: Number,
      lastCheckedAt: Date
    },
    default: undefined,
    _id: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamps
productSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Calculate profit and margin
productSchema.methods.calculateProfit = function() {
  if (this.ebayPrice && this.supplierPrice) {
    this.profit = this.ebayPrice - this.supplierPrice;
    const margin = (this.profit / this.ebayPrice) * 100;
    this.profitMargin = Number.isFinite(margin) ? Number(margin.toFixed(2)) : 0;
  }
};

// Compound index: ebayItemId should be unique per user
productSchema.index({ userId: 1, ebayItemId: 1 }, { unique: true });

module.exports = mongoose.model('Product', productSchema);

