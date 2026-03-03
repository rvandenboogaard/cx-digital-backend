const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopify.service');
const shopifyRESTService = require('../services/shopify-rest.service');
const dixaService = require('../services/dixa.service');

// Get summary metrics
router.get('/summary', async (req, res) => {
  try {
    const { tag, date_from, date_to, use_mock } = req.query;

    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'Missing date_from and date_to' });
    }

    const dateFrom = new Date(date_from).toISOString();
    const dateTo = new Date(date_to).toISOString();
    const tags = tag ? tag.split(',').map(t => t.trim()) : [];
    const filters = { dateFrom, dateTo, tags };

    // Get orders - try REST first, fallback to mock
    let orders;
    if (use_mock === 'true') {
      orders = await shopifyService.getMockOrders(filters);
    } else {
      try {
        orders = await shopifyRESTService.getOrdersViaREST(filters);
        if (!orders || orders.length === 0) {
          orders = await shopifyService.getMockOrders(filters);
        }
      } catch (err) {
        console.warn('REST API failed, using mock orders');
        orders = await shopifyService.getMockOrders(filters);
      }
    }

    // Get conversations - try API first, fallback to mock
    let conversations;
    if (use_mock === 'true') {
      conversations = await dixaService.getMockConversations(filters);
    } else {
      try {
        conversations = await dixaService.getConversations(filters);
      } catch (err) {
        console.warn('Dixa API failed, using mock conversations');
        conversations = await dixaService.getMockConversations(filters);
      }
    }

    const totalOrders = orders.length;
    const totalConversations = conversations.length;
    const otcRatio = totalOrders > 0 ? ((totalConversations / totalOrders) * 100).toFixed(2) : 0;

    res.json({
      success: true,
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
        },
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get trend data (hourly)
router.get('/trend', async (req, res) => {
  try {
    const { tag, date_from, date_to, use_mock } = req.query;

    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'Missing date_from and date_to' });
    }

    const dateFrom = new Date(date_from).toISOString();
    const dateTo = new Date(date_to).toISOString();
    const tags = tag ? tag.split(',').map(t => t.trim()) : [];
    const filters = { dateFrom, dateTo, tags };

    const orders = use_mock === 'true'
      ? await shopifyService.getMockOrders(filters)
      : await shopifyService.getOrders(filters);

    const conversations = use_mock === 'true'
      ? await dixaService.getMockConversations(filters)
      : await dixaService.getConversations(filters);

    // Group by hour
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

    // Calculate OTC ratio per hour
    Object.keys(hourlyTrend).forEach(hour => {
      const data = hourlyTrend[hour];
      data.otc_ratio = data.orders > 0 ? ((data.conversations / data.orders) * 100).toFixed(2) : 0;
    });

    const trend = Object.keys(hourlyTrend)
      .sort()
      .map(hour => ({
        hour,
        ...hourlyTrend[hour],
      }));

    res.json({
      success: true,
      data: {
        period: { from: dateFrom, to: dateTo },
        tag: tag || 'all',
        trend: trend,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get backlog (conversations needing response)
router.get('/backlog', async (req, res) => {
  try {
    const { tag, use_mock } = req.query;
    const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateTo = new Date().toISOString();
    
    const tags = tag ? tag.split(',').map(t => t.trim()) : [];
    const filters = { dateFrom, dateTo, tags };

    const conversations = use_mock === 'true'
      ? await dixaService.getMockConversations(filters)
      : await dixaService.getConversations(filters);

    // Simulate backlog as conversations with many messages
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
      data: {
        total_backlog: backlog.length,
        high_priority: backlog.filter(b => b.priority === 'high').length,
        backlog: backlog,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get store/market breakdown
router.get('/stores', async (req, res) => {
  try {
    const { date_from, date_to, use_mock } = req.query;

    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'Missing date_from and date_to' });
    }

    const dateFrom = new Date(date_from).toISOString();
    const dateTo = new Date(date_to).toISOString();
    const filters = { dateFrom, dateTo, tags: [] };

    const orders = use_mock === 'true'
      ? await shopifyService.getMockOrders(filters)
      : await shopifyService.getOrders(filters);

    const conversations = use_mock === 'true'
      ? await dixaService.getMockConversations(filters)
      : await dixaService.getConversations(filters);

    // Group by market tags
    const markets = {};
    const allMarkets = ['SWB', 'SWA', 'SWS', 'BSW', 'CSW'];

    allMarkets.forEach(market => {
      const marketOrders = orders.filter(o => o.tags && o.tags.includes(market));
      const marketConversations = conversations.filter(c => c.tags && c.tags.includes(market));
      
      markets[market] = {
        orders: marketOrders.length,
        conversations: marketConversations.length,
        otc_ratio: marketOrders.length > 0 
          ? ((marketConversations.length / marketOrders.length) * 100).toFixed(2)
          : 0,
      };
    });

    res.json({
      success: true,
      data: {
        period: { from: dateFrom, to: dateTo },
        stores: markets,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get category breakdown (using tags as categories)
router.get('/categories', async (req, res) => {
  try {
    const { date_from, date_to, use_mock } = req.query;

    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'Missing date_from and date_to' });
    }

    const dateFrom = new Date(date_from).toISOString();
    const dateTo = new Date(date_to).toISOString();
    const filters = { dateFrom, dateTo, tags: [] };

    const conversations = use_mock === 'true'
      ? await dixaService.getMockConversations(filters)
      : await dixaService.getConversations(filters);

    // Group conversations by message count (as proxy for category)
    const categories = {
      'simple': conversations.filter(c => c.message_count <= 3).length,
      'standard': conversations.filter(c => c.message_count > 3 && c.message_count <= 7).length,
      'complex': conversations.filter(c => c.message_count > 7).length,
    };

    res.json({
      success: true,
      data: {
        period: { from: dateFrom, to: dateTo },
        categories: categories,
        total: conversations.length,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get C1 Category Performance (with FCR, AHT, AST, SLA metrics)
router.get('/c1-categories', async (req, res) => {
  try {
    const c1CategoryService = require('../services/c1-category.service');
    const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateTo = new Date().toISOString();
    
    const fromDateStr = dateFrom.split('T')[0];
    const toDateStr = dateTo.split('T')[0];

    console.log(`📊 C1 Categories: Fetching conversations from ${fromDateStr} to ${toDateStr}`);

    const backlogService = require('../services/dixa-backlog.service');
    const conversations = await backlogService.getConversationsFromExports(
      new Date(dateFrom),
      new Date(dateTo)
    );

    if (!conversations || conversations.length === 0) {
      console.log('ℹ️ No conversations found for C1 analysis');
      return res.json({
        success: true,
        data: {
          categories: [],
          summary: {
            total_tickets: 0,
            avg_fcr: 0,
            avg_aht_seconds: 0,
            avg_ast_seconds: 0,
          },
        },
      });
    }

    const result = c1CategoryService.calculateC1CategoryPerformance(conversations);
    
    res.json({
      success: true,
      data: result,
      period: { from: fromDateStr, to: toDateStr },
    });
  } catch (error) {
    console.error('Error in /c1-categories:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
