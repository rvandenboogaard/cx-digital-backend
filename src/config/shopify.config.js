require('dotenv').config();

/**
 * Load Shopify credentials for a specific store from .env
 * 
 * Expects .env to have:
 * SHOPIFY_SHOP_NL=...
 * SHOPIFY_API_KEY_NL=...
 * SHOPIFY_API_PASSWORD_NL=...
 * (and same for DE, FR, etc.)
 * 
 * @param {string} storeId - Store identifier (NL, DE, FR, etc.)
 * @returns {Object} { shopName, apiKey, apiPassword }
 */
function loadStoreCredentials(storeId) {
  if (!storeId) {
    throw new Error('storeId is required');
  }

  const upperStoreId = storeId.toUpperCase();
  
  const shopName = process.env[`SHOPIFY_SHOP_${upperStoreId}`];
  const apiKey = process.env[`SHOPIFY_API_KEY_${upperStoreId}`];
  const apiPassword = process.env[`SHOPIFY_API_PASSWORD_${upperStoreId}`];

  if (!shopName || !apiKey || !apiPassword) {
    throw new Error(
      `Missing Shopify credentials for store: ${storeId}. ` +
      `Expected .env vars: SHOPIFY_SHOP_${upperStoreId}, SHOPIFY_API_KEY_${upperStoreId}, SHOPIFY_API_PASSWORD_${upperStoreId}`
    );
  }

  return {
    shopName,
    apiKey,
    apiPassword,
  };
}

module.exports = {
  loadStoreCredentials,
};
