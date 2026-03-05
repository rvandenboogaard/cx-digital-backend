const axios = require('axios');
require('dotenv').config();
const countryMapper = require('./country-mapper.service');

const config = {
  accessToken: process.env.SHOPIFY_API_PASSWORD,
  shopName: process.env.SHOPIFY_SHOP_NAME,
};

if (!config.accessToken || !config.shopName) {
  console.warn('⚠️ Shopify credentials incomplete');
}

async function getOrdersViaREST(filters = {}) {
  const { dateFrom, dateTo } = filters;

  try {
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
      headers: {
        'X-Shopify-Access-Token': config.accessToken,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    const orders = response.data.orders || [];
    console.log(`✅ Got ${orders.length} orders from Shopify REST`);

    return orders.map((order) => {
      const countryCode = order.shipping_address?.country_code || order.billing_address?.country_code;
      const market = countryMapper.mapCountryToMarket(countryCode);
      return {
        shopify_order_id: order.id,
        order_date: order.created_at,
        order_hour: truncateToHour(order.created_at),
        customer_email: order.customer?.email || 'unknown',
        product_count: order.line_items?.length || 0,
        total_price: parseFloat(order.total_price),
        country_code: countryCode,
        market_tag: market,
        tags: [market],
        source: 'shopify-rest',
      };
    });

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

module.exports = { getOrdersViaREST };
