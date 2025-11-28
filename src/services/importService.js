const axios = require('axios');
const cheerio = require('cheerio');
const Product = require('../models/Product');
const ebayAdapter = require('../adapters/ebayAdapter');
const supplierAdapter = require('../adapters/supplierAdapter');
const competitorService = require('./competitorService');
const puppeteerScraper = require('./puppeteerScraper');

// OAuth token cache
let cachedToken = null;
let tokenExpiry = null;

/**
 * Get eBay OAuth token
 */
const getEbayToken = async () => {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;

  if (!appId || !certId || appId === 'your_ebay_app_id') {
    throw new Error('eBay API credentials not configured');
  }

  try {
    const credentials = Buffer.from(`${appId}:${certId}`).toString('base64');
    const tokenUrl = process.env.EBAY_ENV === 'PRODUCTION'
      ? 'https://api.ebay.com/identity/v1/oauth2/token'
      : 'https://api.sandbox.ebay.com/identity/v1/oauth2/token';

    const response = await axios.post(
      tokenUrl,
      'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        }
      }
    );

    cachedToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;

    return cachedToken;
  } catch (error) {
    console.error('Failed to get eBay OAuth token:', error.message);
    throw error;
  }
};

/**
 * Extract store name from eBay store URL
 * Note: Store name is NOT the same as sellerID
 */
const extractStoreNameFromUrl = (storeUrl) => {
  try {
    // Pattern 1: /str/storename
    let match = storeUrl.match(/\/str\/([^/?]+)/);
    if (match) return match[1];

    // Pattern 2: /usr/storename
    match = storeUrl.match(/\/usr\/([^/?]+)/);
    if (match) return match[1];

    // Pattern 3: ?_ssn=storename
    match = storeUrl.match(/[?&]_ssn=([^&]+)/);
    if (match) return match[1];

    return null;
  } catch (error) {
    console.error('Error extracting store name:', error);
    return null;
  }
};

/**
 * Get sellerID from any product page in the store (fallback method using Puppeteer)
 * If storefront scraping fails, find any item link and extract sellerID from item page
 * Also tries store category pages if main storefront has no items
 */
const getSellerIdFromProductPage = async (storeName) => {
  try {
    const storefrontUrl = `https://www.ebay.co.uk/str/${storeName}`;
    
    // Use Puppeteer to get a product link from the store page
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: "new",
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-features=site-per-process',
        '--disable-web-security',
        '--disable-features=IsolateOrigins',
        '--disable-extensions',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1920,1080'
      ],
      defaultViewport: {
        width: 1920,
        height: 1080
      }
    });
    const page = await browser.newPage();
    
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36");
    await page.setExtraHTTPHeaders({ "accept-language": "en-GB,en-US;q=0.9,en;q=0.8" });
    await page.evaluateOnNewDocument(() => {
      delete navigator.__proto__.webdriver;
    });
    
    // Navigate with retry
    try {
      await page.goto(storefrontUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (error) {
      try {
        await page.goto(storefrontUrl, { waitUntil: "networkidle2", timeout: 30000 });
      } catch (error2) {
        await page.goto(storefrontUrl, { waitUntil: "load", timeout: 30000 });
      }
    }
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Find first item link from storefront
    let firstItemUrl = await page.evaluate(() => {
      const link = document.querySelector('a[href*="/itm/"]');
      if (link) {
        const href = link.getAttribute('href');
        return href.startsWith('http') ? href : `https://www.ebay.co.uk${href}`;
      }
      return null;
    });

    // If no items on main storefront, try to find category pages
    if (!firstItemUrl) {
      // Look for category links
      const categoryLinks = await page.evaluate(() => {
        const links = [];
        document.querySelectorAll('a[href*="/str/"]').forEach(link => {
          const href = link.getAttribute('href');
          if (href && href.includes('/str/') && href !== window.location.pathname) {
            links.push(href);
          }
        });
        return links.slice(0, 3); // Try first 3 category links
      });

      // Try each category page
      for (const categoryPath of categoryLinks) {
        const categoryUrl = categoryPath.startsWith('http') 
          ? categoryPath 
          : `https://www.ebay.co.uk${categoryPath}`;
        
        try {
          try {
            await page.goto(categoryUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
          } catch (error) {
            try {
              await page.goto(categoryUrl, { waitUntil: "networkidle2", timeout: 30000 });
            } catch (error2) {
              await page.goto(categoryUrl, { waitUntil: "load", timeout: 30000 });
            }
          }
          await new Promise(resolve => setTimeout(resolve, 2000));

          firstItemUrl = await page.evaluate(() => {
            const link = document.querySelector('a[href*="/itm/"]');
            if (link) {
              const href = link.getAttribute('href');
              return href.startsWith('http') ? href : `https://www.ebay.co.uk${href}`;
            }
            return null;
          });

          if (firstItemUrl) break; // Found an item, stop searching
        } catch (err) {
          // Continue to next category
          continue;
        }
      }
    }

    await page.close();
    await browser.close();

    if (!firstItemUrl) {
      console.warn('No item links found on store page or category pages');
      return null;
    }

    // Extract sellerID from product page using Puppeteer scraper
    const sellerId = await puppeteerScraper.extractSellerIdFromProductPage(firstItemUrl.split('?')[0]);
    return sellerId;
  } catch (error) {
    console.error(`Error extracting sellerID from product page:`, error.message);
    return null;
  }
};

/**
 * Extract sellerID by scraping the storefront using Puppeteer
 * Store name ≠ sellerID - we need to extract the real seller username
 * MUST use Puppeteer only, NO axios + cheerio
 */
const getSellerIdFromScraping = async (storeName) => {
  try {
    // Build storefront URL: https://www.ebay.co.uk/str/<storeName>
    const storefrontUrl = `https://www.ebay.co.uk/str/${storeName}`;
    
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: "new",
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-features=site-per-process',
        '--disable-web-security',
        '--disable-features=IsolateOrigins',
        '--disable-extensions',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1920,1080'
      ],
      defaultViewport: {
        width: 1920,
        height: 1080
      }
    });
    const page = await browser.newPage();

    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36");
    await page.setExtraHTTPHeaders({ "accept-language": "en-GB,en-US;q=0.9,en;q=0.8" });
    await page.evaluateOnNewDocument(() => {
      delete navigator.__proto__.webdriver;
    });

    // Navigate with retry
    try {
      await page.goto(storefrontUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (error) {
      try {
        await page.goto(storefrontUrl, { waitUntil: "networkidle2", timeout: 30000 });
      } catch (error2) {
        await page.goto(storefrontUrl, { waitUntil: "load", timeout: 30000 });
      }
    }
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract product links first
    const productLinks = await page.evaluate(() => {
      const links = [];
      // Try multiple selectors
      document.querySelectorAll('a.s-item__link, a.s-item__title, a[href*="/itm/"]').forEach(link => {
        const href = link.getAttribute('href');
        if (href && href.includes('/itm/')) {
          const fullUrl = href.startsWith('http') ? href : `https://www.ebay.co.uk${href}`;
          if (!links.includes(fullUrl)) {
            links.push(fullUrl);
          }
        }
      });
      return links;
    });

    // If no links found, try paginated URL
    let links = productLinks;
    if (!links || links.length === 0) {
      const paginatedUrl = `https://www.ebay.co.uk/str/${storeName}?_pgn=1`;
      try {
        await page.goto(paginatedUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      } catch (error) {
        try {
          await page.goto(paginatedUrl, { waitUntil: "networkidle2", timeout: 30000 });
        } catch (error2) {
          await page.goto(paginatedUrl, { waitUntil: "load", timeout: 30000 });
        }
      }
      await new Promise(resolve => setTimeout(resolve, 2000));

      links = await page.evaluate(() => {
        const foundLinks = [];
        document.querySelectorAll('a.s-item__link, a.s-item__title, a[href*="/itm/"]').forEach(link => {
          const href = link.getAttribute('href');
          if (href && href.includes('/itm/')) {
            const fullUrl = href.startsWith('http') ? href : `https://www.ebay.co.uk${href}`;
            if (!foundLinks.includes(fullUrl)) {
              foundLinks.push(fullUrl);
            }
          }
        });
        return foundLinks;
      });
    }

    // If STILL no links found, return error
    if (!links || links.length === 0) {
      await browser.close();
      throw new Error("Store HTML not loaded — must fix Puppeteer headers");
    }

    // Open first product page to extract sellerID
    const firstProductUrl = links[0].split('?')[0];
    try {
      await page.goto(firstProductUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (error) {
      try {
        await page.goto(firstProductUrl, { waitUntil: "networkidle2", timeout: 30000 });
      } catch (error2) {
        await page.goto(firstProductUrl, { waitUntil: "load", timeout: 30000 });
      }
    }
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract sellerID using ALL patterns
    const sellerId = await page.evaluate(() => {
      // Pattern 1: JSON-LD structured data
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of jsonLdScripts) {
        try {
          const data = JSON.parse(script.textContent);
          if (data.seller && data.seller.username) return data.seller.username;
          if (data.seller && data.seller.name) return data.seller.name;
          if (data.sellerName) return data.sellerName;
          if (data.sellerId) return data.sellerId;
          if (data.author && data.author.name) return data.author.name;
        } catch (e) {}
      }

      // Pattern 2: Meta tags
      const twitterMeta = document.querySelector('meta[name="twitter:creator"]');
      if (twitterMeta) {
        const content = twitterMeta.getAttribute('content');
        if (content) {
          const match = content.match(/@?([^"'\s,]+)/);
          if (match && match[1] && match[1] !== 'eBay UK' && match[1] !== 'eBay') {
            return match[1].trim();
          }
        }
      }

      // Pattern 3: Script tags with seller data
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const content = script.textContent || '';
        const patterns = [
          /"seller"\s*:\s*{\s*"username"\s*:\s*"([^"]+)"/,
          /"sellerName"\s*:\s*"([^"]+)"/,
          /"sellerId"\s*:\s*"([^"]+)"/,
          /"username"\s*:\s*"([^"]+)"/,
          /sellerName["\s]*[:=]["\s]*["']([^"']+)["']/,
          /sellerId["\s]*[:=]["\s]*["']([^"']+)["']/
        ];
        for (const pattern of patterns) {
          const match = content.match(pattern);
          if (match && match[1]) {
            const id = match[1].replace(/["'}\s]/g, '').trim();
            if (id && id !== 'eBay UK' && id !== 'eBay' && id.length < 50 && !id.includes('http')) {
              return id;
            }
          }
        }
      }

      // Pattern 4: DOM elements
      const mbgId = document.querySelector('a.mbg-id span, .mbg-id span');
      if (mbgId && mbgId.textContent.trim() && mbgId.textContent.trim() !== 'eBay UK' && mbgId.textContent.trim() !== 'eBay') {
        return mbgId.textContent.trim();
      }

      return null;
    });

    await browser.close();

    // NEVER return slug as sellerID
    // NEVER return "eBay UK"
    // NEVER skip sellerID — MUST FIND IT
    if (!sellerId || sellerId === storeName || sellerId === 'eBay UK' || sellerId === 'eBay') {
      throw new Error("Could not extract valid sellerID from product page");
    }

    return sellerId;
  } catch (error) {
    console.error(`Scraping error while extracting sellerID:`, error.message);
    throw error;
  }
};

/**
 * Fetch store listings using eBay Finding API
 * Uses findItemsAdvanced with Seller filter
 * IMPORTANT: Requires actual sellerID (eBay username), NOT store name
 */
const fetchStoreListingsAPI = async (sellerID) => {
  try {
    const appId = process.env.EBAY_APP_ID;
    
    if (!appId || appId === 'your_ebay_app_id') {
      console.log('eBay API not configured, falling back to scraping');
      return null;
    }

    const findingUrl = process.env.EBAY_ENV === 'PRODUCTION'
      ? 'https://svcs.ebay.com/services/search/FindingService/v1'
      : 'https://svcs.sandbox.ebay.com/services/search/FindingService/v1';

    let allItems = [];
    let pageNumber = 1;
    const entriesPerPage = 200;
    const maxPages = 50; // eBay Finding API limit


    // Fetch all pages
    while (pageNumber <= maxPages) {
      try {
        const response = await axios.get(findingUrl, {
          params: {
            'OPERATION-NAME': 'findItemsAdvanced',
            'SERVICE-VERSION': '1.0.0',
            'SECURITY-APPNAME': appId,
            'RESPONSE-DATA-FORMAT': 'JSON',
            'REST-PAYLOAD': true,
            'itemFilter(0).name': 'Seller',
            'itemFilter(0).value': sellerID,
            'itemFilter(1).name': 'ListingType',
            'itemFilter(1).value': 'FixedPrice',
            'paginationInput.entriesPerPage': entriesPerPage,
            'paginationInput.pageNumber': pageNumber,
            'GLOBAL-ID': 'EBAY-GB' // UK marketplace
          },
          timeout: 15000
        });

        const searchResult = response.data?.findItemsAdvancedResponse?.[0]?.searchResult?.[0];
        
        if (!searchResult || !searchResult.item || searchResult.item.length === 0) {
          break;
        }

        const items = searchResult.item;

        // Process items
        const processedItems = items.map(item => {
          const title = item.title?.[0] || 'Unknown Product';
          const price = parseFloat(item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || 0);
          const itemId = item.itemId?.[0] || '';
          const galleryUrl = item.galleryURL?.[0] || '';
          const listingType = item.listingInfo?.[0]?.listingType?.[0] || 'Unknown';
          const condition = item.condition?.[0]?.conditionDisplayName?.[0] || 'Used';
          const quantity = parseInt(item.quantity?.[0] || '0', 10);
          const quantitySold = parseInt(item.sellingStatus?.[0]?.quantitySold?.[0] || '0', 10);
          
          // Determine stock status
          let stock = 'in_stock';
          if (quantity === 0 || (quantity - quantitySold) <= 0) {
            stock = 'out_of_stock';
          } else if ((quantity - quantitySold) < 5) {
            stock = 'low_stock';
          }

          // Build eBay URL
          const url = item.viewItemURL?.[0] || `https://www.ebay.co.uk/itm/${itemId}`;

          return {
            title,
            price,
            itemId,
            url,
            images: galleryUrl ? [galleryUrl] : [],
            stock,
            condition,
            listingType,
            quantity: quantity - quantitySold
          };
        });

        allItems = allItems.concat(processedItems);

        // Check if there are more pages
        const paginationOutput = response.data?.findItemsAdvancedResponse?.[0]?.paginationOutput?.[0];
        const totalPages = parseInt(paginationOutput?.totalPages?.[0] || '1', 10);
        
        if (pageNumber >= totalPages) {
          break;
        }

        pageNumber++;

        // Add delay to respect rate limits (eBay Finding API: 5000 calls/day)
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        if (error.response?.status === 500 || error.response?.status === 400) {
          console.error(`eBay Finding API error (${error.response?.status}): ${error.response?.data?.errorMessage?.[0]?.error?.[0]?.message?.[0] || error.message}`);
          // Return null to trigger Puppeteer fallback
          return null;
        }
        console.error(`Error fetching page ${pageNumber}:`, error.message);
        throw error;
      }
    }

    return allItems.length > 0 ? allItems : null;
  } catch (error) {
    console.error('eBay Finding API fetch failed:', error.message);
    // Return null to trigger Puppeteer fallback
    return null;
  }
};

/**
 * Fallback: Scrape store listings using Puppeteer (paginated)
 * Scrapes multiple pages of the store to get all listings from JS-rendered pages
 */
const fetchStoreListingsScrape = async (storeName) => {
  try {
    
    const storeUrl = `https://www.ebay.co.uk/str/${storeName}`;
    
    // Use Puppeteer scraper to get all listings
    const allItems = await puppeteerScraper.scrapeStoreListings(storeUrl, 5);
    
    if (!allItems || allItems.length === 0) {
      console.warn('Puppeteer scraping found no items');
      return null;
    }

    // Enhance items with additional data if needed
    const enhancedItems = allItems.map(item => ({
      ...item,
      stock: item.stock || 'in_stock',
      condition: item.condition || 'Used'
    }));

    return enhancedItems;
  } catch (error) {
    console.error('Puppeteer scraping fallback failed:', error.message);
    return null;
  }
};

/**
 * Supplier mapping configuration - keywords to search terms
 */
const SUPPLIER_KEYWORDS = [
  { keywords: ['koka', 'noodle', 'instant noodle'], searchTerm: 'koka' },
  { keywords: ['lindor', 'lindt', 'chocolate ball'], searchTerm: 'lindor' },
  { keywords: ['haribo', 'gummy', 'gummies', 'sweet', 'candy'], searchTerm: 'haribo' },
  { keywords: ['kleenex', 'tissue', 'facial tissue'], searchTerm: 'kleenex' },
  { keywords: ['swizzels', 'drumstick', 'lolly', 'lollipop'], searchTerm: 'swizzels' },
  { keywords: ['household', 'cleaning', 'detergent'], searchTerm: 'household' },
  { keywords: ['snack', 'crisp', 'chips'], searchTerm: 'snacks' },
  { keywords: ['drink', 'beverage', 'juice', 'soda'], searchTerm: 'drinks' }
];

/**
 * Extract search term from product title for Bestway Wholesale
 */
const extractSearchTerm = (title) => {
  const titleLower = title.toLowerCase();

  for (const mapping of SUPPLIER_KEYWORDS) {
    for (const keyword of mapping.keywords) {
      if (titleLower.includes(keyword.toLowerCase())) {
        return mapping.searchTerm;
      }
    }
  }

  // Fallback: use first 2-3 words from title
  const words = title.split(/\s+/).slice(0, 3).join(' ');
  return words.toLowerCase();
};

/**
 * Search Bestway Wholesale for a product and extract supplier data
 */
const searchBestwayWholesale = async (productTitle) => {
  try {
    const searchTerm = extractSearchTerm(productTitle);
    const searchUrl = `https://www.bestwaywholesale.co.uk/search?w=${encodeURIComponent(searchTerm)}`;
    

    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'en-GB,en;q=0.9'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    
    // Try to find first product in search results
    // Bestway Wholesale product selectors (may need adjustment based on actual site structure)
    const productLink = $('.product-item a, .product-card a, a[href*="/product/"]').first();
    
    if (productLink.length === 0) {
      return null;
    }

    const productUrl = productLink.attr('href');
    const fullProductUrl = productUrl.startsWith('http') 
      ? productUrl 
      : `https://www.bestwaywholesale.co.uk${productUrl}`;

    // Fetch product page
    const productResponse = await axios.get(fullProductUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 15000
    });

    const $product = cheerio.load(productResponse.data);

    // Extract price
    let priceText = $product('.price, .product-price, [class*="price"]').first().text().trim();
    if (!priceText) {
      priceText = $product('[itemprop="price"]').attr('content') || '';
    }
    const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;

    // Extract stock status
    let stock = 'unknown';
    const bodyText = $product('body').text().toLowerCase();
    const stockText = $product('.stock, .availability, [class*="stock"]').text().toLowerCase();
    
    if (bodyText.includes('in stock') || stockText.includes('in stock') || stockText.includes('available')) {
      stock = 'in_stock';
    } else if (bodyText.includes('out of stock') || stockText.includes('out of stock') || stockText.includes('unavailable')) {
      stock = 'out_of_stock';
    } else if (bodyText.includes('low stock') || stockText.includes('limited')) {
      stock = 'low_stock';
    }

    // Extract SKU
    let sku = '';
    const skuText = $product('.sku, [class*="sku"], [itemprop="sku"]').text().trim();
    if (skuText) {
      sku = skuText.replace(/SKU[:\s]*/i, '').trim();
    }

    if (price === 0) {
      return null;
    }

    return {
      supplierUrl: fullProductUrl,
      supplierPrice: price,
      supplierStockStatus: stock,
      supplierSku: sku
    };
  } catch (error) {
    console.error(`Error searching Bestway Wholesale for "${productTitle}":`, error.message);
    return null;
  }
};

/**
 * Find matching supplier data for a product title
 * Searches Bestway Wholesale dynamically
 */
const findSupplierData = async (title) => {
  try {
    const supplierData = await searchBestwayWholesale(title);
    return supplierData;
  } catch (error) {
    console.error(`Supplier matching error for "${title}":`, error.message);
    return null;
  }
};

/**
 * Main store import function
 */
const importStoreListings = async (storeUrl, userId) => {
  const results = {
    total: 0,
    imported: 0,
    updated: 0,
    skipped: 0,
    supplierMapped: 0,
    competitorSynced: 0,
    errors: []
  };

  try {
    // Step 1: Extract store name from URL
    const storeName = extractStoreNameFromUrl(storeUrl);
    if (!storeName) {
      throw new Error('Could not extract store name from URL');
    }


    // Step 2: Get real sellerID from storefront HTML scraping
    // Store name ≠ sellerID - we need to extract the real seller username
    let sellerID = await getSellerIdFromScraping(storeName);

    // Step 3: Fallback to product page scraping if storefront failed
    if (!sellerID) {
      sellerID = await getSellerIdFromProductPage(storeName);
    }

    if (!sellerID) {
      throw new Error(`Could not determine sellerID for store "${storeName}". The store may not exist or the page structure may have changed. Please verify the store URL is correct (e.g., https://www.ebay.co.uk/str/storename)`);
    }


    // Step 4: Fetch listings using Finding API with real sellerID
    let listings = await fetchStoreListingsAPI(sellerID);

    // Step 5: Fallback to scraping if Finding API returns no results
    if (!listings || listings.length === 0) {
      try {
        listings = await fetchStoreListingsScrape(storeName);
      } catch (scrapeError) {
        console.error('HTML scraping fallback also failed:', scrapeError.message);
      }
    }

    if (!listings || listings.length === 0) {
      throw new Error(`No listings found for sellerID "${sellerID}" (store: "${storeName}"). The store may have no active listings or the sellerID may be incorrect.`);
    }

    results.total = listings.length;

    // Process each listing
    for (const item of listings) {
      try {
        if (!item.itemId || !item.title) {
          results.skipped++;
          continue;
        }

        // Check if product already exists for this user
        const existing = await Product.findOne({
          userId: userId,
          ebayItemId: item.itemId
        });

        if (existing) {
          // Update existing product
          existing.title = item.title;
          existing.ebayPrice = item.price;
          existing.images = item.images;
          existing.stockStatus = item.stock;
          existing.lastCheckedAt = new Date();
          existing.calculateProfit();
          await existing.save();
          results.updated++;
        } else {
          // Create new product
          const productData = {
            userId: userId,
            title: item.title,
            ebayUrl: item.url,
            ebayItemId: item.itemId,
            ebayPrice: item.price,
            images: item.images,
            stockStatus: item.stock,
            supplierUrl: '',
            supplierPrice: 0,
            supplierStockStatus: 'unknown'
          };

          // Try to find and map supplier from Bestway Wholesale
          try {
            const supplierData = await findSupplierData(item.title);
            if (supplierData && supplierData.supplierUrl) {
              productData.supplierUrl = supplierData.supplierUrl;
              productData.supplierPrice = supplierData.supplierPrice || 0;
              productData.supplierStockStatus = supplierData.supplierStockStatus || 'unknown';
              results.supplierMapped++;
            }
          } catch (err) {
            console.error(`Supplier matching failed for ${item.title}:`, err.message);
            // Continue without supplier data
          }

          const product = await Product.create(productData);

          // Fetch competitor data with retry logic
          try {
            const competitorData = await competitorService.fetchCompetitorInsights(product);
            if (competitorData && competitorData.listings && competitorData.listings.length > 0) {
              product.competitorListings = competitorData.listings;
              if (competitorData.summary) {
                product.competitorStats = competitorData.summary;
              }
              await product.save();
              results.competitorSynced++;
            }
          } catch (err) {
            console.error(`Competitor fetch failed for ${item.title}:`, err.message);
            // Continue without competitor data - product is still saved
          }

          results.imported++;
        }

        // Small delay to prevent overwhelming the system
        if ((results.imported + results.updated) % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (err) {
        console.error(`Error processing item ${item.itemId}:`, err.message);
        results.errors.push(`${item.title}: ${err.message}`);
        results.skipped++;
      }
    }


    return results;
  } catch (error) {
    console.error('Store import error:', error);
    throw error;
  }
};

module.exports = {
  importStoreListings
};

