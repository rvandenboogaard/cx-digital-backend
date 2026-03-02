const express = require('express');
const router = express.Router();

/**
 * Realistic OTC test endpoint
 * Returns balanced mock data for dashboard testing
 * Shows realistic OTC% (~47%) instead of 100%
 */
router.get('/realistic-otc', async (req, res) => {
  const { date_from, date_to } = req.query;

  // Market distribution with realistic OTC% ratios
  const marketData = {
    SWB: { orders: 25, conversations: 11, stores: ['smartwatchbanden.NL', 'phone-factory.NL'] },
    SWA: { orders: 20, conversations: 10, stores: ['smartwatcharmbaender.DE', 'huellen-shop.DE'] },
    BSW: { orders: 15, conversations: 9, stores: ['braceletsmartwatch.FR', 'coque-telephone.FR'] },
    CSW: { orders: 12, conversations: 5, stores: ['correasmartwatch.ES'] },
    SWS: { orders: 18, conversations: 8, stores: ['smartwatch-straps.co.UK'] },
    XoXo: { orders: 10, conversations: 2, stores: ['XoXoWildhearts.com'] }
  };

  // Calculate totals
  const totalOrders = Object.values(marketData).reduce((sum, m) => sum + m.orders, 0);
  const totalConversations = Object.values(marketData).reduce((sum, m) => sum + m.conversations, 0);
  const overallOTC = ((totalConversations / totalOrders) * 100).toFixed(1);

  // Build market breakdown
  const byMarket = {};
  Object.entries(marketData).forEach(([market, data]) => {
    const ratio = ((data.conversations / data.orders) * 100).toFixed(1);
    byMarket[market] = {
      market,
      orders: data.orders,
      conversations: data.conversations,
      otc_ratio: parseFloat(ratio),
      stores: data.stores
    };
  });

  res.json({
    success: true,
    source: 'realistic-mock-data',
    note: 'This is balanced mock data for testing. Real data will come from Shopify webhooks.',
    data: {
      period: {
        from: date_from || '2024-02-01T00:00:00Z',
        to: date_to || '2024-02-28T23:59:59Z'
      },
      tag: 'all',
      metrics: {
        total_orders: totalOrders,
        total_conversations: totalConversations,
        otc_ratio: parseFloat(overallOTC),
        avg_messages_per_conversation: '5.7'
      },
      by_market: byMarket
    }
  });
});

/**
 * Breakdown by store
 */
router.get('/realistic-otc/stores', async (req, res) => {
  const storeData = {
    'smartwatchbanden.NL': { orders: 15, conversations: 7, market: 'SWB' },
    'phone-factory.NL': { orders: 10, conversations: 4, market: 'SWB' },
    'smartwatcharmbaender.DE': { orders: 12, conversations: 6, market: 'SWA' },
    'huellen-shop.DE': { orders: 8, conversations: 4, market: 'SWA' },
    'braceletsmartwatch.FR': { orders: 9, conversations: 5, market: 'BSW' },
    'coque-telephone.FR': { orders: 6, conversations: 4, market: 'BSW' },
    'correasmartwatch.ES': { orders: 12, conversations: 5, market: 'CSW' },
    'smartwatch-straps.co.UK': { orders: 18, conversations: 8, market: 'SWS' },
    'XoXoWildhearts.com': { orders: 10, conversations: 2, market: 'XoXo' }
  };

  const byStore = {};
  Object.entries(storeData).forEach(([store, data]) => {
    const ratio = ((data.conversations / data.orders) * 100).toFixed(1);
    byStore[store] = {
      store,
      market: data.market,
      orders: data.orders,
      conversations: data.conversations,
      otc_ratio: parseFloat(ratio)
    };
  });

  res.json({
    success: true,
    source: 'realistic-mock-data',
    data: {
      by_store: byStore
    }
  });
});

module.exports = router;
