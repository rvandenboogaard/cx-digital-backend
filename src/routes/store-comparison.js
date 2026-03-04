const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopify.service');
const dixaService = require('../services/dixa.service');
const cacheService = require('../services/cache.service');

// Store definitions with display names and tag matchers
const STORE_DEFINITIONS = [
  { id: 'smartwatchbanden.nl', name: 'smartwatchbanden.nl', tags: ['smartwatchbanden.nl', 'swb-nl', 'swb_nl'] },
  { id: 'smartwatcharmbaender.de', name: 'smartwatcharmbaender.de', tags: ['smartwatcharmbaender.de', 'swb-de', 'swb_de', 'swa'] },
  { id: 'braceletsmartwatch.fr', name: 'braceletsmartwatch.fr', tags: ['braceletsmartwatch.fr', 'swb-fr', 'swb_fr', 'bsw'] },
  { id: 'coque-telephone.fr', name: 'coque-telephone.fr', tags: ['coque-telephone.fr', 'ct-fr', 'ct_fr'] },
  { id: 'huellen-shop.de', name: 'huellen-shop.de', tags: ['huellen-shop.de', 'hs-de', 'hs_de'] },
  { id: 'correasmartwatch.es', name: 'correasmartwatch.es', tags: ['correasmartwatch.es', 'csw-es', 'csw_es', 'csw'] },
  { id: 'smartwatch-straps.co.uk', name: 'smartwatch-straps.co.uk', tags: ['smartwatch-straps.co.uk', 'sws-uk', 'sws_uk', 'sws'] },
  { id: 'phone-factory.nl', name: 'phone-factory.nl', tags: ['phone-factory.nl', 'pf-nl', 'pf_nl'] },
  { id: 'xoxowildhearts.com', name: 'XoXoWildhearts.com', tags: ['xoxowildhearts.com', 'xoxo', 'xoxo-wildhearts'] },
];

// SLA target: first response within 8 business hours
const SLA_TARGET_SECONDS = 8 * 60 * 60;

router.get('/', async (req, res) => {
  try {
    const { date_from, date_to } = req.query;

    const dateTo = date_to ? new Date(date_to) : new Date();
    const dateFrom = date_from ? new Date(date_from) : new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000);

    const fromStr = dateFrom.toISOString().split('T')[0];
    const toStr = dateTo.toISOString().split('T')[0];

    const cacheKey = `store_comparison_v2_${fromStr}_${toStr}`;

    const cachedResult = cacheService.get(cacheKey);
    if (cachedResult) {
      cachedResult.data.cache_status = 'HIT - served from 15 min cache';
      return res.json(cachedResult);
    }

    console.log(`Store Comparison Cache MISS - fetching live data for ${fromStr} to ${toStr}`);

    const orders = await shopifyService.getOrders({ dateFrom: fromStr, dateTo: toStr });
    const conversations = await dixaService.getConversations({ dateFrom: fromStr, dateTo: toStr });

    const storeMetrics = {};

    STORE_DEFINITIONS.forEach(store => {
      // Match orders to store via tags
      const storeOrders = orders.filter(o =>
        o.tags && store.tags.some(tag =>
          o.tags.some(t => t.toLowerCase() === tag.toLowerCase())
        )
      );

      // Match conversations to store via tags
      const storeConversations = conversations.filter(c =>
        c.tags && store.tags.some(tag =>
          c.tags.some(t => t.toLowerCase() === tag.toLowerCase())
        )
      );

      const totalOrders = storeOrders.length;
      const totalTickets = storeConversations.length;

      // Contact Rate
      const contactRate = totalOrders > 0
        ? parseFloat(((totalTickets / totalOrders) * 100).toFixed(1))
        : 0;

      // FCR: closed without reopening within 48h
      const closedOnce = storeConversations.filter(c =>
        c.status === 'closed' && !c.reopened
      ).length;
      const fcr = totalTickets > 0
        ? parseFloat(((closedOnce / totalTickets) * 100).toFixed(1))
        : 0;

      // AHT: average handling duration in seconds
      const totalAhtSeconds = storeConversations.reduce((sum, c) =>
        sum + (c.exports_handling_duration || 0), 0
      );
      const ahtSeconds = totalTickets > 0
        ? Math.round(totalAhtSeconds / totalTickets)
        : 0;

      // SLA: first response within SLA target
      const slaMetCount = storeConversations.filter(c =>
        c.exports_first_response_time != null &&
        c.exports_first_response_time <= SLA_TARGET_SECONDS
      ).length;
      const slaPercentage = totalTickets > 0
        ? parseFloat(((slaMetCount / totalTickets) * 100).toFixed(1))
        : 0;

      storeMetrics[store.id] = {
        store_id: store.id,
        store_name: store.name,
        orders: totalOrders,
        tickets: totalTickets,
        contact_rate: contactRate,
        fcr: fcr,
        aht_seconds: ahtSeconds,
        aht_formatted: formatSeconds(ahtSeconds),
        sla: slaPercentage,
        data_source: 'live',
      };
    });

    // Sort stores by order volume descending
    const sortedStores = Object.values(storeMetrics)
      .sort((a, b) => b.orders - a.orders)
      .reduce((acc, s) => { acc[s.store_id] = s; return acc; }, {});

    const allMetrics = Object.values(sortedStores);
    const totalOrders = allMetrics.reduce((sum, s) => sum + s.orders, 0);
    const totalTickets = allMetrics.reduce((sum, s) => sum + s.tickets, 0);

    const result = {
      success: true,
      data_source: 'live',
      fetched_at: new Date().toISOString(),
      data: {
        period: { from: fromStr, to: toStr },
        stores: sortedStores,
        summary: {
          total_stores: STORE_DEFINITIONS.length,
          total_orders: totalOrders,
          total_tickets: totalTickets,
          avg_contact_rate: totalOrders > 0
            ? parseFloat(((totalTickets / totalOrders) * 100).toFixed(1))
            : 0,
          avg_fcr: allMetrics.length > 0
            ? parseFloat((allMetrics.reduce((sum, s) => sum + s.fcr, 0) / allMetrics.length).toFixed(1))
            : 0,
          avg_aht_seconds: allMetrics.length > 0
            ? Math.round(allMetrics.reduce((sum, s) => sum + s.aht_seconds, 0) / allMetrics.length)
            : 0,
          avg_sla: allMetrics.length > 0
            ? parseFloat((allMetrics.reduce((sum, s) => sum + s.sla, 0) / allMetrics.length).toFixed(1))
            : 0,
          data_source: 'live - shopify + dixa exports api',
          cache_status: 'FRESH - will cache for 15 minutes',
        },
      },
    };

    // Cache for 15 minutes
    cacheService.set(cacheKey, result, 900);
    res.json(result);

  } catch (error) {
    console.error('Error in /store-comparison:', error);
    res.status(500).json({
      success: false,
      data_source: 'error',
      error: error.message,
    });
  }
});

function formatSeconds(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

module.exports = router;
