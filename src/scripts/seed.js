require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Settings = require('../models/Settings');
const Alert = require('../models/Alert');
const PriceHistory = require('../models/PriceHistory');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

const seedDatabase = async () => {
  try {
    console.log('🌱 Seeding database...\n');

    // Clear existing data
    console.log('Clearing existing data...');
    await User.deleteMany({});
    await Product.deleteMany({});
    await Settings.deleteMany({});
    await Alert.deleteMany({});
    await PriceHistory.deleteMany({});
    console.log('✓ Data cleared\n');

    // Create demo user
    console.log('Creating demo user...');
    const user = await User.create({
      email: 'demo@ebaymonitor.com',
      passwordHash: 'demo123',
      name: 'Demo User',
      role: 'user'
    });
    console.log(`✓ User created: ${user.email}\n`);

    // Create settings for user
    console.log('Creating user settings...');
    await Settings.create({
      userId: user._id,
      monitoringFrequency: 30,
      emailAlerts: true,
      alertTypes: {
        priceIncrease: true,
        priceDecrease: true,
        outOfStock: true,
        supplierUnavailable: true,
        lowStock: true
      },
      priceChangeThreshold: 5
    });
    console.log('✓ Settings created\n');

    // Create sample products
    console.log('Creating sample products...');
    const products = [
      {
        title: 'Apple iPhone 14 Pro Max 256GB - Deep Purple (Unlocked)',
        ebayUrl: 'https://www.ebay.com/itm/175445648899',
        ebayItemId: '175445648899',
        ebayPrice: 1099.99,
        supplierUrl: 'https://www.aliexpress.com/item/1005004884476688.html',
        supplierPrice: 899.00,
        stockStatus: 'in_stock',
        supplierStockStatus: 'in_stock',
        images: ['https://i.ebayimg.com/images/g/example1.jpg'],
        tags: ['electronics', 'phones', 'apple'],
        userId: user._id,
        isActive: true
      },
      {
        title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones - Black',
        ebayUrl: 'https://www.ebay.com/itm/385234567890',
        ebayItemId: '385234567890',
        ebayPrice: 349.99,
        supplierUrl: 'https://www.aliexpress.com/item/1005003456789012.html',
        supplierPrice: 279.00,
        stockStatus: 'in_stock',
        supplierStockStatus: 'low_stock',
        images: ['https://i.ebayimg.com/images/g/example2.jpg'],
        tags: ['electronics', 'audio', 'headphones'],
        userId: user._id,
        isActive: true
      },
      {
        title: 'Samsung Galaxy Tab S8 Ultra 128GB - Graphite',
        ebayUrl: 'https://www.ebay.com/itm/334567890123',
        ebayItemId: '334567890123',
        ebayPrice: 899.00,
        supplierUrl: 'https://www.aliexpress.com/item/1005004567890123.html',
        supplierPrice: 749.00,
        stockStatus: 'in_stock',
        supplierStockStatus: 'in_stock',
        images: ['https://i.ebayimg.com/images/g/example3.jpg'],
        tags: ['electronics', 'tablets', 'samsung'],
        userId: user._id,
        isActive: true
      },
      {
        title: 'Nintendo Switch OLED Model - White',
        ebayUrl: 'https://www.ebay.com/itm/265678901234',
        ebayItemId: '265678901234',
        ebayPrice: 349.99,
        supplierUrl: 'https://www.aliexpress.com/item/1005005678901234.html',
        supplierPrice: 299.00,
        stockStatus: 'low_stock',
        supplierStockStatus: 'in_stock',
        images: ['https://i.ebayimg.com/images/g/example4.jpg'],
        tags: ['gaming', 'nintendo', 'console'],
        userId: user._id,
        isActive: true
      },
      {
        title: 'Apple Watch Series 8 GPS 45mm - Midnight Aluminum',
        ebayUrl: 'https://www.ebay.com/itm/195789012345',
        ebayItemId: '195789012345',
        ebayPrice: 429.00,
        supplierUrl: 'https://www.aliexpress.com/item/1005006789012345.html',
        supplierPrice: 349.00,
        stockStatus: 'in_stock',
        supplierStockStatus: 'in_stock',
        images: ['https://i.ebayimg.com/images/g/example5.jpg'],
        tags: ['electronics', 'wearables', 'apple'],
        userId: user._id,
        isActive: true
      }
    ];

    const createdProducts = [];
    for (const productData of products) {
      const product = await Product.create(productData);
      product.calculateProfit();
      await product.save();
      createdProducts.push(product);
      console.log(`✓ Created: ${product.title}`);
    }
    console.log(`\n✓ ${createdProducts.length} products created\n`);

    // Create price history for products
    console.log('Creating price history...');
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;

    for (const product of createdProducts) {
      // eBay price history
      await PriceHistory.create([
        {
          productId: product._id,
          source: 'ebay',
          price: product.ebayPrice * 0.95,
          stock: 'in_stock',
          checkedAt: new Date(twoDaysAgo)
        },
        {
          productId: product._id,
          source: 'ebay',
          price: product.ebayPrice * 0.98,
          stock: 'in_stock',
          checkedAt: new Date(oneDayAgo)
        },
        {
          productId: product._id,
          source: 'ebay',
          price: product.ebayPrice,
          stock: product.stockStatus,
          checkedAt: new Date(now)
        }
      ]);

      // Supplier price history
      if (product.supplierUrl) {
        await PriceHistory.create([
          {
            productId: product._id,
            source: 'supplier',
            price: product.supplierPrice * 0.97,
            stock: 'in_stock',
            checkedAt: new Date(twoDaysAgo)
          },
          {
            productId: product._id,
            source: 'supplier',
            price: product.supplierPrice * 0.99,
            stock: 'in_stock',
            checkedAt: new Date(oneDayAgo)
          },
          {
            productId: product._id,
            source: 'supplier',
            price: product.supplierPrice,
            stock: product.supplierStockStatus,
            checkedAt: new Date(now)
          }
        ]);
      }
    }
    console.log('✓ Price history created\n');

    // Create sample alerts
    console.log('Creating sample alerts...');
    await Alert.create([
      {
        productId: createdProducts[0]._id,
        type: 'price_decrease',
        oldValue: 1149.99,
        newValue: 1099.99,
        message: 'eBay price decreased from $1149.99 to $1099.99 (4.3%)',
        severity: 'medium',
        read: false
      },
      {
        productId: createdProducts[1]._id,
        type: 'low_stock',
        oldValue: 'in_stock',
        newValue: 'low_stock',
        message: 'Supplier stock is running low',
        severity: 'medium',
        read: false
      },
      {
        productId: createdProducts[3]._id,
        type: 'out_of_stock',
        oldValue: 'in_stock',
        newValue: 'low_stock',
        message: 'Product stock is running low on eBay',
        severity: 'high',
        read: true
      }
    ]);
    console.log('✓ Sample alerts created\n');

    console.log('✅ Database seeding completed successfully!\n');
    console.log('Demo credentials:');
    console.log('  Email: demo@ebaymonitor.com');
    console.log('  Password: demo123\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  }
};

// Run seed
connectDB().then(() => {
  seedDatabase();
});

