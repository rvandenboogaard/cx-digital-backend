const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopify.service');
const dixaService = require('../services/dixa.service');

router.get('/', async (req, res) => {
  try {
    const { tag, date_from, date_to, use_mock } = req.query;

    // Validate date params
    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'Missing date_from and date_to parameters' });
    }

    const dateFrom = new Date(date_from).toISOString();
    const dateTo = new Date(date_to).toISOString();

    // Parse tags - can be single tag or comma-separated
    const tags = tag ? tag.split(',').map(t => t.trim()) : [];

    const filters = { dateFrom, dateTo, tags };

    // Fetch both orders and conversations
    const orders = use_mock === 'true'
      ? await shopifyService.getMockOrders(filters)
      : await shopifyService.getOrders(filters);

    const conversations = use_mock === 'true'
      ? await dixaService.getMockConversations(filters)
      : await dixaService.getConversations(filters);

    // Calculate OTC Ratio: (Conversations / Orders) * 100
    const totalOrders = orders.length;
    const totalConversations = conversations.length;
    const otcRatio = totalOrders > 0 ? ((totalConversations / totalOrders) * 100).toFixed(2) : 0;

    // Calculate per-tag breakdown if tags specified
    const perTagMetrics = {};
    if (tags.length > 0) {
      tags.forEach(t => {
        const tagOrders = orders.filter(o => 
          o.tags && o.tags.includes(t)
        ).length || orders.length;
        
        const tagConversations = conversations.filter(c => 
          c.tags && c.tags.includes(t)
        ).length || conversations.length;
        
        const tagRatio = tagOrders > 0 ? ((tagConversations / tagOrders) * 100).toFixed(2) : 0;
        
        perTagMetrics[t] = {
          orders: tagOrders,
          conversations: tagConversations,
          otc_ratio: parseFloat(tagRatio),
        };
      });
    }

    res.json({
      success: true,
      data: {
        period: { from: dateFrom, to: dateTo },
        tags: tags.length > 0 ? tags : ['all'],
        metrics: {
          total_orders: totalOrders,
          total_conversations: totalConversations,
          otc_ratio: parseFloat(otcRatio),
          otc_ratio_raw: `${totalConversations} / ${totalOrders} * 100`,
        },
        per_tag_metrics: Object.keys(perTagMetrics).length > 0 ? perTagMetrics : null,
        interpretation: {
          low_ratio: 'Few support tickets per order (good customer experience)',
          high_ratio: 'Many support tickets per order (potential issues)',
          threshold_warning: 'Above 5% OTC ratio may indicate customer service issues',
        },
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
