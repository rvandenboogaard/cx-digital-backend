const axios = require('axios');
require('dotenv').config();

// Shopify configuration
const config = {
  apiKey: process.env.SHOPIFY_API_KEY,
  apiPassword: process.env.SHOPIFY_API_PASSWORD,
  shopName: process.env.SHOPIFY_SHOP_NAME,
};

// Validate on startup
if (!config.apiKey || !config.apiPassword || !config.shopName) {
  console.warn('⚠️ Shopify credentials incomplete for proxy');
}

async function getOrdersViaProxy(filters = {}) {
  const { dateFrom, dateTo, tags = [] } = filters;

  try {
    // Build Shopify REST API URL
    const baseUrl = `https://${config.apiKey}:${config.apiPassword}@${config.shopName}/admin/api/2024-01`;
    const ordersUrl = `${baseUrl}/orders.json`;

    console.log(`📦 Shopify Proxy: Fetching orders from ${dateFrom} to ${dateTo}`);

    // Fetch orders with created_at_min/max filters
    const createdAtMin = new Date(dateFrom).toISOString();
    const createdAtMax = new Date(dateTo).toISOString();

    const response = await axios.get(ordersUrl, {
      params: {
        created_at_min: createdAtMin,
        created_at_max: createdAtMax,
        limit: 250,
        status: 'any',
      },
      timeout: 10000,
    });

    const orders = response.data.orders || [];

    // Transform to our data model
    return orders.map((order) => ({
      shopify_order_id: order.id,
      order_date: order.created_at,
      order_hour: truncateToHour(order.created_at),
      customer_email: order.customer?.email || 'unknown',
      product_count: order.line_items?.length || 0,
      total_price: parseFloat(order.total_price),
      tags: extractTags(order), // Parse tags from order
      source: 'shopify',
    }));
  } catch (error) {
    console.error(`❌ Shopify Proxy Error: ${error.message}`);
    throw error;
  }
}

function truncateToHour(isoDate) {
  const date = new Date(isoDate);
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}

function extractTags(order) {
  // Extract market tags from order tags or notes
  const tags = [];
  const orderTags = order.tags ? order.tags.split(',').map(t => t.trim()) : [];
  
  // Check for market tags
  const marketTags = ['SWB', 'SWA', 'SWS', 'BSW', 'CSW'];
  orderTags.forEach(tag => {
    if (marketTags.includes(tag)) {
      tags.push(tag);
    }
  });

  // If no market tags found, use NL as default
  if (tags.length === 0) {
    tags.push('SWB'); // Default to Benelux
  }

  return tags;
}

module.exports = {
  getOrdersViaProxy,
  truncateToHour,
};
