const axios = require('axios');
require('dotenv').config();

// Single store configuration from environment variables
const config = {
  shopName: process.env.SHOPIFY_SHOP_NAME || 'nl-store.myshopify.com',
  apiKey: process.env.SHOPIFY_API_KEY,
  apiPassword: process.env.SHOPIFY_API_PASSWORD,
};

// Validate required env vars on startup
if (!config.apiKey || !config.apiPassword) {
  console.warn('⚠️ Shopify API credentials missing - SHOPIFY_API_KEY or SHOPIFY_API_PASSWORD not set');
}

async function getOrders(filters = {}) {
  const { dateFrom, dateTo } = filters;

  try {
    // Build Shopify API URL
    const shopUrl = `https://${config.apiKey}:${config.apiPassword}@${config.shopName}/admin/api/2024-01/orders.json`;

    const params = {
      created_at_min: dateFrom,
      created_at_max: dateTo,
      limit: 250,
      status: 'any',
      fields: 'id,created_at,line_items',
    };

    console.log(`🛍️ Shopify: Fetching orders from ${dateFrom} to ${dateTo}`);

    const response = await axios.get(shopUrl, { params });
    const orders = response.data.orders || [];

    // Transform to our data model
    return orders.map((order) => ({
      shopify_order_id: order.id.toString(),
      order_date: order.created_at,
      order_hour: truncateToHour(order.created_at),
      product_count: order.line_items.length,
      source: 'shopify',
    }));
  } catch (error) {
    console.error(`❌ Shopify API Error: ${error.message}`);
    throw error;
  }
}

function truncateToHour(isoDate) {
  const date = new Date(isoDate);
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}

// Mock function for testing without API keys
async function getMockOrders(filters = {}) {
  const { dateFrom, dateTo } = filters;

  console.log(`🧪 Shopify (MOCK): Generating test orders`);

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

module.exports.exports = {
  getOrders,
  getMockOrders,
  truncateToHour,
};
