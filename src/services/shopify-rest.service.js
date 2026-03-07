const axios = require('axios');
require('dotenv').config();
const countryMapper = require('./country-mapper.service');

const config = {
  accessToken: process.env.SHOPIFY_API_PASSWORD,
  shopName: process.env.SHOPIFY_SHOP_NAME,
};

if (!config.accessToken || !config.shopName) { console.warn('⚠️ Shopify credentials incomplete'); }

async function getOrdersForDay(baseUrl, dateFrom, dateTo) {
  let allOrders = [];
  let pageInfo = null;
  let page = 1;

  do {
    const params = pageInfo
      ? { page_info: pageInfo, limit: 250 }
      : { created_at_min: dateFrom, created_at_max: dateTo, limit: 250, status: 'any' };

    const response = await axios.get(`${baseUrl}/orders.json`, {
      params,
      headers: { 'X-Shopify-Access-Token': config.accessToken },
      timeout: 8000,
    });

    const orders = response.data.orders || [];
    allOrders = allOrders.concat(orders);

    const linkHeader = response.headers['link'] || '';
    const nextMatch = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    pageInfo = nextMatch ? nextMatch[1] : null;
    page++;

  } while (pageInfo && page <= 5);

  return allOrders;
}

async function getOrdersViaREST(filters = {}) {
  const { dateFrom, dateTo } = filters;
  try {
    const baseUrl = `https://${config.shopName}/admin/api/2024-01`;
    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    console.log(`📦 Shopify REST: Fetching orders from ${dateFrom} to ${dateTo}`);

    // Haal per dag op zodat paginering correct werkt per dag
    let allOrders = [];
    const current = new Date(start);

    while (current < end) {
      const dayStart = current.toISOString();
      const dayEnd = new Date(current);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const dayEndISO = dayEnd < end ? dayEnd.toISOString() : end.toISOString();

      const dayOrders = await getOrdersForDay(baseUrl, dayStart, dayEndISO);
      console.log(`📦 ${dayStart.substring(0, 10)}: ${dayOrders.length} orders`);
      allOrders = allOrders.concat(dayOrders);

      current.setDate(current.getDate() + 1);
    }

    console.log(`✅ Shopify REST totaal: ${allOrders.length} orders`);

    return allOrders.map((order) => {
      const countryCode = order.shipping_address?.country_code || order.billing_address?.country_code;
      const market = countryMapper.mapCountryToMarket(countryCode);
      return {
        shopify_order_id: order.id,
        order_date: order.created_at,
        order_day: order.created_at.substring(0, 10),
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
