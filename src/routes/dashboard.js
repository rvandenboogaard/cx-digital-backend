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

    const dateFrom = new Date(date_from).toISOString();
    const dateTo = new Date(date_to).toISOString();
    const tags = tag ? tag.split(',').map(t => t.trim()) : [];
    const filters = { dateFrom, dateTo, tags };

    const orders = await shopifyService.getOrders(filters);
    const conversations = await dixaService.getConversations(filters);

    const hourlyTrend = {};

    orders.forEach(o => {
      const hour = o.order_hour;
      if (!hourlyTrend[hour]) hourlyTrend[hour] = { orders: 0, conversations: 0, otc_ratio: 0 };
      hourlyTrend[hour].orders += 1;
    });

    conversations.forEach(c => {
      const hour = c.conversation_hour;
      if (!hourlyTrend[hour]) hourlyTrend[hour] = { orders: 0, conversations: 0, otc_ratio: 0 };
      hourlyTrend[hour].conversations += 1;
    });

    Object.keys(hourlyTrend).forEach(hour => {
      const data = hourlyTrend[hour];
      data.otc_ratio = data.orders > 0 ? ((data.conversations / data.orders) * 100).toFixed(2) : 0;
    });

    const trend = Object.keys(hourlyTrend).sort().map(hour => ({ hour, ...hourlyTrend[hour] }));

    res.json({
      success: true,
      data_source: 'live',
      data: {
        period: { from: dateFrom, to: dateTo },
        tag: tag || 'all',
        trend,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message, data_source: 'error' });
  }
});

// Get backlog
router.get('/backlog', async (req, res) => {
  try {
    const { tag } = req.query;
    const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateTo = new Date().toISOString();
    const tags = tag ? tag.split(',').map(t => t.trim()) : [];
    const filters = { dateFrom, dateTo, tags };

    const conversations = await dixaService.getConversations(filters);

    const backlog = conversations
      .filter(c => c.message_count > 5)
      .sort((a, b) => b.message_count - a.message_count)
      .slice(0, 10)
      .map(c => ({
        id: c.dixa_conversation_id,
        customer: c.customer_email,
        messages: c.message_count,
        priority: c.message_count > 8 ? 'high' : 'medium',
      }));

    res.json({
      success: true,
      data_source: 'live',
      data: {
        total_backlog: backlog.length,
        high_priority: backlog.filter(b => b.priority === 'high').length,
        backlog,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message, data_source: 'error' });
  }
});

// Get store/market breakdown
router.get('/stores', async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'Missing date_from and date_to' });
    }

    const dateFrom = new Date(date_from).toISOString();
    const dateTo = new Date(date_to).toISOString();
    const filters = { dateFrom, dateTo, tags: [] };

    const orders = await shopifyService.getOrders(filters);
    const conversations = await dixaService.getConversations(filters);

    const allMarkets = [
      'smartwatchbanden.nl', 'smartwatcharmbaender.de', 'braceletsmartwatch.fr',
      'coque-telephone.fr', 'huellen-shop.de', 'correasmartwatch.es',
      'smartwatch-straps.co.uk', 'phone-factory.nl', 'xoxowildhearts.com'
    ];

    const markets = {};
    allMarkets.forEach(market => {
      const marketOrders = orders.filter(o => o.tags && o.tags.some(t => t.toLowerCase().includes(market)));
      const marketConversations = conversations.filter(c => c.tags && c.tags.some(t => t.toLowerCase().includes(market)));
      markets[market] = {
        orders: marketOrders.length,
        conversations: marketConversations.length,
        otc_ratio: marketOrders.length > 0 ? ((marketConversations.length / marketOrders.length) * 100).toFixed(2) : 0,
      };
    });

    res.json({
      success: true,
      data_source: 'live',
      data: { period: { from: dateFrom, to: dateTo }, stores: markets },
    });
  } catch (error) {
    res.status(500).json({ error: error.message, data_source: 'error' });
  }
});

// Get C1 Category Performance
router.get('/c1-categories', async (req, res) => {
  try {
    const c1CategoryService = require('../services/c1-category.service');
    const backlogService = require('../services/dixa-backlog.service');

    const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateTo = new Date().toISOString();
    const fromDateStr = dateFrom.split('T')[0];
    const toDateStr = dateTo.split('T')[0];

    const conversations = await backlogService.getConversationsFromExports(
      new Date(dateFrom),
      new Date(dateTo)
    );

    if (!conversations || conversations.length === 0) {
      return res.json({
        success: true,
        data: { categories: [], summary: { total_tickets: 0, avg_fcr: 0, avg_aht_seconds: 0, avg_ast_seconds: 0 } },
      });
    }

    const result = c1CategoryService.calculateC1CategoryPerformance(conversations);
    res.json({ success: true, data_source: 'live', data: result, period: { from: fromDateStr, to: toDateStr } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, data_source: 'error' });
  }
});

// Get SLA Performance
router.get('/sla-performance', async (req, res) => {
  try {
    const slaService = require('../services/sla-performance.service');
    const backlogService = require('../services/dixa-backlog.service');

    const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateTo = new Date().toISOString();
    const fromDateStr = dateFrom.split('T')[0];
    const toDateStr = dateTo.split('T')[0];

    const conversations = await backlogService.getConversationsFromExports(
      new Date(dateFrom),
      new Date(dateTo)
    );

    if (!conversations || conversations.length === 0) {
      return res.json({
        success: true,
        data: { policies: [], summary: { total_conversations: 0, avg_sla_compliance: 0 } },
      });
    }

    const result = slaService.calculateSLAPerformance(conversations);
    res.json({ success: true, data_source: 'live', data: result, period: { from: fromDateStr, to: toDateStr } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, data_source: 'error' });
  }
});

module.exports = router;
