const Alert = require('../models/Alert');
const Product = require('../models/Product');

// @desc    Get all alerts with search, filtering, and pagination
// @route   GET /api/alerts
// @access  Private
exports.getAlerts = async (req, res) => {
  try {
    const {
      read,
      type,
      severity,
      productId,
      fromDate,
      toDate,
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = {};
    
    // Get user's products
    const userProducts = await Product.find({ userId: req.user._id }).select('_id');
    const productIds = userProducts.map(p => p._id);
    
    query.productId = { $in: productIds };

    // Filter by specific product
    if (productId) {
      query.productId = productId;
    }

    // Filter by read status
    if (read !== undefined) {
      query.read = read === 'true';
    }

    // Filter by alert type
    if (type) {
      query.type = type;
    }

    // Filter by severity
    if (severity) {
      query.severity = severity;
    }

    // Filter by date range
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const alerts = await Alert.find(query)
      .populate('productId', 'title ebayUrl images')
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination
    const total = await Alert.countDocuments(query);

    // Count unread alerts
    const unreadCount = await Alert.countDocuments({
      productId: { $in: productIds },
      read: false
    });

    res.status(200).json({
      success: true,
      count: alerts.length,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      unreadCount,
      data: alerts
    });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching alerts'
    });
  }
};

// @desc    Mark alert as read
// @route   PUT /api/alerts/:id/read
// @access  Private
exports.markAlertRead = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id).populate('productId');

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    // Check if user owns the product
    if (alert.productId.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    alert.read = true;
    await alert.save();

    res.status(200).json({
      success: true,
      data: alert
    });
  } catch (error) {
    console.error('Mark alert read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating alert'
    });
  }
};

// @desc    Mark all alerts as read
// @route   PUT /api/alerts/read-all
// @access  Private
exports.markAllAlertsRead = async (req, res) => {
  try {
    // Get user's products
    const userProducts = await Product.find({ userId: req.user._id }).select('_id');
    const productIds = userProducts.map(p => p._id);

    await Alert.updateMany(
      { productId: { $in: productIds }, read: false },
      { read: true }
    );

    res.status(200).json({
      success: true,
      message: 'All alerts marked as read'
    });
  } catch (error) {
    console.error('Mark all alerts read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating alerts'
    });
  }
};

// @desc    Export alerts as CSV or JSON
// @route   GET /api/alerts/export
// @access  Private
exports.exportAlerts = async (req, res) => {
  try {
    const { format = 'json' } = req.query;
    
    // Get user's products
    const userProducts = await Product.find({ userId: req.user._id }).select('_id');
    const productIds = userProducts.map(p => p._id);
    
    const alerts = await Alert.find({ productId: { $in: productIds } })
      .populate('productId', 'title ebayUrl')
      .sort({ createdAt: -1 });

    if (format === 'csv') {
      // Generate CSV
      const headers = ['Type', 'Severity', 'Message', 'Old Value', 'New Value', 'Product Title', 'Read', 'Created At'];
      const rows = alerts.map(a => [
        a.type,
        a.severity,
        a.message,
        a.oldValue || '',
        a.newValue || '',
        a.productId?.title || 'N/A',
        a.read ? 'Yes' : 'No',
        a.createdAt ? new Date(a.createdAt).toISOString() : ''
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=alerts-${Date.now()}.csv`);
      res.send(csv);
    } else {
      // Return JSON
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=alerts-${Date.now()}.json`);
      res.json({
        success: true,
        count: alerts.length,
        exportedAt: new Date().toISOString(),
        data: alerts
      });
    }
  } catch (error) {
    console.error('Export alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting alerts'
    });
  }
};

// @desc    Delete alert
// @route   DELETE /api/alerts/:id
// @access  Private
exports.deleteAlert = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id).populate('productId');

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    // Check if user owns the product
    if (alert.productId.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    await alert.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Alert deleted successfully'
    });
  } catch (error) {
    console.error('Delete alert error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting alert'
    });
  }
};

// @desc    Bulk mark alerts as read
// @route   PUT /api/alerts/bulk-read
// @access  Private
exports.bulkMarkAlertsRead = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of alert IDs'
      });
    }

    // Get user's products to verify ownership
    const userProducts = await Product.find({ userId: req.user._id }).select('_id');
    const productIds = userProducts.map(p => p._id);

    // Update alerts that belong to user's products
    const result = await Alert.updateMany(
      {
        _id: { $in: ids },
        productId: { $in: productIds }
      },
      { read: true }
    );

    res.status(200).json({
      success: true,
      message: `Marked ${result.modifiedCount} alert(s) as read`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Bulk mark alerts read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking alerts as read'
    });
  }
};

// @desc    Bulk delete alerts
// @route   DELETE /api/alerts/bulk
// @access  Private
exports.bulkDeleteAlerts = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of alert IDs'
      });
    }

    // Get user's products to verify ownership
    const userProducts = await Product.find({ userId: req.user._id }).select('_id');
    const productIds = userProducts.map(p => p._id);

    // Delete alerts that belong to user's products
    const result = await Alert.deleteMany({
      _id: { $in: ids },
      productId: { $in: productIds }
    });

    res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} alert(s)`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Bulk delete alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting alerts'
    });
  }
};

