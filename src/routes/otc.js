const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopify.service');
const dixaService = require('../services/dixa.service');
const cacheService = require('../services/cache.service');

/**
 * GET /api/otc
 * Calculate OTC ratio with CACHING (5 min TTL)
 */
router.get('/', async (req, res) => {
  try {
    const { date_from, date_to, use_mock } = req.query;

    // Default: last 30 days
    const dateTo = date_to ? new Date(date_to) : new Date();
    const dateFrom = date_from ? new Date(date_from) : new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000);

    const fromStr = dateFrom.toISOString().split('T')[0];
    const toStr = dateTo.toISOString().split('T')[0];

    // CACHE KEY
    const cacheKey = `otc_${fromStr}_${toStr}`;

    // CHECK CACHE FIRST
    const cachedResult = cacheService.get(cacheKey);
    if (cachedResult) {
      cachedResult.data.cache_status = 'HIT - served from 5 min cache';
      return res.json(cachedResult);
    }

    console.log(`🔄 OTC Cache MISS - fetching fresh data for ${fromStr} to ${toStr}`);

    // Fetch both orders and conversations
    const orders = await shopifyService.getOrders({ dateFrom: fromStr, dateTo: toStr });
    const conversations = await dixaService.getConversations({ dateFrom: fromStr, dateTo: toStr });

    // Calculate OTC Ratio: (Conversations / Orders) * 100
    const totalOrders = orders.length;
    const totalConversations = conversations.length;
    const otcRatio = totalOrders > 0 ? ((totalConversations / totalOrders) * 100).toFixed(2) : 0;

    const result = {
      success: true,
      data: {
        period: { from: fromStr, to: toStr },
        metrics: {
          total_orders: totalOrders,
          total_conversations: totalConversations,
          otc_ratio: parseFloat(otcRatio),
          otc_ratio_percentage: `${otcRatio}%`,
        },
        interpretation: {
          low_ratio: 'Few support tickets per order (good CX)',
          high_ratio: 'Many support tickets per order (quality issues)',
          current_status: otcRatio < 10 ? 'Excellent' : otcRatio < 30 ? 'Good' : otcRatio < 50 ? 'Fair' : 'Needs attention',
        },
        cache_status: 'FRESH - newly fetched, will cache for 5 minutes',
      },
    };

    // CACHE THE RESULT FOR 5 MINUTES
    cacheService.set(cacheKey, result);

    res.json(result);
  } catch (error) {
    console.error('❌ Error in /otc:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/otc/cache/stats
 * View cache statistics
 */
router.get('/cache/stats', (req, res) => {
  const stats = cacheService.stats();
  res.json({
    success: true,
    data: {
      cache_stats: stats,
      ttl_seconds: 300,
      message: 'Cache entries expire after 5 minutes',
    },
  });
});

/**
 * POST /api/otc/cache/clear
 * Clear cache manually (admin only)
 */
router.post('/cache/clear', (req, res) => {
  cacheService.clearAll();
  res.json({
    success: true,
    message: 'Cache cleared successfully',
  });
});

module.exports = router;
