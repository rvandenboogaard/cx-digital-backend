const express = require('express');
const { getOrders, getMockOrders } = require('../services/shopify.service');
const { loadStoreCredentials } = require('../config/shopify.config');

const router = express.Router();

/**
 * GET /orders
 * 
 * Query params:
 *   - dateFrom: ISO date (required)
 *   - dateTo: ISO date (required)
 *   - useMock: true/false (optional, default: false)
 * 
 * Header:
 *   - X-Store-ID: Store identifier (NL, DE, FR, etc.)
 * 
 * Example:
 *   GET /orders?dateFrom=2024-01-01T00:00:00Z&dateTo=2024-01-31T23:59:59Z
 *   Header: X-Store-ID: NL
 */
router.get('/', async (req, res) => {
  try {
    // Get store_id from header
    const storeId = req.headers['x-store-id'];
    if (!storeId) {
      return res.status(400).json({
        error: 'Missing X-Store-ID header',
        message: 'Request must include X-Store-ID header (e.g., NL, DE, FR)',
      });
    }

    // Get filters from query params
    const { dateFrom, dateTo, useMock } = req.query;
    if (!dateFrom || !dateTo) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'dateFrom and dateTo query params are required (ISO format)',
      });
    }

    // Load credentials for store
    const credentials = loadStoreCredentials(storeId);

    // Fetch orders
    const filters = { dateFrom, dateTo };
    const orders = useMock === 'true' 
      ? await getMockOrders(credentials, filters)
      : await getOrders(credentials, filters);

    // Return
    res.json({
      storeId,
      dateFrom,
      dateTo,
      count: orders.length,
      orders,
    });

  } catch (error) {
    console.error('❌ Orders endpoint error:', error.message);
    
    // Check if it's a credentials error (400) or API error (500)
    const statusCode = error.message.includes('Missing') || error.message.includes('not configured') 
      ? 400 
      : 500;
    
    res.status(statusCode).json({
      error: 'Failed to fetch orders',
      message: error.message,
    });
  }
});

module.exports = router;
