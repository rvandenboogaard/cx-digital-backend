/**
 * Order Storage Service
 * Stores Shopify orders in-memory and optionally to JSON file
 * For production: upgrade to database
 */

const fs = require('fs');
const path = require('path');

// In-memory storage
let storedOrders = [];
const ORDERS_FILE = path.join(__dirname, '../../data/orders.json');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Load orders from file on startup
function loadOrdersFromFile() {
  try {
    if (fs.existsSync(ORDERS_FILE)) {
      const data = fs.readFileSync(ORDERS_FILE, 'utf8');
      storedOrders = JSON.parse(data);
      console.log(`✅ Loaded ${storedOrders.length} orders from file`);
    }
  } catch (err) {
    console.warn(`⚠️ Could not load orders file: ${err.message}`);
    storedOrders = [];
  }
}

// Save orders to file (debounced to avoid blocking I/O on every webhook)
let saveTimer = null;
function saveOrdersToFile() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(ORDERS_FILE, JSON.stringify(storedOrders, null, 2));
    } catch (err) {
      console.warn(`⚠️ Could not save orders file: ${err.message}`);
    }
  }, 2000); // batch writes within 2s window
}

/**
 * Store a single order from Shopify webhook
 * @param {object} order - Shopify order object
 * @returns {object} Stored order with metadata
 */
function storeOrder(order) {
  const storedOrder = {
    shopify_order_id: order.id,
    order_number: order.order_number,
    order_date: order.created_at,
    customer_email: order.customer?.email || 'unknown',
    country_code: order.shipping_address?.country_code || order.billing_address?.country_code || 'UNKNOWN',
    total_price: parseFloat(order.total_price),
    product_count: order.line_items?.length || 0,
    source: 'shopify-webhook',
    stored_at: new Date().toISOString()
  };

  // Add market tag (using country mapper)
  const countryMapper = require('./country-mapper.service');
  storedOrder.market_tag = countryMapper.mapCountryToMarket(storedOrder.country_code);

  // Check if order already exists (by Shopify order ID)
  const existingIndex = storedOrders.findIndex(o => o.shopify_order_id === order.id);
  
  if (existingIndex >= 0) {
    // Update existing order
    storedOrders[existingIndex] = storedOrder;
    console.log(`🔄 Updated order #${order.order_number}`);
  } else {
    // Add new order
    storedOrders.push(storedOrder);
    console.log(`✅ Stored new order #${order.order_number} (${storedOrder.market_tag})`);
  }

  // Save to file
  saveOrdersToFile();

  return storedOrder;
}

/**
 * Get all stored orders
 * @param {object} filters - Optional filters
 * @returns {array} Stored orders
 */
function getStoredOrders(filters = {}) {
  let results = [...storedOrders];

  // Filter by date range
  if (filters.dateFrom || filters.dateTo) {
    results = results.filter(order => {
      const orderDate = new Date(order.order_date);
      const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : new Date(0);
      const dateTo = filters.dateTo ? new Date(filters.dateTo) : new Date();
      return orderDate >= dateFrom && orderDate <= dateTo;
    });
  }

  // Filter by market tag
  if (filters.market) {
    results = results.filter(order => order.market_tag === filters.market);
  }

  // Filter by country code
  if (filters.country) {
    results = results.filter(order => order.country_code === filters.country);
  }

  return results;
}

/**
 * Get order statistics
 * @returns {object} Stats about stored orders
 */
function getOrderStats() {
  const stats = {
    total_orders: storedOrders.length,
    orders_by_market: {},
    orders_by_country: {},
    date_range: storedOrders.length > 0 ? {
      earliest: storedOrders[0].order_date,
      latest: storedOrders[storedOrders.length - 1].order_date
    } : null
  };

  // Count by market
  storedOrders.forEach(order => {
    stats.orders_by_market[order.market_tag] = (stats.orders_by_market[order.market_tag] || 0) + 1;
    stats.orders_by_country[order.country_code] = (stats.orders_by_country[order.country_code] || 0) + 1;
  });

  return stats;
}

/**
 * Clear all stored orders (for testing)
 */
function clearStoredOrders() {
  storedOrders = [];
  saveOrdersToFile();
  console.log('🗑️ Cleared all stored orders');
}

/**
 * Validate Shopify webhook
 * @param {string} topic - Webhook topic (e.g., 'orders/create')
 * @param {object} order - Order data from Shopify
 * @returns {boolean} Valid webhook
 */
function validateWebhook(topic, order) {
  if (!topic || !order) return false;
  if (!order.id || !order.order_number) return false;
  return true;
}

// Load orders on startup
loadOrdersFromFile();

module.exports = {
  storeOrder,
  getStoredOrders,
  getOrderStats,
  clearStoredOrders,
  validateWebhook
};
