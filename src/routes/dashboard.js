const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopify.service');
const shopifyRESTService = require('../services/shopify-rest.service');
const dixaService = require('../services/dixa.service');

const MARKET_MAP = {
  'smartwatchbanden.nl':     { tag: 'SWB', country: 'NL', dixaTags: ['email-strap-nl', 'chat-strap-nl', 'xx-nl-be'] },
  'phone-factory.nl':        { tag: 'SWB', country: 'NL', dixaTags: ['email-strap-nl', 'chat-strap-nl', 'xx-nl-be'] },
  'xoxowildhearts.com':      { tag: 'SWB', country: 'NL', dixaTags: ['email-xo-xo'] },
  'smartwatcharmbaender.de': { tag: 'SWA', country: 'DE', dixaTags: ['email-strap-de', 'chat-strap-de'] },
  'huellen-shop.de':         { tag: 'SWA', country: 'DE', dixaTags: ['email-strap-de', 'chat-strap-de'] },
  'braceletsmartwatch.fr':   { tag: 'BSW', country: 'FR', dixaTags: ['email-strap-fr', 'chat-strap-fr'] },
  'coque-telephone.fr':      { tag: 'BSW', country: 'FR', dixaTags: ['email-strap-fr', 'chat-strap-fr'] },
  'correasmartwatch.es':     { tag: 'CSW', country: 'ES', dixaTags: ['email-strap-es'] },
  'smartwatch-straps.co.uk': { tag: 'SWS', country: 'GB', dixaTags: ['email-strap-uk', 'chat-strap-uk'] },
};

router.get('/summary', async (req, res) => {
  try {
    const { tag, date_from, date_to } = req.query;
    if (!date_from || !date_to) return res.status(400).json({ error: 'Missing date_from and date_to' });
    const dateFrom = new Date(date_from).toISOString();
    const dateTo = new Date(date_to).toISOString();
    const tags = tag ? tag.split(',').map(t => t.trim()) : [];
    const filters = { dateFrom, dateTo, tags };

    let orders;
    try { orders = await shopifyRESTService.getOrdersViaREST(filters); }
    catch (err) { console.warn('Shopify REST failed:', err.message); orders = await shopifyService.getOrders(filters); }

    const conversations = await dixaService.getConversations(filters);
    const dixaAnalyticsService = require('../services/dixa-analytics.service');
    const fcrFromDixa = await dixaAnalyticsService.getFCR('PreviousWeek');
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
            ? (conversations.reduce((sum, c) => sum + c.message_count, 0) / totalConversations).toFixed(1) : 0,
          avg_fcr: fcrFromDixa !== null ? fcrFromDixa : (c1Result.summary.avg_fcr || 0),
          avg_aht_seconds: c1Result.summary.avg_aht_seconds || 0,
          avg_aht_formatted: c1Result.summary.avg_aht_formatted || '0:00',
          avg_ast_seconds: c1Result.summary.avg_ast_seconds || 0,
          avg_ast_formatted: c1Result.summary.avg_ast_formatted || '0.0h',
          avg_sla: c1Result.summary.avg_sla || 0,
        },
      },
    });
  } catch (error) { res.status(500).json({ error: error.message, data_source: 'error' }); }
});

router.get('/trend', async (req, res) => {
  try {
    const { tag, date_from, date_to } = req.query;
    if (!date_from || !date_to) return res.status(400).json({ error: 'Missing date_from and date_to' });
    const dateFrom = new Date(date_from).toISOString();
    const dateTo = new Date(date_to).toISOString();
    const tags = tag ? tag.split(',').map(t => t.trim()) : [];
    const filters = { dateFrom, dateTo, tags };

    let orders;
    try { orders = await shopifyRESTService.getOrdersViaREST(filters); }
    catch (err) { console.warn('Shopify REST failed in trend:', err.message); orders = []; }

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
      const d = hourlyTrend[hour];
      d.otc_ratio = d.orders > 0 ? ((d.conversations / d.orders) * 100).toFixed(2) : 0;
    });

    const trend = Object.keys(hourlyTrend).sort().map(hour => ({ hour, ...hourlyTrend[hour] }));
    res.json({ success: true, data_source: 'live', data: { period: { from: dateFrom, to: dateTo }, tag: tag || 'all', trend } });
  } catch (error) { res.status(500).json({ error: error.message, data_source: 'error' }); }
});

router.get('/backlog', async (req, res) => {
  try {
    const { tag } = req.query;
    const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateTo = new Date().toISOString();
    const tags = tag ? tag.split(',').map(t => t.trim()) : [];
    const conversations = await dixaService.getConversations({ dateFrom, dateTo, tags });
    const backlog = conversations
      .filter(c => c.message_count > 5)
      .sort((a, b) => b.message_count - a.message_count)
      .slice(0, 10)
      .map(c => ({ id: c.dixa_conversation_id, customer: c.customer_email, messages: c.message_count, priority: c.message_count > 8 ? 'high' : 'medium' }));
    res.json({ success: true, data_source: 'live', data: { total_backlog: backlog.length, high_priority: backlog.filter(b => b.priority === 'high').length, backlog } });
  } catch (error) { res.status(500).json({ error: error.message, data_source: 'error' }); }
});

router.get('/stores', async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    if (!date_from || !date_to) return res.status(400).json({ error: 'Missing date_from and date_to' });
    const dateFrom = new Date(date_from).toISOString();
    const dateTo = new Da
