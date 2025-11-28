const importService = require('../services/importService');

// @desc    Import all listings from an eBay store
// @route   POST /api/import/store
// @access  Private
exports.importStore = async (req, res) => {
  try {
    const { storeUrl } = req.body;

    // Validation
    if (!storeUrl) {
      return res.status(400).json({
        success: false,
        message: 'Store URL is required'
      });
    }

    // Validate eBay URL
    if (!storeUrl.includes('ebay.co.uk') && !storeUrl.includes('ebay.com')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid eBay store URL'
      });
    }

    console.log(`Starting store import for user ${req.user._id}: ${storeUrl}`);

    // Import store listings
    const results = await importService.importStoreListings(storeUrl, req.user._id);

    res.status(200).json({
      success: true,
      message: `Store import completed successfully`,
      imported: results.imported,
      updated: results.updated,
      total: results.total,
      supplierMapped: results.supplierMapped,
      competitorSynced: results.competitorSynced,
      items: results.total > 0 ? results.total : 0,
      data: results
    });
  } catch (error) {
    console.error('Import store error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error importing store',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

