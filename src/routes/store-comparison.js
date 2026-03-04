const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopify.service');
const dixaService = require('../services/dixa.service');
const tagMapperService = require('../services/tag-mapper.service');

/**
 * GET /api/store-comparison
 * Compare metrics across all Shopify sales channels
 */
router.get('/', async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    
    // Default: last 30 days
    const dateTo = date_to ? new Date(date_to) : new Date();
    const dateFrom = date_from ? new Date(date_from) : new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const fromStr = dateFrom.toISOString().split('T')[0];
    const toStr = dateTo.toISOString().split('T')[0];
    
    console.log(`📊 Store Comparison: ${fromStr} to ${toStr}`);
    
    // Get all orders and conversations
    const orders = await shopifyService.getOrders({ dateFrom: fromStr, dateTo: toStr });
    const conversations = await dixaService.getConversations({ dateFrom: fromStr, dateTo: toStr });
    
    // Define all stores
    const stores = [
      'smartwatchbanden.NL',
      'phone-factory.NL',
      'smartwatcharmbaender.DE',
      'huellen-shop.DE',
      'braceletsmartwatch.FR',
      'coque-telephone.FR',
      'correasmarwatch.ES',
      'smartwatch-straps.co.UK',
      'XoXoWildhearts.com'
    ];
    
    // Calculate metrics per store
    const storeMetrics = {};
    
    stores.forEach(store => {
      // Filter orders for this store
      const storeOrders = orders.filter(o => {
        // Orders have tags field with store name
        return o.tags && o.tags.some(t => t.toLowerCase().includes(store.toLowerCase()));
      });
      
      // Filter conversations for this store
      const storeConversations = conversations.filter(c => {
        return c.tags && c.tags.some(t => t.toLowerCase().includes(store.toLowerCase()));
      });
      
      // Calculate metrics
      const totalOrders = storeOrders.length;
      const totalTickets = storeConversations.length;
      const contactRate = totalOrders > 0 ? ((totalTickets / totalOrders) * 100).toFixed(1) : 0;
      
      // Calculate FCR per store
      const closedTickets = storeConversations.filter(c => c.status === 'closed').length;
      const fcr = totalTickets > 0 ? ((closedTickets / totalTickets) * 100).toFixed(1) : 0;
      
      // Calculate AHT per store
      const totalAhtSeconds = storeConversations.reduce((sum, c) => {
        return sum + (c.exports_handling_duration || 0);
      }, 0);
      const ahtSeconds = totalTickets > 0 ? Math.round(totalAhtSeconds / totalTickets) : 0;
      const ahtFormatted = formatSeconds(ahtSeconds);
      
      // Calculate SLA per store (assume all closed = met SLA for now)
      const slaMetCount = storeConversations.filter(c => c.status === 'closed').length;
      const slaPercentage = totalTickets > 0 ? ((slaMetCount / totalTickets) * 100).toFixed(1) : 0;
      
      storeMetrics[store] = {
        store: store,
        orders: totalOrders,
        tickets: totalTickets,
        contact_rate: parseFloat(contactRate),
        fcr: parseFloat(fcr),
        aht_seconds: ahtSeconds,
        aht_formatted: ahtFormatted,
        sla: parseFloat(slaPercentage),
      };
    });
    
    res.json({
      success: true,
      data: {
        period: { from: fromStr, to: toStr },
        stores: storeMetrics,
        summary: {
          total_stores: stores.length,
          total_orders: Object.values(storeMetrics).reduce((sum, s) => sum + s.orders, 0),
          total_tickets: Object.values(storeMetrics).reduce((sum, s) => sum + s.tickets, 0),
          avg_contact_rate: (Object.values(storeMetrics).reduce((sum, s) => sum + s.contact_rate, 0) / stores.length).toFixed(1),
          data_source: 'shopify_and_dixa_exports_api',
        },
      },
    });
  } catch (error) {
    console.error('❌ Error in /store-comparison:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

function formatSeconds(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

module.exports = router;
