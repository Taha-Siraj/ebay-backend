let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (error) {
  console.error('Puppeteer not installed. Please run: npm install puppeteer');
  throw new Error('Puppeteer is required for JS-rendered page scraping. Please install it: npm install puppeteer');
}

let browserInstance = null;

/**
 * Get or create browser instance (singleton)
 */
const getBrowser = async () => {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
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
  }
  return browserInstance;
};

/**
 * Close browser instance
 */
const closeBrowser = async () => {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
};

/**
 * Helper function to navigate with retry logic
 */
const navigateWithRetry = async (page, url, maxRetries = 3) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      return;
    } catch (error) {
      if (attempt === maxRetries - 1) {
        // Last attempt, try networkidle2 then load
        try {
          await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
          return;
        } catch (error2) {
          await page.goto(url, { waitUntil: "load", timeout: 30000 });
          return;
        }
      }
      console.log(`Navigation attempt ${attempt + 1} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
};

/**
 * Setup page with user agent, headers, and webdriver removal
 */
const setupPage = async (page) => {
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36");
  await page.setExtraHTTPHeaders({ "accept-language": "en-GB,en-US;q=0.9,en;q=0.8" });
  await page.evaluateOnNewDocument(() => {
    delete navigator.__proto__.webdriver;
  });
};

/**
 * Extract sellerID from storefront page using Puppeteer
 */
const extractSellerIdFromStorefront = async (storeUrl) => {
  let browser = null;
  let page = null;

  try {
    browser = await getBrowser();
    page = await browser.newPage();
    await setupPage(page);
    
    // Navigate to storefront with retry
    await navigateWithRetry(page, storeUrl);

    // Wait for page to fully render
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract sellerID using multiple methods
    const sellerId = await page.evaluate(() => {
      // Method 1: JSON-LD structured data - comprehensive patterns
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of jsonLdScripts) {
        try {
          const data = JSON.parse(script.textContent);
          // Try mainEntity.seller.name
          if (data.mainEntity && data.mainEntity.seller && data.mainEntity.seller.name) {
            return data.mainEntity.seller.name;
          }
          // Try seller.name
          if (data.seller && data.seller.name) {
            return data.seller.name;
          }
          // Try seller.username
          if (data.seller && data.seller.username) {
            return data.seller.username;
          }
          // Try author.name
          if (data.author && data.author.name) {
            return data.author.name;
          }
          // Try brand.name (fallback)
          if (data.brand && data.brand.name) {
            return data.brand.name;
          }
        } catch (e) {}
      }

      // Method 2: Meta tags - twitter:creator
      const twitterMeta = document.querySelector('meta[name="twitter:creator"]');
      if (twitterMeta) {
        const content = twitterMeta.getAttribute('content');
        if (content) {
          // Extract username from @username or just username
          const match = content.match(/@?([^"'\s,]+)/);
          if (match && match[1]) {
            const username = match[1].trim();
            if (username && username !== 'eBay UK' && username !== 'eBay' && username.length < 50) {
              return username;
            }
          }
        }
      }

      // Method 3: DOM elements - comprehensive selectors
      // mbg-id with span
      const mbgId = document.querySelector('a.mbg-id span, .mbg-id span, a[class*="mbg-id"] span');
      if (mbgId && mbgId.textContent.trim()) {
        const text = mbgId.textContent.trim();
        if (text && text !== 'eBay UK' && text !== 'eBay' && text.length < 50) {
          return text;
        }
      }

      // mbg-id link itself
      const mbgIdLink = document.querySelector('a.mbg-id, .mbg-id');
      if (mbgIdLink && mbgIdLink.textContent.trim()) {
        const text = mbgIdLink.textContent.trim();
        if (text && text !== 'eBay UK' && text !== 'eBay' && text.length < 50) {
          return text;
        }
      }

      // mbg-nw
      const mbgNw = document.querySelector('a.mbg-nw, .mbg-nw');
      if (mbgNw && mbgNw.textContent.trim()) {
        const text = mbgNw.textContent.trim();
        if (text && text !== 'eBay UK' && text !== 'eBay' && text.length < 50) {
          return text;
        }
      }

      // seller-info-name
      const sellerInfoName = document.querySelector('.seller-info-name, [class*="seller-info-name"]');
      if (sellerInfoName && sellerInfoName.textContent.trim()) {
        const text = sellerInfoName.textContent.trim();
        if (text && text !== 'eBay UK' && text !== 'eBay' && text.length < 50) {
          return text;
        }
      }

      // str-seller-info
      const strSellerInfo = document.querySelector('.str-seller-info, [class*="seller-info"]');
      if (strSellerInfo) {
        const text = strSellerInfo.textContent.trim();
        if (text && text.length > 0 && text !== 'eBay UK' && text !== 'eBay' && text.length < 50) {
          return text;
        }
      }

      // Method 4: Script tags with seller data - enhanced patterns
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const content = script.textContent || '';
        
        // Look for sellerName, sellerId, username patterns (more comprehensive)
        const patterns = [
          /"sellerName"\s*:\s*"([^"]+)"/,
          /"sellerId"\s*:\s*"([^"]+)"/,
          /"username"\s*:\s*"([^"]+)"/,
          /sellerUsername["\s]*[:=]["\s]*([^"'\s,}]+)/,
          /"seller"\s*:\s*{\s*"username"\s*:\s*"([^"]+)"/,
          /seller["\s]*:["\s]*{["\s]*name["\s]*:["\s]*"([^"]+)"/,
          /seller["\s]*:["\s]*{["\s]*id["\s]*:["\s]*"([^"]+)"/,
          /"seller"\s*:\s*{\s*"name"\s*:\s*"([^"]+)"/,
          /"seller"\s*:\s*{\s*"id"\s*:\s*"([^"]+)"/,
          /sellerName["\s]*[:=]["\s]*["']([^"']+)["']/,
          /sellerId["\s]*[:=]["\s]*["']([^"']+)["']/
        ];

        for (const pattern of patterns) {
          const match = content.match(pattern);
          if (match && match[1]) {
            const sellerID = match[1].replace(/["'}\s]/g, '').trim();
            if (sellerID && sellerID.length > 0 && sellerID !== 'eBay UK' && sellerID !== 'eBay' && sellerID.length < 50 && !sellerID.includes('http')) {
              return sellerID;
            }
          }
        }
      }

      // Method 5: Look for seller links in the page
      const sellerLinks = document.querySelectorAll('a[href*="/usr/"], a[href*="/str/"]');
      for (const link of sellerLinks) {
        const href = link.getAttribute('href');
        if (href) {
          const match = href.match(/\/(?:usr|str)\/([^/?]+)/);
          if (match && match[1]) {
            const username = decodeURIComponent(match[1]).trim();
            if (username && username !== 'eBay UK' && username !== 'eBay' && username.length < 50) {
              return username;
            }
          }
        }
      }

      return null;
    });

    if (sellerId && sellerId !== 'eBay UK' && sellerId !== 'eBay') {
      return sellerId;
    }

    return null;
  } catch (error) {
    console.error(`Error extracting sellerID with Puppeteer:`, error.message);
    return null;
  } finally {
    if (page) {
      await page.close();
    }
  }
};

/**
 * Extract sellerID from product page using Puppeteer
 */
const extractSellerIdFromProductPage = async (productUrl) => {
  let browser = null;
  let page = null;

  try {
    browser = await getBrowser();
    page = await browser.newPage();
    await setupPage(page);
    
    // Navigate with retry
    await navigateWithRetry(page, productUrl);

    await new Promise(resolve => setTimeout(resolve, 2000));

    const sellerId = await page.evaluate(() => {
      // Method 1: JSON-LD structured data - comprehensive patterns
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of jsonLdScripts) {
        try {
          const data = JSON.parse(script.textContent);
          // Try mainEntity.seller.name
          if (data.mainEntity && data.mainEntity.seller && data.mainEntity.seller.name) {
            return data.mainEntity.seller.name;
          }
          // Try seller.name
          if (data.seller && data.seller.name) {
            return data.seller.name;
          }
          // Try seller.username
          if (data.seller && data.seller.username) {
            return data.seller.username;
          }
          // Try seller.identifier
          if (data.seller && data.seller.identifier) {
            return data.seller.identifier;
          }
          // Try author.name
          if (data.author && data.author.name) {
            return data.author.name;
          }
        } catch (e) {}
      }

      // Method 2: Meta tags - twitter:creator
      const twitterMeta = document.querySelector('meta[name="twitter:creator"]');
      if (twitterMeta) {
        const content = twitterMeta.getAttribute('content');
        if (content) {
          const match = content.match(/@?([^"'\s,]+)/);
          if (match && match[1]) {
            const username = match[1].trim();
            if (username && username !== 'eBay UK' && username !== 'eBay' && username.length < 50) {
              return username;
            }
          }
        }
      }

      // Method 3: Script tags with enhanced patterns
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const content = script.textContent || '';
        const patterns = [
          /"seller"\s*:\s*{\s*"username"\s*:\s*"([^"]+)"/,
          /"seller"\s*:\s*{\s*"name"\s*:\s*"([^"]+)"/,
          /"seller"\s*:\s*{\s*"id"\s*:\s*"([^"]+)"/,
          /"sellerName"\s*:\s*"([^"]+)"/,
          /"sellerId"\s*:\s*"([^"]+)"/,
          /"username"\s*:\s*"([^"]+)"/,
          /sellerUsername["\s]*[:=]["\s]*([^"'\s,}]+)/,
          /sellerName["\s]*[:=]["\s]*["']([^"']+)["']/,
          /sellerId["\s]*[:=]["\s]*["']([^"']+)["']/
        ];

        for (const pattern of patterns) {
          const match = content.match(pattern);
          if (match && match[1]) {
            const sellerID = match[1].replace(/["'}\s]/g, '').trim();
            if (sellerID && sellerID.length > 0 && sellerID !== 'eBay UK' && sellerID !== 'eBay' && sellerID.length < 50 && !sellerID.includes('http')) {
              return sellerID;
            }
          }
        }
      }

      // Method 4: DOM elements - comprehensive selectors
      // mbg-id with span
      const mbgId = document.querySelector('a.mbg-id span, .mbg-id span, a[class*="mbg-id"] span');
      if (mbgId && mbgId.textContent.trim()) {
        const text = mbgId.textContent.trim();
        if (text && text !== 'eBay UK' && text !== 'eBay' && text.length < 50) {
          return text;
        }
      }

      // mbg-id link itself
      const mbgIdLink = document.querySelector('a.mbg-id, .mbg-id');
      if (mbgIdLink && mbgIdLink.textContent.trim()) {
        const text = mbgIdLink.textContent.trim();
        if (text && text !== 'eBay UK' && text !== 'eBay' && text.length < 50) {
          return text;
        }
      }

      // seller-info-name
      const sellerInfoName = document.querySelector('.seller-info-name, [class*="seller-info-name"]');
      if (sellerInfoName && sellerInfoName.textContent.trim()) {
        const text = sellerInfoName.textContent.trim();
        if (text && text !== 'eBay UK' && text !== 'eBay' && text.length < 50) {
          return text;
        }
      }

      // Method 5: Seller link
      const sellerLink = document.querySelector('a[href*="/usr/"], a[href*="/str/"]');
      if (sellerLink) {
        const href = sellerLink.getAttribute('href');
        if (href) {
          const match = href.match(/\/(?:usr|str)\/([^/?]+)/);
          if (match && match[1]) {
            const username = decodeURIComponent(match[1]).trim();
            if (username && username !== 'eBay UK' && username !== 'eBay' && username.length < 50) {
              return username;
            }
          }
        }
      }

      return null;
    });

    if (sellerId && sellerId !== 'eBay UK' && sellerId !== 'eBay') {
      return sellerId;
    }

    return null;
  } catch (error) {
    console.error(`Error extracting sellerID from product page:`, error.message);
    return null;
  } finally {
    if (page) {
      await page.close();
    }
  }
};

/**
 * Scrape store listings using Puppeteer (for JS-rendered pages)
 */
const scrapeStoreListings = async (storeUrl, maxPages = 5) => {
  let browser = null;
  let page = null;
  const allItems = [];

  try {
    browser = await getBrowser();
    page = await browser.newPage();
    await setupPage(page);

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      try {
        const url = pageNum === 1 ? storeUrl : `${storeUrl}${storeUrl.includes('?') ? '&' : '?'}_pgn=${pageNum}`;

        // Navigate with retry
        await navigateWithRetry(page, url);

        await new Promise(resolve => setTimeout(resolve, 2000));

        const pageItems = await page.evaluate(() => {
          const items = [];
          const itemLinks = new Set();

          // Find all item links
          document.querySelectorAll('a[href*="/itm/"]').forEach(link => {
            const href = link.getAttribute('href');
            if (href) {
              const fullUrl = href.startsWith('http') ? href : `https://www.ebay.co.uk${href}`;
              const itemIdMatch = fullUrl.match(/\/itm\/(\d+)/);
              if (itemIdMatch && !itemLinks.has(itemIdMatch[1])) {
                itemLinks.add(itemIdMatch[1]);
                
                // Try to extract title and price from the listing card
                const card = link.closest('.s-item, [class*="item"], [class*="listing"]');
                let title = '';
                let price = 0;
                let image = '';

                if (card) {
                  const titleEl = card.querySelector('.s-item__title, [class*="title"], h3');
                  if (titleEl) title = titleEl.textContent.trim();

                  const priceEl = card.querySelector('.s-item__price, [class*="price"]');
                  if (priceEl) {
                    const priceText = priceEl.textContent.replace(/[^0-9.]/g, '');
                    price = parseFloat(priceText) || 0;
                  }

                  const imgEl = card.querySelector('img');
                  if (imgEl) {
                    image = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
                  }
                }

                if (!title && link.textContent) {
                  title = link.textContent.trim();
                }

                if (itemIdMatch[1]) {
                  items.push({
                    itemId: itemIdMatch[1],
                    url: fullUrl.split('?')[0],
                    title: title || `Item ${itemIdMatch[1]}`,
                    price: price,
                    images: image ? [image] : []
                  });
                }
              }
            }
          });

          return items;
        });

        if (pageItems.length === 0) {
          break;
        }

        allItems.push(...pageItems);

        // Small delay between pages
        if (pageNum < maxPages) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`Error scraping page ${pageNum}:`, error.message);
        if (pageNum === 1) break;
      }
    }

    return allItems.length > 0 ? allItems : null;
  } catch (error) {
    console.error('Puppeteer store scraping error:', error.message);
    return null;
  } finally {
    if (page) {
      await page.close();
    }
  }
};

/**
 * Scrape product details from eBay item page using Puppeteer
 */
const scrapeProductDetails = async (productUrl) => {
  let browser = null;
  let page = null;

  try {
    browser = await getBrowser();
    page = await browser.newPage();
    await setupPage(page);

    // Navigate with retry
    await navigateWithRetry(page, productUrl);

    await new Promise(resolve => setTimeout(resolve, 2000));

    const productData = await page.evaluate(() => {
      // Extract title
      let title = '';
      const titleSelectors = [
        'h1.x-item-title__mainTitle',
        '.it-ttl',
        'h1[itemprop="name"]',
        'h1',
        '[data-testid="x-item-title-label"]'
      ];
      for (const selector of titleSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim()) {
          title = el.textContent.trim();
          break;
        }
      }

      // Extract price
      let price = 0;
      const priceSelectors = [
        '.x-price-primary .ux-textspans',
        '#prcIsum',
        '[itemprop="price"]',
        '[data-testid="x-price-primary"]'
      ];
      for (const selector of priceSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const priceText = el.textContent || el.getAttribute('content') || '';
          const priceNum = parseFloat(priceText.replace(/[^0-9.]/g, ''));
          if (priceNum > 0) {
            price = priceNum;
            break;
          }
        }
      }

      // Extract images (gallery)
      const images = [];
      document.querySelectorAll('img[src*="i.ebayimg.com"], img[data-testid*="image"]').forEach(img => {
        const src = img.getAttribute('src') || img.getAttribute('data-src');
        if (src && !src.includes('s-l64') && !src.includes('s-l140') && !images.includes(src)) {
          images.push(src);
        }
      });

      // Extract description
      let description = '';
      const descSelectors = [
        '#desc_wrapper_ctr',
        '#viTabs_0_is',
        '.u-flL.condText',
        '[itemprop="description"]',
        '.notranslate',
        '[data-testid="x-item-condition-text"]',
        '.x-item-condition-value'
      ];
      for (const selector of descSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          description = el.textContent?.trim() || el.innerHTML?.trim() || '';
          if (description) break;
        }
      }

      // Extract variations (if available)
      const variations = [];
      const variationSelects = document.querySelectorAll('.msku-sel select, select[name*="Size"], select[name*="Color"], select[name*="Variation"], select[data-testid*="variation"]');
      variationSelects.forEach((select, index) => {
        const name = select.getAttribute('name') || select.getAttribute('data-testid') || select.previousElementSibling?.textContent?.trim() || `Variation ${index + 1}`;
        const options = [];
        select.querySelectorAll('option').forEach(opt => {
          const value = opt.getAttribute('value');
          const text = opt.textContent?.trim();
          if (value && text && value !== '' && value !== '0') {
            options.push({ value, text });
          }
        });
        if (options.length > 0) {
          variations.push({ name, options });
        }
      });

      // Extract stock status
      let stock = 'in_stock';
      const bodyText = document.body.textContent.toLowerCase();
      if (bodyText.includes('out of stock') || bodyText.includes('sold out')) {
        stock = 'out_of_stock';
      } else if (bodyText.includes('limited') || /only \d+ left/i.test(bodyText)) {
        stock = 'low_stock';
      }

      // Extract item ID from URL
      const itemIdMatch = window.location.pathname.match(/\/itm\/(\d+)/);
      const itemId = itemIdMatch ? itemIdMatch[1] : '';

      return {
        title,
        price,
        images: images.slice(0, 10), // Limit to 10 images for gallery
        stock,
        itemId,
        description: description || '',
        variations: variations.length > 0 ? variations : []
      };
    });

    if (!productData.title || productData.price === 0) {
      throw new Error('Could not extract valid product data');
    }

    return productData;
  } catch (error) {
    console.error('Puppeteer product scraping error:', error.message);
    throw error;
  } finally {
    if (page) {
      await page.close();
    }
  }
};

module.exports = {
  extractSellerIdFromStorefront,
  extractSellerIdFromProductPage,
  scrapeStoreListings,
  scrapeProductDetails,
  closeBrowser
};

