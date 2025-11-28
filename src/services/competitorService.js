const axios = require('axios');

// Cache for eBay OAuth token
let cachedToken = null;
let tokenExpiry = null;

/**
 * Get eBay OAuth token using client credentials
 */
const getEbayToken = async () => {
  // Return cached token if still valid
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
    tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // Refresh 1 min early

    return cachedToken;
  } catch (error) {
    console.error('Failed to get eBay OAuth token:', error.message);
    throw error;
  }
};

/**
 * Fetch real competitor data using eBay Browse API
 */
const fetchRealCompetitors = async (product) => {
  try {
    const token = await getEbayToken();
    
    // Use product title for search
    const searchQuery = product.title
      .replace(/[^\w\s]/gi, ' ') // Remove special chars
      .trim()
      .split(/\s+/)
      .slice(0, 5) // Use first 5 words
      .join(' ');

    const browseUrl = process.env.EBAY_ENV === 'PRODUCTION'
      ? 'https://api.ebay.com/buy/browse/v1/item_summary/search'
      : 'https://api.sandbox.ebay.com/buy/browse/v1/item_summary/search';

    const response = await axios.get(browseUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_GB'
      },
      params: {
        q: searchQuery,
        limit: 20,
        filter: 'deliveryCountry:GB',
        sort: 'price'
      }
    });

    if (!response.data.itemSummaries || response.data.itemSummaries.length === 0) {
      console.log('No competitor listings found via eBay API');
      return null;
    }

    // Process competitor listings
    const listings = response.data.itemSummaries
      .filter(item => item.itemId !== product.ebayItemId) // Exclude our own listing
      .slice(0, 10) // Limit to top 10
      .map(item => ({
        sellerName: item.seller?.username || 'Unknown',
        price: item.price?.value ? parseFloat(item.price.value) : 0,
        shippingCost: item.shippingOptions?.[0]?.shippingCost?.value 
          ? parseFloat(item.shippingOptions[0].shippingCost.value) 
          : 0,
        location: item.itemLocation?.country || 'United Kingdom',
        listingId: item.itemId,
        url: item.itemWebUrl || `https://www.ebay.co.uk/itm/${item.itemId}`,
        feedbackScore: item.seller?.feedbackPercentage || 0,
        condition: item.condition || 'Unknown',
        image: item.image?.imageUrl || null,
        lastSeenAt: new Date(),
        isDemo: false
      }));

    if (listings.length === 0) {
      return null;
    }

    // Sort by price
    listings.sort((a, b) => a.price - b.price);
    const cheapest = listings[0];

    return {
      listings,
      summary: {
        lowestPrice: cheapest.price,
        sellerName: cheapest.sellerName,
        listingId: cheapest.listingId,
        url: cheapest.url,
        totalSellers: listings.length,
        differenceToOurPrice: product.ebayPrice
          ? Number((product.ebayPrice - cheapest.price).toFixed(2))
          : undefined,
        lastCheckedAt: new Date(),
        isDemo: false
      }
    };
  } catch (error) {
    console.error('Failed to fetch real competitors:', error.message);
    return null;
  }
};

/**
 * Fetch competitor insights with real API only
 * Returns competitor data from eBay Browse API, returns null if no data available
 * NO DEMO FALLBACK - only real data
 */
const fetchCompetitorInsights = async (product) => {
  try {
    // Try to fetch real competitor data from eBay Browse API
    const realData = await fetchRealCompetitors(product);
    
    if (realData && realData.listings && realData.listings.length > 0) {
      console.log(`✓ Real competitor data fetched for: ${product.title} (${realData.listings.length} listings)`);
      return realData;
    }

    // No demo fallback - return null if no real data available
    console.log(`⚠ No competitor listings found via API for: ${product.title}`);
    return null;
  } catch (error) {
    console.error(`Competitor insights error for "${product.title}":`, error.message);
    
    // No demo fallback - return null on error
    return null;
  }
};

module.exports = {
  fetchCompetitorInsights
};


