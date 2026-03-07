const express = require('express');
const router = express.Router();

/**
 * Realistic OTC test endpoint
 * Returns balanced mock data for dashboard testing
 * Shows realistic OTC% (~47%) instead of 100%
 */
router.get('/realistic-otc', (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error in /realistic-otc:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Breakdown by store
 */
router.get('/realistic-otc/stores', (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error in /stores:', error);
    res.status(500).json({ error: 'Store breakdown failed' });
  }
});

/**
 * Breakdown by channel (MAIL vs CHAT vs BOL)
 */
router.get('/realistic-otc/channels', (req, res) => {
  try {
    const channelData = {
      MAIL: { orders: 100, conversations: 42, ratio: 42 },
      CHAT: { orders: 100, conversations: 38, ratio: 38 },
      BOL: { orders: 100, conversations: 35, ratio: 35 }
    };

    const byChannel = {};
    Object.entries(channelData).forEach(([channel, data]) => {
      byChannel[channel] = {
        channel,
        orders: data.orders,
        conversations: data.conversations,
        otc_ratio: data.ratio
      };
    });

    res.json({
      success: true,
      source: 'realistic-mock-data',
      data: {
        by_channel: byChannel,
        note: 'MAIL+CHAT combined in main OTC%, BOL tracked separately'
      }
    });
  } catch (error) {
    console.error('Error in /channels:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 7-day trending data
 */
router.get('/realistic-otc/trend/7days', (req, res) => {
  try {
    const days = [];
    const baseData = [
      { orders: 15, conversations: 7 },
      { orders: 16, conversations: 8 },
      { orders: 14, conversations: 6 },
      { orders: 17, conversations: 8 },
      { orders: 15, conversations: 7 },
      { orders: 18, conversations: 8 },
      { orders: 15, conversations: 7 }
    ];
    
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const data = baseData[6 - i];
      
      days.push({
        date: dateStr,
        orders: data.orders,
        conversations: data.conversations,
        otc_ratio: parseFloat(((data.conversations / data.orders) * 100).toFixed(1))
      });
    }

    res.json({
      success: true,
      source: 'realistic-mock-data',
      data: {
        trend: days,
        period: '7 days',
        average_otc: (days.reduce((sum, d) => sum + d.otc_ratio, 0) / days.length).toFixed(1)
      }
    });
  } catch (error) {
    console.error('Error in /trend/7days:', error);
    res.status(500).json({ error: 'Trend calculation failed' });
  }
});

/**
 * 30-day trending data
 */
router.get('/realistic-otc/trend/30days', (req, res) => {
  try {
    const days = [];
    const today = new Date();
    
    // Generate simple 30-day data
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      // Simple pattern: 14-22 orders per day
      const orders = 14 + (i % 9);
      const conversations = Math.floor(orders * 0.47);
      
      days.push({
        date: dateStr,
        orders,
        conversations,
        otc_ratio: parseFloat(((conversations / orders) * 100).toFixed(1))
      });
    }

    res.json({
      success: true,
      source: 'realistic-mock-data',
      data: {
        trend: days,
        period: '30 days',
        average_otc: (days.reduce((sum, d) => sum + d.otc_ratio, 0) / days.length).toFixed(1)
      }
    });
  } catch (error) {
    console.error('Error in /trend/30days:', error);
    res.status(500).json({ error: 'Trend calculation failed' });
  }
});

/**
 * Contact reasons (C1-C2 simulation)
 */
router.get('/realistic-otc/contact-reasons', (req, res) => {
  try {
    res.json({
      success: true,
      source: 'realistic-mock-data',
      data: {
        top_reasons: [
          { c1: 'Delivery', c2: 'Where is my order?', count: 18, percentage: 38 },
          { c1: 'Returns', c2: 'How to return?', count: 12, percentage: 26 },
          { c1: 'Product', c2: 'Size/fit questions', count: 9, percentage: 19 },
          { c1: 'Payment', c2: 'Payment failed', count: 5, percentage: 11 },
          { c1: 'Account', c2: 'Login issues', count: 3, percentage: 6 }
        ],
        note: 'Simulated C1-C2 data for future queue mapping'
      }
    });
  } catch (error) {
    console.error('Error in /contact-reasons:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
