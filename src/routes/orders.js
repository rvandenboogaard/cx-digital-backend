const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopify.service');
router.get('/', async (req, res) => {
  try {
    const { tag, date_from, date_to, use_mock } = req.query;
    if (!date_from || !date_to) return res.status(400).json({ error: 'Missing date_from, date_to' });
    const dateFrom = new Date(date_from).toISOString();
    const dateTo = new Date(date_to).toISOString();
    const filters = { dateFrom, dateTo };
    if (tag) filters.tag = tag;
    const orders = use_mock === 'true' ? await shopifyService.getMockOrders(filters) : await shopifyService.getOrders(filters);
    const filteredOrders = tag ? orders.filter(o => o.tags && o.tags.includes(tag)) : orders;
    res.json({ success: true, data: { tag: tag || 'all', total_orders: filteredOrders.length, summary: { total_orders: filteredOrders.length, total_products: filteredOrders.reduce((sum, o) => sum + o.product_count, 0) } } });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
module.exports = router;
