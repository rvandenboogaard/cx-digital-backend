const express = require('express');
const axios = require('axios');
const router = express.Router();

const config = {
  accessToken: process.env.SHOPIFY_API_PASSWORD,
  shopName: process.env.SHOPIFY_SHOP_NAME,
};

const BASE_URL = `https://${config.shopName}/admin/api/2024-01`;

// Anonimiseer PII maar behoud structuur
function anonymize(order) {
  if (!order) return null;

  const fakeAddr = (addr) => addr ? {
    ...addr,
    first_name: 'Test',
    last_name: 'Klant',
    name: 'Test Klant',
    address1: 'Teststraat 1',
    address2: null,
    phone: '0612345678',
    company: addr.company ? 'Test BV' : null,
  } : addr;

  return {
    ...order,
    email: 'klant@example.com',
    contact_email: 'klant@example.com',
    customer: order.customer ? {
      ...order.customer,
      first_name: 'Test',
      last_name: 'Klant',
      email: 'klant@example.com',
      phone: '0612345678',
      default_address: fakeAddr(order.customer.default_address),
    } : null,
    billing_address: fakeAddr(order.billing_address),
    shipping_address: fakeAddr(order.shipping_address),
  };
}

async function fetchOrders(params) {
  const res = await axios.get(`${BASE_URL}/orders.json`, {
    params: { status: 'any', limit: 250, ...params },
    headers: { 'X-Shopify-Access-Token': config.accessToken },
    timeout: 20000,
  });
  return res.data.orders || [];
}

function pickByTags(orders, predicate) {
  return orders.find(o => predicate((o.tags || '').toLowerCase()));
}

router.get('/raw-orders', async (req, res) => {
  try {
    if (!config.accessToken || !config.shopName) {
      return res.status(500).json({ error: 'Shopify credentials not configured' });
    }

    // Window: laatste 30 dagen
    const dateTo = new Date();
    const dateFrom = new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000);

    const orders = await fetchOrders({
      created_at_min: dateFrom.toISOString(),
      created_at_max: dateTo.toISOString(),
    });

    const webshopOrder = pickByTags(orders, t =>
      !t.includes('bol') && !t.includes('mediamarkt') &&
      !t.includes('amazon') && !t.includes('kaufland') && !t.includes('fnac')
    );

    const bolOrder = pickByTags(orders, t => t.includes('bol'));

    const otherMarketplaceOrder = pickByTags(orders, t =>
      t.includes('mediamarkt') || t.includes('amazon') ||
      t.includes('kaufland') || t.includes('fnac')
    );

    // Verzamel alle unieke tags voor debug-overzicht
    const allTags = new Set();
    orders.forEach(o => (o.tags || '').split(',').map(t => t.trim()).filter(Boolean).forEach(t => allTags.add(t)));

    res.json({
      window: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
      total_scanned: orders.length,
      unique_tags_seen: Array.from(allTags).sort(),
      samples: {
        webshop: anonymize(webshopOrder),
        bol: anonymize(bolOrder),
        other_marketplace: anonymize(otherMarketplaceOrder),
      },
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      shopify_status: err.response?.status,
      shopify_body: err.response?.data,
    });
  }
});

module.exports = router;
