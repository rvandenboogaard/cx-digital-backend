const express = require('express');
require('dotenv').config();

const router = express.Router();

const SHOP = process.env.SHOPIFY_SHOP_NAME;
const TOKEN = process.env.SHOPIFY_API_PASSWORD;
const API_VERSION = '2024-01';

// --- PII anonymizer ---
function anonymize(order) {
  if (!order) return order;
  const clone = JSON.parse(JSON.stringify(order));
  const fakeAddr = {
    first_name: 'Test', last_name: 'Klant', name: 'Test Klant',
    address1: 'Teststraat 1', address2: null, company: null,
    phone: '0612345678',
    city: clone.billing_address?.city || 'Rotterdam',
    zip: clone.billing_address?.zip || '3000 AA',
    province: null, province_code: null,
    country: clone.billing_address?.country || 'Netherlands',
    country_code: clone.billing_address?.country_code || 'NL',
    latitude: null, longitude: null,
  };
  if (clone.email) clone.email = 'klant@example.com';
  if (clone.contact_email) clone.contact_email = 'klant@example.com';
  if (clone.phone) clone.phone = '0612345678';
  if (clone.customer) {
    clone.customer.first_name = 'Test';
    clone.customer.last_name = 'Klant';
    clone.customer.email = 'klant@example.com';
    clone.customer.phone = '0612345678';
    if (clone.customer.default_address) Object.assign(clone.customer.default_address, fakeAddr);
  }
  if (clone.billing_address) Object.assign(clone.billing_address, fakeAddr);
  if (clone.shipping_address) Object.assign(clone.shipping_address, fakeAddr);
  return clone;
}

// --- Channel detection ---
function detectChannel(order) {
  const tagsLower = (order.tags || '').toLowerCase();
  const sourceName = (order.source_name || '').toLowerCase();
  if (tagsLower.includes('bol be')) return 'bol_be';
  if (tagsLower.includes('bol nl') || tagsLower.includes('bol')) return 'bol_nl';
  if (tagsLower.includes('mediamarkt') || tagsLower.includes('media markt')) return 'mediamarkt';
  if (tagsLower.includes('kaufland')) return 'kaufland';
  if (tagsLower.includes('amazon')) return 'amazon';
  if (sourceName === 'amazon' || sourceName.includes('amazon')) return 'amazon';
  if (sourceName === 'web') return 'webshop';
  if (order.app_id === 580111) return 'webshop';
  if (sourceName && /^\d+$/.test(sourceName)) return 'unknown_marketplace';
  return 'other';
}

function summarize(order) {
  return {
    id: order.id, name: order.name, created_at: order.created_at,
    source_name: order.source_name, app_id: order.app_id,
    tags: order.tags, note_attributes: order.note_attributes,
    detected_channel: detectChannel(order),
  };
}

// --- Native fetch (Node 18+) — bypasses old axios/CA cert chain issue ---
async function fetchOrdersPage(url) {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Shopify-Access-Token': TOKEN,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Shopify ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const link = res.headers.get('link') || '';
  const nextMatch = link.match(/<([^>]+)>;\s*rel="next"/);
  return { orders: data.orders || [], nextUrl: nextMatch ? nextMatch[1] : null };
}

// GET /api/debug/raw-orders?days=60&pages=8
router.get('/raw-orders', async (req, res) => {
  try {
    if (!SHOP || !TOKEN) {
      return res.status(500).json({ error: 'SHOPIFY_SHOP_NAME or SHOPIFY_API_PASSWORD missing' });
    }
    const days = Math.min(parseInt(req.query.days, 10) || 60, 180);
    const maxPages = Math.min(parseInt(req.query.pages, 10) || 8, 20);

    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

    let url = `https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/orders.json?status=any&limit=250&created_at_min=${from.toISOString()}&created_at_max=${to.toISOString()}`;

    const wanted = ['webshop', 'bol_nl', 'bol_be', 'mediamarkt', 'kaufland', 'amazon'];
    const samples = {};
    const channelCounts = {};
    const tagSet = new Set();
    const sourceNameSet = new Set();
    const appIdSet = new Set();
    let totalScanned = 0;
    let pagesFetched = 0;

    while (url && pagesFetched < maxPages) {
      const { orders, nextUrl } = await fetchOrdersPage(url);
      pagesFetched++;
      totalScanned += orders.length;

      for (const o of orders) {
        const ch = detectChannel(o);
        channelCounts[ch] = (channelCounts[ch] || 0) + 1;
        if (o.tags) o.tags.split(',').forEach((t) => tagSet.add(t.trim()));
        if (o.source_name) sourceNameSet.add(o.source_name);
        if (o.app_id) appIdSet.add(o.app_id);
        if (wanted.includes(ch) && !samples[ch]) samples[ch] = anonymize(o);
      }
      if (wanted.every((w) => samples[w])) break;
      url = nextUrl;
    }

    const sampleSummaries = {};
    for (const [k, v] of Object.entries(samples)) sampleSummaries[k] = summarize(v);

    res.json({
      window: { from: from.toISOString(), to: to.toISOString(), days },
      pages_fetched: pagesFetched,
      total_scanned: totalScanned,
      channel_counts: channelCounts,
      unique_tags_seen: [...tagSet].sort(),
      unique_source_names_seen: [...sourceNameSet].sort(),
      unique_app_ids_seen: [...appIdSet].sort(),
      missing_channels: wanted.filter((w) => !samples[w]),
      sample_summaries: sampleSummaries,
      samples,
    });
  } catch (err) {
    res.status(500).json({ error: err.message, status: err.status });
  }
});

module.exports = router;
