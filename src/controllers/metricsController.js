const Product = require('../models/Product');
const Alert = require('../models/Alert');
const PriceHistory = require('../models/PriceHistory');

// @desc    Get dashboard metrics
// @route   GET /api/metrics
// @access  Private
exports.getMetrics = async (req, res) => {
  try {
    // Get user's products
    const products = await Product.find({ userId: req.user._id });
    const productIds = products.map(p => p._id);

    // Total products
    const totalProducts = products.length;

    // Out of stock count
    const outOfStock = products.filter(p => 
      p.stockStatus === 'out_of_stock' || p.supplierStockStatus === 'out_of_stock'
    ).length;

    // Total alerts
    const totalAlerts = await Alert.countDocuments({
      productId: { $in: productIds }
    });

    // Unread alerts
    const unreadAlerts = await Alert.countDocuments({
      productId: { $in: productIds },
      read: false
    });

    // Price changes in last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentPriceChanges = await Alert.countDocuments({
      productId: { $in: productIds },
      type: { $in: ['price_increase', 'price_decrease'] },
      createdAt: { $gte: yesterday }
    });

    // Total profit
    const totalProfit = products.reduce((sum, p) => sum + (p.profit || 0), 0);

    // Average profit margin
    const avgProfitMargin = products.length > 0
      ? products.reduce((sum, p) => sum + (parseFloat(p.profitMargin) || 0), 0) / products.length
      : 0;

    // Active monitoring count
    const activeMonitoring = products.filter(p => p.isActive).length;

    // Recent alerts by type
    const alertsByType = await Alert.aggregate([
      {
        $match: {
          productId: { $in: productIds },
          createdAt: { $gte: yesterday }
        }
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]);

    // Stock status distribution
    const stockDistribution = {
      in_stock: products.filter(p => p.stockStatus === 'in_stock').length,
      out_of_stock: products.filter(p => p.stockStatus === 'out_of_stock').length,
      low_stock: products.filter(p => p.stockStatus === 'low_stock').length,
      unknown: products.filter(p => p.stockStatus === 'unknown').length
    };

    res.status(200).json({
      success: true,
      data: {
        totalProducts,
        outOfStock,
        totalAlerts,
        unreadAlerts,
        recentPriceChanges,
        totalProfit: totalProfit.toFixed(2),
        avgProfitMargin: avgProfitMargin.toFixed(2),
        activeMonitoring,
        alertsByType,
        stockDistribution
      }
    });
  } catch (error) {
    console.error('Get metrics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching metrics'
    });
  }
};

