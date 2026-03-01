const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopify.service');
const shopifyProxyService = require('../services/shopify-proxy.service');

router.get('/', async (req, res) => {
  try {
    const { tag, date_from, date_to, use_mock } = req.query;
    if (!date_from || !date_to) return res.status(400).json({ error: 'Missing date_from, date_to' });
    
    const dateFrom = new Date(date_from).toISOString();
    const dateTo = new Date(date_to).toISOString();
    const filters = { dateFrom, dateTo };
    if (tag) filters.tag = tag;

    // Use proxy for real data (default), mock if requested
    let orders;
    if (use_mock === 'true') {
      orders = await shopifyService.getMockOrders(filters);
    } else {
      try {
        orders = await shopifyProxyService.getOrdersViaProxy(filters);
      } catch (proxyError) {
        console.warn('Proxy failed, falling back to mock:', proxyError.message);
        orders = await shopifyService.getMockOrders(filters);
      }
    }

    const filteredOrders = tag ? orders.filter(o => o.tags && o.tags.includes(tag)) : orders;
    res.json({ success: true, data: { tag: tag || 'all', total_orders: filteredOrders.length, summary: { total_orders: filteredOrders.length, total_products: filteredOrders.reduce((sum, o) => sum + o.product_count, 0) } } });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
