const axios = require('axios');
require('dotenv').config();

// Store configuration - will be loaded from env vars or config file
const storeConfig = {
  NL: {
    shopName: process.env.SHOPIFY_SHOP_NL || 'nl-store.myshopify.com',
    apiKey: process.env.SHOPIFY_API_KEY_NL,
    apiPassword: process.env.SHOPIFY_API_PASSWORD_NL,
  },
  DE: {
    shopName: process.env.SHOPIFY_SHOP_DE || 'de-store.myshopify.com',
    apiKey: process.env.SHOPIFY_API_KEY_DE,
    apiPassword: process.env.SHOPIFY_API_PASSWORD_DE,
  },
  // Add more stores as needed
};

async function getOrders(filters = {}) {
  const { store_id, dateFrom, dateTo } = filters;

  try {
    if (!storeConfig[store_id]) {
      throw new Error(`Store ${store_id} not configured`);
    }

    const config = storeConfig[store_id];
    
    // Build Shopify API URL
    const shopUrl = `https://${config.apiKey}:${config.apiPassword}@${config.shopName}/admin/api/2024-01/orders.json`;

    const params = {
      created_at_min: dateFrom,
      created_at_max: dateTo,
      limit: 250,
      status: 'any',
      fields: 'id,created_at,line_items',
    };

    console.log(`📦 Shopify: Fetching orders for ${store_id} from ${dateFrom} to ${dateTo}`);

    const response = await axios.get(shopUrl, { params });
    const orders = response.data.orders || [];

    // Transform to our data model
    return orders.map(order => ({
      shopify_order_id: order.id.toString(),
      store_id,
      order_date: order.created_at,
      order_hour: truncateToHour(order.created_at),
      product_count: order.line_items.length,
      source: 'shopify',
    }));

  } catch (error) {
    console.error(`❌ Shopify API Error for ${store_id}:`, error.message);
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
  const { store_id, dateFrom, dateTo } = filters;

  console.log(`📦 Shopify (MOCK): Generating test orders for ${store_id}`);

  // Generate mock data for testing
  const mockOrders = [];
  const baseDate = new Date(dateFrom);
  
  for (let i = 0; i < 50; i++) {
    const orderDate = new Date(baseDate.getTime() + i * 3600000); // Every hour
    mockOrders.push({
      shopify_order_id: `MOCK-${store_id}-${i}`,
      store_id,
      order_date: orderDate.toISOString(),
      order_hour: truncateToHour(orderDate.toISOString()),
      product_count: Math.floor(Math.random() * 5) + 1,
      source: 'shopify',
    });
  }

  return mockOrders;
}

module.exports = {
  getOrders,
  getMockOrders,
  truncateToHour,
};
