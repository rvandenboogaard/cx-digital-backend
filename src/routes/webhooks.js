const express = require('express');
const router = express.Router();
const orderStorage = require('../services/order-storage.service');

/**
 * Shopify Webhook Handler
 * Receives order events and stores them for OTC calculation
 */

/**
 * POST /api/webhooks/shopify/orders
 * Receives order.created and order.updated events from Shopify
 */
router.post('/shopify/orders', async (req, res) => {
  try {
    const { id, order_number, created_at, shipping_address, billing_address, total_price, customer, line_items } = req.body;

    // Validate webhook
    if (!orderStorage.validateWebhook('orders/create', req.body)) {
      console.warn('⚠️ Invalid webhook data');
      return res.status(400).json({ error: 'Invalid webhook data' });
    }

    // Store order
    const storedOrder = orderStorage.storeOrder({
      id,
      order_number,
      created_at,
      shipping_address,
      billing_address,
      total_price,
      customer,
      line_items
    });

    // Log webhook receipt
    console.log(`📦 Webhook: Order #${order_number} received (${storedOrder.market_tag})`);

    // Return 200 OK to Shopify
    res.status(200).json({
      success: true,
      message: `Order #${order_number} stored`,
      order_id: id,
      market_tag: storedOrder.market_tag,
      country_code: storedOrder.country_code
    });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/webhooks/shopify/test
 * Returns webhook configuration info (for testing setup)
 */
router.get('/shopify/test', (req, res) => {
  res.json({
    success: true,
    message: 'Shopify webhook endpoint is ready',
    endpoint: 'POST https://cx-digital-backend-858n.vercel.app/api/webhooks/shopify/orders',
    shopify_setup: {
      topic: 'orders/create',
      url: 'https://cx-digital-backend-858n.vercel.app/api/webhooks/shopify/orders',
      format: 'json'
    },
    test_order_count: orderStorage.getOrderStats().total_orders
  });
});

/**
 * GET /api/webhooks/shopify/stats
 * Returns stats about received orders
 */
router.get('/shopify/stats', (req, res) => {
  const stats = orderStorage.getOrderStats();
  res.json({
    success: true,
    data: stats
  });
});

/**
 * GET /api/webhooks/shopify/orders
 * Returns all stored orders (for testing)
 */
router.get('/shopify/orders', (req, res) => {
  const { market, country, date_from, date_to } = req.query;
  
  const filters = {};
  if (market) filters.market = market;
  if (country) filters.country = country;
  if (date_from) filters.dateFrom = date_from;
  if (date_to) filters.dateTo = date_to;

  const orders = orderStorage.getStoredOrders(filters);
  
  res.json({
    success: true,
    count: orders.length,
    data: orders
  });
});

/**
 * DELETE /api/webhooks/shopify/clear (testing only)
 * Clears all stored orders
 */
router.delete('/shopify/clear', (req, res) => {
  orderStorage.clearStoredOrders();
  res.json({
    success: true,
    message: 'All orders cleared'
  });
});

module.exports = router;
