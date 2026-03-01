const axios = require('axios');
require('dotenv').config();

const config = {
  apiKey: process.env.SHOPIFY_API_KEY,
  apiPassword: process.env.SHOPIFY_API_PASSWORD,
  shopName: process.env.SHOPIFY_SHOP_NAME,
};

if (!config.apiKey || !config.apiPassword || !config.shopName) {
  console.warn('⚠️ Shopify credentials incomplete');
}

async function getOrdersViaREST(filters = {}) {
  const { dateFrom, dateTo } = filters;

  try {
    // Use Shopify REST API with Basic Auth
    const baseUrl = `https://${config.shopName}/admin/api/2024-01`;
    const ordersUrl = `${baseUrl}/orders.json`;

    const createdAtMin = new Date(dateFrom).toISOString();
    const createdAtMax = new Date(dateTo).toISOString();

    console.log(`📦 Shopify REST: Fetching orders from ${dateFrom} to ${dateTo}`);

    const response = await axios.get(ordersUrl, {
      params: {
        created_at_min: createdAtMin,
        created_at_max: createdAtMax,
        limit: 250,
        status: 'any',
      },
      auth: {
        username: config.apiKey,
        password: config.apiPassword,
      },
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const orders = response.data.orders || [];
    console.log(`✅ Got ${orders.length} orders from Shopify REST`);

    return orders.map((order) => ({
      shopify_order_id: order.id,
      order_date: order.created_at,
      order_hour: truncateToHour(order.created_at),
      customer_email: order.customer?.email || 'unknown',
      product_count: order.line_items?.length || 0,
      total_price: parseFloat(order.total_price),
      tags: ['SWB'], // Default tag
      source: 'shopify-rest',
    }));
  } catch (error) {
    console.warn(`⚠️ Shopify REST failed: ${error.message}`);
    return [];
  }
}

function truncateToHour(isoDate) {
  const date = new Date(isoDate);
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}

module.exports = {
  getOrdersViaREST,
};
