const axios = require('axios');
const cheerio = require('cheerio');
const puppeteerScraper = require('../services/puppeteerScraper');

const MAX_RETRIES = parseInt(process.env.MAX_RETRY_ATTEMPTS || '3', 10);
const BASE_DELAY = parseInt(process.env.RETRY_BASE_DELAY || '1000', 10);

/**
 * Retry helper with exponential backoff
 */
const retryWithBackoff = async (fn, maxRetries = MAX_RETRIES, baseDelay = BASE_DELAY) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

/**
 * eBay Adapter
 * Fetches product data from eBay using both API and scraping
 */

/**
 * Extract eBay item ID from URL
 */
const extractItemId = (url) => {
  try {
    // Pattern 1: /itm/123456789
    let match = url.match(/\/itm\/(\d+)/);
    if (match) return match[1];

    // Pattern 2: ?item=123456789
    match = url.match(/[?&]item=(\d+)/);
    if (match) return match[1];

    // Pattern 3: /p/123456789
    match = url.match(/\/p\/(\d+)/);
    if (match) return match[1];

    return null;
  } catch (error) {
    console.error('Error extracting item ID:', error);
    return null;
  }
};

/**
 * Fetch item using eBay Finding API with retry logic
 */
const fetchWithAPI = async (itemId) => {
  const appId = process.env.EBAY_APP_ID;
  
  if (!appId || appId === 'your_ebay_app_id') {
    return null;
  }

  try {
    return await retryWithBackoff(async () => {
      const apiUrl = process.env.EBAY_ENV === 'PRODUCTION'
        ? 'https://svcs.ebay.com/services/search/FindingService/v1'
        : 'https://svcs.sandbox.ebay.com/services/search/FindingService/v1';

      const response = await axios.get(apiUrl, {
        params: {
          'OPERATION-NAME': 'findItemsAdvanced',
          'SERVICE-VERSION': '1.0.0',
          'SECURITY-APPNAME': appId,
          'RESPONSE-DATA-FORMAT': 'JSON',
          'REST-PAYLOAD': true,
          'itemFilter(0).name': 'ItemID',
          'itemFilter(0).value': itemId,
          'paginationInput.entriesPerPage': 1
        },
        timeout: 10000
      });

      const items = response.data?.findItemsAdvancedResponse?.[0]?.searchResult?.[0]?.item;

      if (items && items.length > 0) {
        const item = items[0];
        const title = item.title?.[0] || 'Unknown Product';
        const price = parseFloat(item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || 0);
        
        if (!title || price === 0) {
          throw new Error('Invalid data from eBay API');
        }
        
        return {
          title,
          price,
          stock: 'in_stock',
          images: item.galleryURL?.[0] ? [item.galleryURL[0]] : [], // ZERO PLACEHOLDER IMAGES
          itemId: item.itemId?.[0] || itemId,
          description: '', // API doesn't provide description, will need scraping
          variations: [] // API doesn't provide variations, will need scraping
        };
      }

      return null;
    }, 3, 1000);
  } catch (error) {
    console.error('eBay API error after retries:', error.message);
    return null;
  }
};

/**
 * Fetch item by scraping eBay page with Puppeteer (FIRST)
 * Falls back to API if Puppeteer fails
 */
const fetchWithScraping = async (url) => {
  try {
    // MUST scrape product page with Puppeteer first
    const puppeteerData = await puppeteerScraper.scrapeProductDetails(url);
    
    if (puppeteerData && puppeteerData.title && puppeteerData.price > 0) {
      return {
        title: puppeteerData.title,
        price: puppeteerData.price,
        stock: puppeteerData.stock || 'in_stock',
        images: puppeteerData.images && puppeteerData.images.length > 0 
          ? puppeteerData.images 
          : [], // ZERO PLACEHOLDER IMAGES
        itemId: puppeteerData.itemId || extractItemId(url) || 'unknown',
        description: puppeteerData.description || '',
        variations: puppeteerData.variations || []
      };
    }

    throw new Error('Could not extract valid product data with Puppeteer');
  } catch (error) {
    console.error('Puppeteer scraping failed:', error.message);
    throw error;
  }
};

/**
 * Main function to fetch eBay item
 * MUST scrape with Puppeteer first, then try eBay API if Puppeteer fails
 * MUST return: title, images[], price, itemId, variations[]
 * ZERO PLACEHOLDER IMAGES, ZERO DEMO DATA, ZERO fallbackPrice
 */
const fetchEbayItem = async (url) => {
  const itemId = extractItemId(url);

  try {
    let data = null;

    // MUST scrape product page with Puppeteer first
    try {
      data = await fetchWithScraping(url);
    } catch (scrapingError) {
      console.log('Puppeteer scraping failed, trying eBay API fallback...');
      
      // If Puppeteer fails → try eBay API
      if (itemId) {
        data = await fetchWithAPI(itemId);
      }
    }

    if (!data || !data.title || data.price === 0) {
      throw new Error('Could not fetch eBay product data from Puppeteer or API');
    }

    // Ensure all required fields are present
    return {
      title: data.title,
      images: data.images || [], // ZERO PLACEHOLDER IMAGES
      price: data.price, // ZERO fallbackPrice
      itemId: data.itemId || itemId || 'unknown',
      variations: data.variations || [],
      stock: data.stock || 'in_stock',
      description: data.description || ''
    };
  } catch (error) {
    console.error('fetchEbayItem error:', error.message);
    throw new Error(`Failed to fetch eBay product data: ${error.message}`);
  }
};

module.exports = {
  fetchEbayItem,
  extractItemId
};

