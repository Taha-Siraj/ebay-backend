const axios = require('axios');
const cheerio = require('cheerio');

const MAX_RETRIES = parseInt(process.env.MAX_RETRY_ATTEMPTS || '3', 10);
const BASE_DELAY = parseInt(process.env.RETRY_BASE_DELAY || '1000', 10);
const RATE_LIMIT_DELAY = parseInt(process.env.SUPPLIER_RATE_LIMIT_DELAY || '2000', 10);

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

// Rate limiting per supplier
const rateLimiters = new Map();
const getRateLimiter = (supplier) => {
  if (!rateLimiters.has(supplier)) {
    rateLimiters.set(supplier, { lastRequest: 0, minDelay: RATE_LIMIT_DELAY });
  }
  return rateLimiters.get(supplier);
};

const waitForRateLimit = async (supplier) => {
  const limiter = getRateLimiter(supplier);
  const now = Date.now();
  const timeSinceLastRequest = now - limiter.lastRequest;
  
  if (timeSinceLastRequest < limiter.minDelay) {
    const waitTime = limiter.minDelay - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  limiter.lastRequest = Date.now();
};

/**
 * Supplier Adapter
 * Generic scraper with specific implementations for different suppliers
 */

/**
 * Detect supplier from URL
 */
const detectSupplier = (url) => {
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('aliexpress')) return 'aliexpress';
  if (urlLower.includes('amazon')) return 'amazon';
  if (urlLower.includes('alibaba')) return 'alibaba';
  
  return 'generic';
};

/**
 * Fetch data from AliExpress with retry logic
 */
const fetchAliExpress = async (url) => {
  await waitForRateLimit('aliexpress');
  
  try {
    return await retryWithBackoff(async () => {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        },
        timeout: 15000
      });

    const $ = cheerio.load(response.data);
    
    // Extract title
    let title = $('.product-title-text').text().trim();
    if (!title) title = $('h1.product-name').text().trim();
    if (!title) title = $('h1').first().text().trim();

    // Extract price
    let priceText = $('.product-price-value').text().trim();
    if (!priceText) priceText = $('.uniform-banner-box-price').text().trim();
    if (!priceText) priceText = $('[itemprop="price"]').attr('content');
    
    const price = parseFloat(priceText?.replace(/[^0-9.]/g, '') || 0);

    // Extract stock status
    let stock = 'in_stock';
    const stockText = $('.product-quantity-tip').text().toLowerCase();
    const availText = $('.product-reviewer').text().toLowerCase();
    
    if (stockText.includes('sold out') || availText.includes('unavailable')) {
      stock = 'out_of_stock';
    } else if (stockText.includes('only') || /\d+\s*pieces available/.test(stockText)) {
      stock = 'low_stock';
    }

    // Extract images
    const images = [];
    $('img').each((i, elem) => {
      const src = $(elem).attr('src') || $(elem).attr('data-src');
      if (src && (src.includes('alicdn.com') || src.includes('ae01'))) {
        images.push(src.startsWith('//') ? 'https:' + src : src);
      }
    });

      if (!title || title.length < 3) {
        throw new Error('Could not extract valid product title from AliExpress page');
      }
      
      return {
        title: title || 'AliExpress Product',
        price: price || 0,
        stock,
        images: images.length > 0 ? images.slice(0, 5) : []
      };
    }, 3, 1000);
  } catch (error) {
    console.error('AliExpress scraping error after retries:', error.message);
    throw new Error('Failed to fetch AliExpress product data: ' + error.message);
  }
};

/**
 * Fetch data from Amazon with retry logic
 */
const fetchAmazon = async (url) => {
  await waitForRateLimit('amazon');
  
  try {
    return await retryWithBackoff(async () => {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        },
        timeout: 15000
      });

    const $ = cheerio.load(response.data);

    // Extract title
    let title = $('#productTitle').text().trim();
    
    // Extract price
    let priceText = $('.a-price .a-offscreen').first().text().trim();
    if (!priceText) priceText = $('#priceblock_ourprice').text().trim();
    if (!priceText) priceText = $('#priceblock_dealprice').text().trim();
    
    const price = parseFloat(priceText?.replace(/[^0-9.]/g, '') || 0);

    // Extract stock status
    let stock = 'in_stock';
    const availText = $('#availability').text().toLowerCase();
    
    if (availText.includes('out of stock') || availText.includes('unavailable')) {
      stock = 'out_of_stock';
    } else if (availText.includes('only') && availText.includes('left')) {
      stock = 'low_stock';
    }

    // Extract images
    const images = [];
    $('#altImages img').each((i, elem) => {
      const src = $(elem).attr('src');
      if (src) {
        images.push(src.replace(/\._.*_\./, '.'));
      }
    });

      if (!title || title.length < 3) {
        throw new Error('Could not extract valid product title from Amazon page');
      }
      
      return {
        title: title || 'Amazon Product',
        price: price || 0,
        stock,
        images: images.length > 0 ? images.slice(0, 5) : []
      };
    }, 3, 1000);
  } catch (error) {
    console.error('Amazon scraping error after retries:', error.message);
    throw new Error('Failed to fetch Amazon product data: ' + error.message);
  }
};

/**
 * Generic scraper for any website with retry logic
 */
const fetchGeneric = async (url) => {
  await waitForRateLimit('generic');
  
  try {
    return await retryWithBackoff(async () => {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 15000
      });

    const $ = cheerio.load(response.data);

    // Try to find title
    let title = $('h1').first().text().trim();
    if (!title) title = $('title').text().trim();
    if (!title) title = $('[itemprop="name"]').text().trim();

    // Try to find price
    let priceText = $('[itemprop="price"]').attr('content');
    if (!priceText) priceText = $('.price').first().text().trim();
    if (!priceText) priceText = $('[class*="price"]').first().text().trim();
    
    const price = parseFloat(priceText?.replace(/[^0-9.]/g, '') || 0);

    // Stock detection
    let stock = 'unknown';
    const bodyText = $('body').text().toLowerCase();
    
    if (bodyText.includes('in stock') || bodyText.includes('available')) {
      stock = 'in_stock';
    } else if (bodyText.includes('out of stock') || bodyText.includes('sold out')) {
      stock = 'out_of_stock';
    } else if (bodyText.includes('low stock') || bodyText.includes('limited')) {
      stock = 'low_stock';
    }

    // Extract images
    const images = [];
    $('img').each((i, elem) => {
      const src = $(elem).attr('src');
      if (src && !src.includes('data:image') && (src.startsWith('http') || src.startsWith('//'))) {
        images.push(src.startsWith('//') ? 'https:' + src : src);
      }
    });

      if (!title || title.length < 3) {
        throw new Error('Could not extract valid product title from supplier page');
      }
      
      return {
        title: title || 'Supplier Product',
        price: price || 0,
        stock,
        images: images.length > 0 ? images.slice(0, 5) : []
      };
    }, 3, 1000);
  } catch (error) {
    console.error('Generic scraping error after retries:', error.message);
    throw new Error('Failed to fetch supplier data: ' + error.message);
  }
};

/**
 * Main function to fetch supplier data
 * NO DEMO FALLBACK - only returns real data or throws error
 */
const fetchSupplierData = async (url) => {
  if (!url) {
    throw new Error('Supplier URL is required');
  }

  const supplier = detectSupplier(url);

  let data;
  switch (supplier) {
    case 'aliexpress':
      data = await fetchAliExpress(url);
      break;
    case 'amazon':
      data = await fetchAmazon(url);
      break;
    default:
      data = await fetchGeneric(url);
  }

  if (!data) {
    throw new Error('Could not fetch supplier data');
  }

  return data;
};

module.exports = {
  fetchSupplierData,
  detectSupplier
};

