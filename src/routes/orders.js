const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopify.service');
const shopifyRESTService = require('../services/shopify-rest.service');

router.get('/', async (req, res) => {
  try {
    const { tag, date_from, date_to } = req.query;

    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'Missing date_from, date_to' });
    }

    const dateFrom = new Date(date_from).toISOString();
    const dateTo = new Date(date_to).toISOString();
    const filters = { dateFrom, dateTo };
    if (tag) filters.tag = tag;

    let orders;
    try {
      orders = await shopifyRESTService.getOrdersViaREST(filters);
    } catch (restError) {
      console.warn('REST API failed, trying fallback:', restError.message);
      orders = await shopifyService.getOrders(filters);
    }

    const filteredOrders = tag
      ? orders.filter(o => o.tags && o.tags.includes(tag))
      : orders;

    res.json({
      success: true,
      data_source: 'live',
      data: {
        tag: tag || 'all',
        total_orders: filteredOrders.length,
        orders: filteredOrders,
        summary: {
          total_orders: filteredOrders.length,
          total_products: filteredOrders.reduce((sum, o) => sum + (o.product_count || 0), 0),
        },
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message, data_source: 'error' });
  }
});

module.exports = router;
