const Product = require('../models/Product');
const PriceHistory = require('../models/PriceHistory');
const ebayAdapter = require('../adapters/ebayAdapter');
const supplierAdapter = require('../adapters/supplierAdapter');

// @desc    Get all products with search, filtering, and pagination
// @route   GET /api/products
// @access  Private
exports.getProducts = async (req, res) => {
  try {
    const {
      search,
      stockStatus,
      supplier,
      hasAlerts,
      minPrice,
      maxPrice,
      minMargin,
      maxMargin,
      supplierStock,
      syncedFrom,
      syncedTo,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = { userId: req.user._id };

    // Search by title
    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }

    // Filter by eBay stock status
    if (stockStatus) {
      query.stockStatus = stockStatus;
    }

    // Filter by price range
    if (minPrice || maxPrice) {
      query.ebayPrice = {};
      if (minPrice) query.ebayPrice.$gte = parseFloat(minPrice);
      if (maxPrice) query.ebayPrice.$lte = parseFloat(maxPrice);
    }

    // Filter by profit margin range
    if (minMargin || maxMargin) {
      query.profitMargin = {};
      if (minMargin) query.profitMargin.$gte = parseFloat(minMargin);
      if (maxMargin) query.profitMargin.$lte = parseFloat(maxMargin);
    }

    // Filter by supplier stock status
    if (supplierStock) {
      query.supplierStockStatus = supplierStock;
    }

    // Filter by last synced date range
    if (syncedFrom || syncedTo) {
      query.lastCheckedAt = {};
      if (syncedFrom) query.lastCheckedAt.$gte = new Date(syncedFrom);
      if (syncedTo) query.lastCheckedAt.$lte = new Date(syncedTo);
    }

    // Filter by supplier (has supplier URL)
    if (supplier === 'true') {
      query.supplierUrl = { $exists: true, $ne: '' };
    } else if (supplier === 'false') {
      query.$or = [
        { supplierUrl: { $exists: false } },
        { supplierUrl: '' }
      ];
    }

    // Filter by alerts (products with unread alerts)
    if (hasAlerts === 'true') {
      const Alert = require('../models/Alert');
      const userProducts = await Product.find({ userId: req.user._id }).select('_id');
      const productIds = userProducts.map(p => p._id);
      
      const alerts = await Alert.find({
        productId: { $in: productIds },
        read: false
      }).distinct('productId');
      
      query._id = { $in: alerts };
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const products = await Product.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination
    const total = await Product.countDocuments(query);

    res.status(200).json({
      success: true,
      count: products.length,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      data: products
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products'
    });
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Private
exports.getProduct = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Get price history
    const priceHistory = await PriceHistory.find({
      productId: product._id
    }).sort({ checkedAt: -1 }).limit(100);

    res.status(200).json({
      success: true,
      data: {
        product,
        priceHistory
      }
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching product'
    });
  }
};

// @desc    Add product
// @route   POST /api/products
// @access  Private
exports.addProduct = async (req, res) => {
  try {
    const { ebayUrl, supplierUrl } = req.body;

    if (!ebayUrl) {
      return res.status(400).json({
        success: false,
        message: 'eBay URL is required'
      });
    }

    // Basic URL validation
    try {
      new URL(ebayUrl);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid eBay URL format'
      });
    }

    // Check if it's an eBay URL
    if (!ebayUrl.includes('ebay.com') && !ebayUrl.includes('ebay.co.uk') && !ebayUrl.includes('ebay.ca')) {
      return res.status(400).json({
        success: false,
        message: 'URL must be from eBay domain'
      });
    }

    if (supplierUrl) {
      try {
        new URL(supplierUrl);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid supplier URL format'
        });
      }
    }

    // Fetch eBay data
    let ebayData;
    try {
      ebayData = await ebayAdapter.fetchEbayItem(ebayUrl);
    } catch (error) {
      console.error('Error fetching eBay product data:', error.message);
      return res.status(400).json({
        success: false,
        message: `Could not fetch eBay product data: ${error.message}`
      });
    }

    if (!ebayData) {
      return res.status(400).json({
        success: false,
        message: 'Could not fetch eBay product data'
      });
    }

    // Check if product already exists
    const existingProduct = await Product.findOne({
      ebayItemId: ebayData.itemId,
      userId: req.user._id
    });

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: 'Product already exists in your monitoring list'
      });
    }

    // Fetch supplier data if URL provided
    let supplierData = null;
    if (supplierUrl) {
      supplierData = await supplierAdapter.fetchSupplierData(supplierUrl);
    }

    // Create product
    const productData = {
      title: ebayData.title,
      ebayUrl,
      ebayItemId: ebayData.itemId,
      ebayPrice: ebayData.price,
      stockStatus: ebayData.stock,
      images: ebayData.images,
      userId: req.user._id
    };

    if (supplierData) {
      productData.supplierUrl = supplierUrl;
      productData.supplierPrice = supplierData.price;
      productData.supplierStockStatus = supplierData.stock;
    }

    const product = await Product.create(productData);

    // Calculate profit
    product.calculateProfit();
    await product.save();

    // Create initial price history entries
    await PriceHistory.create({
      productId: product._id,
      source: 'ebay',
      price: ebayData.price,
      stock: ebayData.stock
    });

    if (supplierData) {
      await PriceHistory.create({
        productId: product._id,
        source: 'supplier',
        price: supplierData.price,
        stock: supplierData.stock
      });
    }

    res.status(201).json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Add product error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error adding product'
    });
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    await product.deleteOne();

    // Delete associated price history
    await PriceHistory.deleteMany({ productId: product._id });

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting product'
    });
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private
exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const { title, ebayUrl, supplierUrl, tags, notes, minPriceThreshold, isActive } = req.body;

    // Update allowed fields
    if (title !== undefined) product.title = title;
    if (tags !== undefined) product.tags = tags;
    if (notes !== undefined) product.notes = notes;
    if (minPriceThreshold !== undefined) product.minPriceThreshold = minPriceThreshold;
    if (isActive !== undefined) product.isActive = isActive;

    // Handle URL updates - if URLs change, fetch new data
    if (ebayUrl && ebayUrl !== product.ebayUrl) {
      const ebayData = await ebayAdapter.fetchEbayItem(ebayUrl);
      if (ebayData) {
        product.ebayUrl = ebayUrl;
        product.ebayItemId = ebayData.itemId;
        product.ebayPrice = ebayData.price;
        product.stockStatus = ebayData.stock;
        if (ebayData.title) product.title = ebayData.title;
        if (ebayData.images && ebayData.images.length > 0) {
          product.images = ebayData.images;
        }
      }
    }

    if (supplierUrl !== undefined) {
      if (supplierUrl && supplierUrl !== product.supplierUrl) {
        const supplierData = await supplierAdapter.fetchSupplierData(supplierUrl);
        if (supplierData) {
          product.supplierUrl = supplierUrl;
          product.supplierPrice = supplierData.price;
          product.supplierStockStatus = supplierData.stock;
        }
      } else if (!supplierUrl) {
        // Remove supplier URL
        product.supplierUrl = '';
        product.supplierPrice = 0;
        product.supplierStockStatus = 'unknown';
      }
    }

    // Recalculate profit
    product.calculateProfit();
    await product.save();

    res.status(200).json({
      success: true,
      data: product,
      message: 'Product updated successfully'
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating product'
    });
  }
};

// @desc    Export products as CSV or JSON
// @route   GET /api/products/export
// @access  Private
exports.exportProducts = async (req, res) => {
  try {
    const { format = 'json' } = req.query;
    
    const products = await Product.find({ userId: req.user._id })
      .sort({ createdAt: -1 });

    if (format === 'csv') {
      // Generate CSV
      const headers = ['Title', 'eBay URL', 'eBay Price', 'Supplier URL', 'Supplier Price', 'Profit', 'Profit Margin', 'Stock Status', 'Supplier Stock', 'Last Checked', 'Created At'];
      const rows = products.map(p => [
        p.title,
        p.ebayUrl,
        p.ebayPrice,
        p.supplierUrl || '',
        p.supplierPrice || 0,
        p.profit || 0,
        p.profitMargin || 0,
        p.stockStatus,
        p.supplierStockStatus || 'unknown',
        p.lastCheckedAt ? new Date(p.lastCheckedAt).toISOString() : '',
        p.createdAt ? new Date(p.createdAt).toISOString() : ''
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=products-${Date.now()}.csv`);
      res.send(csv);
    } else {
      // Return JSON
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=products-${Date.now()}.json`);
      res.json({
        success: true,
        count: products.length,
        exportedAt: new Date().toISOString(),
        data: products
      });
    }
  } catch (error) {
    console.error('Export products error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting products'
    });
  }
};

// @desc    Sync product manually
// @route   POST /api/products/:id/sync
// @access  Private
exports.syncProduct = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Fetch latest eBay data
    const ebayData = await ebayAdapter.fetchEbayItem(product.ebayUrl);

    if (ebayData) {
      product.ebayPrice = ebayData.price;
      product.stockStatus = ebayData.stock;
      product.title = ebayData.title;
      product.images = ebayData.images;

      await PriceHistory.create({
        productId: product._id,
        source: 'ebay',
        price: ebayData.price,
        stock: ebayData.stock
      });
    }

    // Fetch latest supplier data if URL exists
    if (product.supplierUrl) {
      const supplierData = await supplierAdapter.fetchSupplierData(product.supplierUrl);

      if (supplierData) {
        product.supplierPrice = supplierData.price;
        product.supplierStockStatus = supplierData.stock;

        await PriceHistory.create({
          productId: product._id,
          source: 'supplier',
          price: supplierData.price,
          stock: supplierData.stock
        });
      }
    }

    product.lastCheckedAt = Date.now();
    product.calculateProfit();
    await product.save();

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Sync product error:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing product'
    });
  }
};

// @desc    Bulk delete products
// @route   DELETE /api/products/bulk
// @access  Private
exports.bulkDeleteProducts = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of product IDs'
      });
    }

    // Delete products and their associated data
    const result = await Product.deleteMany({
      _id: { $in: ids },
      userId: req.user._id
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'No products found to delete'
      });
    }

    // Delete associated price history
    await PriceHistory.deleteMany({
      productId: { $in: ids }
    });

    // Delete associated alerts
    const Alert = require('../models/Alert');
    await Alert.deleteMany({
      productId: { $in: ids }
    });

    res.status(200).json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} product(s)`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Bulk delete products error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting products'
    });
  }
};

// @desc    Bulk sync products
// @route   POST /api/products/bulk-sync
// @access  Private
exports.bulkSyncProducts = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of product IDs'
      });
    }

    const products = await Product.find({
      _id: { $in: ids },
      userId: req.user._id
    });

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No products found'
      });
    }

    let successCount = 0;
    let errorCount = 0;

    for (const product of products) {
      try {
        // Fetch latest eBay data
        const ebayData = await ebayAdapter.fetchEbayItem(product.ebayUrl);

        if (ebayData) {
          product.ebayPrice = ebayData.price;
          product.stockStatus = ebayData.stock;
          product.title = ebayData.title;
          product.images = ebayData.images;

          await PriceHistory.create({
            productId: product._id,
            source: 'ebay',
            price: ebayData.price,
            stock: ebayData.stock
          });
        }

        // Fetch latest supplier data if URL exists
        if (product.supplierUrl) {
          const supplierData = await supplierAdapter.fetchSupplierData(product.supplierUrl);

          if (supplierData) {
            product.supplierPrice = supplierData.price;
            product.supplierStockStatus = supplierData.stock;

            await PriceHistory.create({
              productId: product._id,
              source: 'supplier',
              price: supplierData.price,
              stock: supplierData.stock
            });
          }
        }

        product.lastCheckedAt = Date.now();
        product.calculateProfit();
        await product.save();

        successCount++;

        // Add small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error syncing product ${product._id}:`, error.message);
        errorCount++;
      }
    }

    res.status(200).json({
      success: true,
      message: `Synced ${successCount} product(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
      successCount,
      errorCount
    });
  } catch (error) {
    console.error('Bulk sync products error:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing products'
    });
  }
};

