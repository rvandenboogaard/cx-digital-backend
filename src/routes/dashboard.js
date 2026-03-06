const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopify.service');
const shopifyRESTService = require('../services/shopify-rest.service');
const dixaService = require('../services/dixa.service');

// Get summary metrics
router.get('/summary', async (req, res) => {
  try {
    const { tag, date_from, date_to } = req.query;
    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'Missing date_from and date_to' });
    }

    const dateFrom = new Date(date_from).toISOString();
    const dateTo = new Date(date_to).toISOString();
    const tags = tag ? tag.split(',').map(t => t.trim()) : [];
    const filters = { dateFrom, dateTo, tags };

    // Get orders
    let orders;
    try {
      orders = await shopifyRESTService.getOrdersViaREST(filters);
    } catch (err) {
      console.warn('Shopify REST API failed:', err.message);
      orders = await shopifyService.getOrders(filters);
    }

    // Get conversations
    const conversations = await dixaService.getConversations(filters);

    // Calculate C1 metrics (FCR, AHT, SLA)
    const c1CategoryService = require('../services/c1-category.service');
    const c1Result = c1CategoryService.calculateC1CategoryPerformance(conversations);

    const totalOrders = orders.length;
    const totalConversations = conversations.length;
    const otcRatio = totalOrders > 0 ? ((totalConversations / totalOrders) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data_source: 'live',
      data: {
        period: { from: dateFrom, to: dateTo },
        tag: tag || 'all',
        metrics: {
          total_orders: totalOrders,
          total_conversations: totalConversations,
          otc_ratio: parseFloat(otcRatio),
          avg_messages_per_conversation: totalConversations > 0
            ? (conversations.reduce((sum, c) => sum + c.message_count, 0) / totalConversations).toFixed(1)
            : 0,
          avg_fcr: c1Result.summary.avg_fcr || 0,
          avg_aht_seconds: c1Result.summary.avg_aht_seconds || 0,
          avg_aht_formatted: c1Result.summary.avg_aht_formatted || '0:00',
          avg_ast_seconds: c1Result.summary.avg_ast_seconds || 0,
          avg_ast_formatted: c1Result.summary.avg_ast_formatted || '0.0h',
          avg_sla: c1Result.summary.avg_sla || 0,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message, data_source: 'error' });
  }
});

// Get trend data (hourly)
router.get('/trend', async (req, res) => {
  try {
    const { tag, date_from, date_to } = req.query;
    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'Missing date_from and date_to' });
    }

    const dateFrom =
