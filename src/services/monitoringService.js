const Product = require('../models/Product');
const PriceHistory = require('../models/PriceHistory');
const Alert = require('../models/Alert');
const User = require('../models/User');
const Settings = require('../models/Settings');
const ebayAdapter = require('../adapters/ebayAdapter');
const supplierAdapter = require('../adapters/supplierAdapter');
const { sendAlertEmail } = require('./emailService');
const { fetchCompetitorInsights } = require('./competitorService');
const { sendAlertWebhook } = require('./webhookService');

/**
 * Monitoring Service
 * Checks products for price and stock changes
 */

/**
 * Create alert
 */
const createAlert = async (product, type, oldValue, newValue, message, severity = 'medium') => {
  try {
    const alert = await Alert.create({
      productId: product._id,
      type,
      oldValue,
      newValue,
      message,
      severity
    });

    // Get user settings
    const settings = await Settings.findOne({ userId: product.userId });
    const user = await User.findById(product.userId);

    // Send email if enabled
    if (settings && settings.emailAlerts && user) {
      const emailSent = await sendAlertEmail(user.email, alert, product);
      if (emailSent) {
        alert.emailSent = true;
        await alert.save();
      }
    }

    if (settings?.webhookUrl) {
      await sendAlertWebhook(settings.webhookUrl, alert, product);
    }

    return alert;
  } catch (error) {
    console.error('Create alert error:', error);
    return null;
  }
};

/**
 * Check single product
 * @param {Object} product - Product to check
 * @param {Object} settings - User settings (optional, will fetch if not provided)
 */
const checkProduct = async (product, settings = null) => {
  try {
    // Reduced logging - only log in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`Checking product: ${product.title}`);
    }

    // Get settings if not provided
    if (!settings) {
      settings = await Settings.findOne({ userId: product.userId });
      if (!settings) {
        settings = await Settings.create({ userId: product.userId });
      }
    }

    // Use user's price change threshold or default
    const priceChangeThreshold = settings?.priceChangeThreshold || process.env.PRICE_CHANGE_THRESHOLD || 5;
    const competitorAlertPercent = Number(process.env.COMPETITOR_PRICE_ALERT_PERCENT || 3);

    const oldEbayPrice = product.ebayPrice;
    const oldEbayStock = product.stockStatus;
    const oldSupplierPrice = product.supplierPrice;
    const oldSupplierStock = product.supplierStockStatus;

    let hasChanges = false;

    // Fetch eBay data
    try {
      const ebayData = await ebayAdapter.fetchEbayItem(product.ebayUrl);

      if (ebayData) {
        // Check for price changes
        if (ebayData.price !== oldEbayPrice && oldEbayPrice > 0) {
          const percentChange = ((ebayData.price - oldEbayPrice) / oldEbayPrice) * 100;

          // Use user's threshold
          if (Math.abs(percentChange) >= priceChangeThreshold) {
            // Check if user wants this alert type
            const alertType = ebayData.price > oldEbayPrice ? 'priceIncrease' : 'priceDecrease';
            const shouldAlert = !settings || !settings.alertTypes || settings.alertTypes[alertType] !== false;

            if (shouldAlert) {
              const type = ebayData.price > oldEbayPrice ? 'price_increase' : 'price_decrease';
              const severity = Math.abs(percentChange) > 10 ? 'high' : 'medium';

              await createAlert(
                product,
                type,
                oldEbayPrice,
                ebayData.price,
                `eBay price changed from GBP ${oldEbayPrice} to GBP ${ebayData.price} (${percentChange.toFixed(1)}%)`,
                severity
              );
            }
          }
        }

        // Check for stock changes
        if (ebayData.stock !== oldEbayStock) {
          const shouldAlert = !settings || !settings.alertTypes || settings.alertTypes.outOfStock !== false;

          if (shouldAlert) {
            if (ebayData.stock === 'out_of_stock') {
              await createAlert(
                product,
                'out_of_stock',
                'ebay',
                oldEbayStock,
                'Product is now out of stock on eBay',
                'high'
              );
            } else if (oldEbayStock === 'out_of_stock') {
              await createAlert(
                product,
                'back_in_stock',
                oldEbayStock,
                'ebay',
                'Product is back in stock on eBay',
                'medium'
              );
            }
          }
        }

        // Update product
        product.ebayPrice = ebayData.price;
        product.stockStatus = ebayData.stock;
        product.title = ebayData.title;
        if (ebayData.images && ebayData.images.length > 0) {
          product.images = ebayData.images;
        }

        // Save price history
        await PriceHistory.create({
          productId: product._id,
          source: 'ebay',
          price: ebayData.price,
          stock: ebayData.stock
        });

        hasChanges = true;
      }
    } catch (error) {
      console.error(`Error fetching eBay data for ${product.title}:`, error.message);
    }

    // Fetch supplier data
    if (product.supplierUrl) {
      try {
        const supplierData = await supplierAdapter.fetchSupplierData(product.supplierUrl);

        if (supplierData) {
          // Check for supplier price changes
          if (supplierData.price !== oldSupplierPrice && oldSupplierPrice > 0) {
            const percentChange = ((supplierData.price - oldSupplierPrice) / oldSupplierPrice) * 100;

            // Use user's threshold
            if (Math.abs(percentChange) >= priceChangeThreshold) {
              const alertType = supplierData.price > oldSupplierPrice ? 'priceIncrease' : 'priceDecrease';
              const shouldAlert = !settings || !settings.alertTypes || settings.alertTypes[alertType] !== false;

              if (shouldAlert) {
                const type = supplierData.price > oldSupplierPrice ? 'price_increase' : 'price_decrease';
                const severity = Math.abs(percentChange) > 10 ? 'high' : 'medium';

                await createAlert(
                  product,
                  type,
                  oldSupplierPrice,
                  supplierData.price,
                `Supplier price changed from GBP ${oldSupplierPrice} to GBP ${supplierData.price} (${percentChange.toFixed(1)}%)`,
                  severity
                );
              }
            }
          }

          // Check for supplier stock changes
          if (supplierData.stock !== oldSupplierStock) {
            const shouldAlert = !settings || !settings.alertTypes || settings.alertTypes.outOfStock !== false;

            if (shouldAlert) {
              if (supplierData.stock === 'out_of_stock') {
                await createAlert(
                  product,
                  'out_of_stock',
                  'supplier',
                  oldSupplierStock,
                  'Product is now out of stock at supplier',
                  'critical'
                );
              } else if (oldSupplierStock === 'out_of_stock') {
                await createAlert(
                  product,
                  'back_in_stock',
                  oldSupplierStock,
                  'supplier',
                  'Product is back in stock at supplier',
                  'medium'
                );
              }
            }
          }

          // Update product
          product.supplierPrice = supplierData.price;
          product.supplierStockStatus = supplierData.stock;

          // Save price history
          await PriceHistory.create({
            productId: product._id,
            source: 'supplier',
            price: supplierData.price,
            stock: supplierData.stock
          });

          hasChanges = true;
        }
      } catch (error) {
        console.error(`Error fetching supplier data for ${product.title}:`, error.message);

        // Create alert for supplier unavailable
        const shouldAlert = !settings || !settings.alertTypes || settings.alertTypes.supplierUnavailable !== false;
        
        if (shouldAlert && oldSupplierStock !== 'unknown') {
          await createAlert(
            product,
            'supplier_unavailable',
            'available',
            'unavailable',
            'Unable to fetch data from supplier',
            'high'
          );
        }
        product.supplierStockStatus = 'unknown';
        hasChanges = true;
      }
    }

    // Competitor monitoring
    try {
      const insights = await fetchCompetitorInsights(product);
      if (insights) {
        if (Array.isArray(insights.listings) && insights.listings.length) {
          product.competitorListings = insights.listings;
          hasChanges = true;
        }

        if (insights.summary) {
          product.competitorStats = insights.summary;

          const cheapest = insights.summary;
          if (cheapest.lowestPrice && product.ebayPrice) {
            const difference = product.ebayPrice - cheapest.lowestPrice;
            const percentDifference = (difference / product.ebayPrice) * 100;

            const shouldAlert = !settings || !settings.alertTypes || settings.alertTypes.competitorPrice !== false;
            if (shouldAlert && difference > 0 && percentDifference >= competitorAlertPercent) {
              const severity = percentDifference > 10 ? 'high' : 'medium';
              await createAlert(
                product,
                'competitor_price',
                product.ebayPrice,
                cheapest.lowestPrice,
                `Competitor ${cheapest.sellerName} is ${percentDifference.toFixed(1)}% cheaper (difference GBP ${difference.toFixed(2)})`,
                severity
              );
            }

            await PriceHistory.create({
              productId: product._id,
              source: 'competitor',
              price: cheapest.lowestPrice,
              stock: 'in_stock'
            });
          }
        }
      }
    } catch (error) {
      console.error(`Competitor monitoring error for ${product.title}:`, error.message);
    }

    if (hasChanges) {
      product.lastCheckedAt = Date.now();
      product.calculateProfit();
      await product.save();
    }

    return { success: true, product };
  } catch (error) {
    console.error(`Error checking product ${product._id}:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Check products for a specific user based on their settings
 * Can be called with a specific user or for all users
 */
const checkProductsForUser = async (user = null, settings = null) => {
  try {
    let users = [];
    
    if (user) {
      // Check products for specific user
      users = [user];
      if (!settings) {
        settings = await Settings.findOne({ userId: user._id });
      }
    } else {
      // Check products for all users
      console.log('Starting product monitoring check for all users...');
      users = await User.find({});
    }

    let totalChecked = 0;
    let totalSkipped = 0;

    for (const currentUser of users) {
      // Get user settings if not provided
      let userSettings = settings;
      if (!userSettings) {
        userSettings = await Settings.findOne({ userId: currentUser._id });
      }
      
      if (!userSettings) {
        continue; // Skip users without settings
      }

      const monitoringFrequency = userSettings.monitoringFrequency || 30; // Default 30 minutes
      const frequencyMs = monitoringFrequency * 60 * 1000; // Convert to milliseconds

      // Get user's active products
      const products = await Product.find({ 
        userId: currentUser._id, 
        isActive: true 
      });

      if (products.length === 0) {
        continue;
      }

      // Reduced logging - only log summary
      if (process.env.NODE_ENV === 'development') {
        console.log(`Checking ${products.length} products for user ${currentUser.email} (frequency: ${monitoringFrequency} min)`);
      }

      for (const product of products) {
        const now = Date.now();
        const lastChecked = product.lastCheckedAt ? new Date(product.lastCheckedAt).getTime() : 0;
        const timeSinceLastCheck = now - lastChecked;

        // Only check if enough time has passed based on user's frequency
        if (timeSinceLastCheck >= frequencyMs || lastChecked === 0) {
          const result = await checkProduct(product, userSettings);
          if (result.success) {
            totalChecked++;
          }

          // Add delay between requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          totalSkipped++;
        }
      }
    }

    // Only log summary, not individual skips
    if (process.env.NODE_ENV === 'development' || totalChecked > 0) {
      console.log(`Monitoring check complete. Checked: ${totalChecked}, Skipped: ${totalSkipped}`);
    }
    return { checked: totalChecked, skipped: totalSkipped };
  } catch (error) {
    console.error('Check products for user error:', error);
    throw error;
  }
};

/**
 * Check all active products (legacy function for backward compatibility)
 * Now uses user-specific checking
 */
const checkAllProducts = async () => {
  return await checkProductsForUser();
};

module.exports = {
  checkProduct,
  checkAllProducts,
  checkProductsForUser,
  createAlert
};

