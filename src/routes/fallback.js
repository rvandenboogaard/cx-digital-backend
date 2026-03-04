const express = require('express');
const router = express.Router();

/**
 * FALLBACK ENDPOINT - Disabled
 * Mock data has been removed to prevent incorrect data from being shown.
 * All data must come from live Shopify and Dixa APIs.
 */
router.get('/otc-data', (req, res) => {
  res.status(503).json({
    success: false,
    error: 'Live data unavailable',
    message: 'The dashboard requires a live connection to Shopify and Dixa. No fallback data is provided to prevent incorrect reporting.',
    action: 'Please check the Vercel backend logs and verify API credentials.',
  });
});

module.exports = router;
