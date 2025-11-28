const axios = require('axios');

const sendAlertWebhook = async (url, alert, product) => {
  if (!url) {
    return false;
  }

  try {
    // Basic validation
    new URL(url);
  } catch (error) {
    console.error('Invalid webhook URL configured:', url);
    return false;
  }

  try {
    await axios.post(
      url,
      {
        alert: {
          id: alert._id,
          type: alert.type,
          message: alert.message,
          severity: alert.severity,
          oldValue: alert.oldValue,
          newValue: alert.newValue,
          createdAt: alert.createdAt
        },
        product: {
          id: product._id,
          title: product.title,
          ebayItemId: product.ebayItemId,
          ebayUrl: product.ebayUrl,
          supplierUrl: product.supplierUrl
        },
        sentAt: new Date().toISOString()
      },
      {
        timeout: 5000
      }
    );
    return true;
  } catch (error) {
    console.error('Webhook notification error:', error.message);
    return false;
  }
};

module.exports = {
  sendAlertWebhook
};


