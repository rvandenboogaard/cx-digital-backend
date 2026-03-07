const express = require('express');
const router = express.Router();
const syncService = require('../services/sync.service');
const db = require('../services/db.service');

// Vercel Cron endpoint: dagelijkse sync (gisteren + vandaag)
router.get('/daily', async (req, res) => {
  try {
    // Simpele auth check voor cron
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('=== Daily sync gestart ===');
    const yesterday = await syncService.syncYesterday();
    const today = await syncService.syncToday();

    res.json({
      success: true,
      message: 'Daily sync completed',
      results: { yesterday, today },
    });
  } catch (error) {
    console.error('Daily sync failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Handmatige sync voor specifieke dag
router.post('/day', async (req, res) => {
  try {
    const { date } = req.body;
    if (!date) return res.status(400).json({ error: 'Missing date (YYYY-MM-DD)' });

    const shopify = await syncService.syncShopifyDay(date);
    const dixa = await syncService.syncDixaDay(date);

    res.json({ success: true, date, shopify, dixa });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Backfill: sync meerdere dagen (laatste 3 weken default)
router.post('/backfill', async (req, res) => {
  try {
    const { start_date, end_date } = req.body;

    // Default: laatste 21 dagen
    const endDate = end_date || new Date().toISOString().substring(0, 10);
    const startDefault = new Date();
    startDefault.setDate(startDefault.getDate() - 21);
    const startDate = start_date || startDefault.toISOString().substring(0, 10);

    console.log(`=== Backfill gestart: ${startDate} tot ${endDate} ===`);
    const results = await syncService.backfill(startDate, endDate);

    const totalShopify = results.reduce((sum, r) => sum + (r.shopify?.synced || 0), 0);
    const totalDixa = results.reduce((sum, r) => sum + (r.dixa?.synced || 0), 0);

    res.json({
      success: true,
      period: { from: startDate, to: endDate },
      days_processed: results.length,
      totals: { shopify_orders: totalShopify, dixa_conversations: totalDixa },
      details: results,
    });
  } catch (error) {
    console.error('Backfill failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Sync status: welke dagen zijn gesynchroniseerd
router.get('/status', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT sync_date, source, records_synced, status, completed_at
       FROM sync_log
       ORDER BY sync_date DESC, source
       LIMIT 60`
    );

    const dbStats = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM orders) as total_orders,
        (SELECT COUNT(*) FROM conversations) as total_conversations,
        (SELECT MIN(order_date) FROM orders) as orders_from,
        (SELECT MAX(order_date) FROM orders) as orders_to,
        (SELECT MIN(conversation_date) FROM conversations) as conversations_from,
        (SELECT MAX(conversation_date) FROM conversations) as conversations_to`
    );

    res.json({
      success: true,
      database: dbStats.rows[0],
      recent_syncs: result.rows,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DB schema aanmaken (eenmalig)
router.post('/setup', async (req, res) => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        shopify_order_id BIGINT NOT NULL,
        order_date DATE NOT NULL,
        order_hour TIMESTAMP NOT NULL,
        customer_email VARCHAR(255),
        product_count INTEGER DEFAULT 0,
        total_price NUMERIC(10,2) DEFAULT 0,
        country_code VARCHAR(5),
        market_tag VARCHAR(10),
        source VARCHAR(30) DEFAULT 'shopify-rest',
        synced_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(shopify_order_id)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        dixa_conversation_id VARCHAR(100) NOT NULL,
        conversation_date DATE NOT NULL,
        conversation_hour TIMESTAMP,
        customer_email VARCHAR(255),
        message_count INTEGER DEFAULT 1,
        status VARCHAR(30),
        reopened BOOLEAN DEFAULT FALSE,
        queue_name VARCHAR(255),
        tags TEXT[],
        assigned_at BIGINT,
        created_at BIGINT,
        closed_at BIGINT,
        exports_handling_duration NUMERIC,
        exports_first_response_time NUMERIC,
        total_duration BIGINT,
        market_tag VARCHAR(10),
        source VARCHAR(30) DEFAULT 'dixa_exports',
        synced_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(dixa_conversation_id)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS sync_log (
        id SERIAL PRIMARY KEY,
        sync_date DATE NOT NULL,
        source VARCHAR(20) NOT NULL,
        records_synced INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'completed',
        error_message TEXT,
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      )
    `);

    // Indexes
    await db.query(`CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_orders_market ON orders(market_tag)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_orders_date_market ON orders(order_date, market_tag)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_conv_date ON conversations(conversation_date)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_conv_market ON conversations(market_tag)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_conv_date_market ON conversations(conversation_date, market_tag)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_conv_queue ON conversations(queue_name)`);

    // sync_log unique index
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_log_unique
      ON sync_log(sync_date, source)
    `);

    res.json({ success: true, message: 'Database schema created' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
