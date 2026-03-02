const express = require('express');
const router = express.Router();
const dixaService = require('../services/dixa.service');
const tagMapper = require('../services/tag-mapper.service');

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

    // Use mock data if requested or if no API token is set
    const conversations = use_mock === 'true' 
      ? await dixaService.getMockConversations(filters)
      : await dixaService.getConversations(filters);

    // Calculate OTC Ratio if tag is specified
    let otcRatio = null;
    if (tag && conversations.length > 0) {
      otcRatio = {
        total_conversations: conversations.length,
        market_tag: tag,
        note: 'OTC Ratio requires order data - see /api/otc endpoint',
      };
    }

    // Enrich conversations with C1-C2 categorization
    const enrichedConversations = conversations.map(conv => ({
      ...conv,
      c1c2: tagMapper.mapTagsToC1C2(conv.tags)
    }));

    // Calculate C1-C2 statistics
    const c1c2Stats = tagMapper.getC1C2Stats(enrichedConversations);

    res.json({
      success: true,
      data: {
        tag: tag || 'all',
        total_conversations: conversations.length,
        conversations: enrichedConversations,
        c1c2_statistics: c1c2Stats,
        otc_ratio: otcRatio,
        summary: {
          total_orders: conversations.length,
          date_range: { from: dateFrom, to: dateTo },
          top_c1_categories: Object.entries(c1c2Stats.by_c1)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 3)
            .reduce((acc, [c1, data]) => ({ ...acc, [c1]: data }), {}),
        },
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
