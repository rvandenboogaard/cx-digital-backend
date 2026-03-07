const axios = require('axios');

/**
 * Fetch orders from a single Shopify store
 * Credentials are passed in - no hardcoding, no multi-store config object
 * 
 * @param {Object} credentials - { shopName, apiKey, apiPassword }
 * @param {Object} filters - { dateFrom, dateTo }
 * @returns {Array} Transformed order objects
 */
async function getOrders(credentials, filters = {}) {
  const { shopName, apiKey, apiPassword } = credentials;
  const { dateFrom, dateTo } = filters;

  // Validate credentials exist
  if (!shopName || !apiKey || !apiPassword) {
    throw new Error('Missing Shopify credentials: shopName, apiKey, and apiPassword required');
  }

  try {
    // Build Shopify API URL
    const shopUrl = `https://${apiKey}:${apiPassword}@${shopName}/admin/api/2024-01/orders.json`;

    const params = {
      created_at_min: dateFrom,
      created_at_max: dateTo,
      limit: 250,
      status: 'any',
      fields: 'id,created_at,line_items',
    };

    console.log(`📦 Shopify: Fetching orders from ${shopName} (${dateFrom} to ${dateTo})`);

    const response = await axios.get(shopUrl, { params });
    const orders = response.data.orders || [];

    // Transform to our data model
    return orders.map(order => ({
      shopify_order_id: order.id.toString(),
      order_date: order.created_at,
      order_hour: truncateToHour(order.created_at),
      product_count: order.line_items.length,
      source: 'shopify',
    }));

  } catch (error) {
    console.error(`❌ Shopify API Error (${shopName}):`, error.message);
    throw error;
  }
}

/**
 * Mock function for testing without API keys
 * Same signature as getOrders - useful for dev/testing
 */
async function getMockOrders(credentials, filters = {}) {
  const { dateFrom, dateTo } = filters;
  const shopName = credentials?.shopName || 'mock-store';

  console.log(`📦 Shopify (MOCK): Generating test orders for ${shopName}`);

  // Generate mock data for testing
  const mockOrders = [];
  const baseDate = new Date(dateFrom);
  
  for (let i = 0; i < 50; i++) {
    const orderDate = new Date(baseDate.getTime() + i * 3600000); // Every hour
    mockOrders.push({
      shopify_order_id: `MOCK-${i}`,
      order_date: orderDate.toISOString(),
      order_hour: truncateToHour(orderDate.toISOString()),
      product_count: Math.floor(Math.random() * 5) + 1,
      source: 'shopify',
    });
  }

  return mockOrders;
}

/**
 * Truncate ISO date to hourly precision
 */
function truncateToHour(isoDate) {
  const date = new Date(isoDate);
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}

module.exports = {
  getOrders,
  getMockOrders,
  truncateToHour,
};
