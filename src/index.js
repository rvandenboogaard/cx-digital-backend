// CX Digital Backend - OTC Dashboard
// Force Vercel rebuild: 2026-03-02 11:30 UTC
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - CORS for Loveable + browser clients
app.use(cors({
  origin: '*', // Allow all origins (safe for public API)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
}));
app.use(express.json());

// Import routes
const ordersRoutes = require('./routes/orders');
const conversationsRoutes = require('./routes/conversations');
const otcRoutes = require('./routes/otc');
const dashboardRoutes = require('./routes/dashboard');
const testRoutes = require('./routes/test');
const webhooksRoutes = require('./routes/webhooks');
const fallbackRoutes = require('./routes/fallback');
const backlogRoutes = require('./routes/backlog');
const storeComparisonRoutes = require('./routes/store-comparison');
const syncRoutes = require('./routes/sync');

const dbService = require('./services/db.service');

// Routes
app.get('/health', async (req, res) => {
  const dbConnected = await dbService.isConnected();
  res.json({ status: 'ok', timestamp: new Date().toISOString(), database: dbConnected ? 'connected' : 'not configured' });
});

console.log('✅ Registering API routes...');
app.use('/api/orders', ordersRoutes);
console.log('  ✓ /api/orders');
app.use('/api/conversations', conversationsRoutes);
console.log('  ✓ /api/conversations');
app.use('/api/otc', otcRoutes);
console.log('  ✓ /api/otc');
app.use('/api/dashboard', dashboardRoutes);
console.log('  ✓ /api/dashboard');
app.use('/api/test', testRoutes);
console.log('  ✓ /api/test');
app.use('/api/webhooks', webhooksRoutes);
console.log('  ✓ /api/webhooks');
app.use('/api/fallback', fallbackRoutes);
console.log('  ✓ /api/fallback (EMERGENCY ENDPOINT)');
app.use('/api/backlog', backlogRoutes);
console.log('  ✓ /api/backlog (DIXA EXPORTS API)');
app.use('/api/store-comparison', storeComparisonRoutes);
console.log('  ✓ /api/store-comparison (MULTI-STORE METRICS)');
app.use('/api/sync', syncRoutes);
console.log('  ✓ /api/sync (DB SYNC + CRON)');
console.log('All routes registered!\n');

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 CX Digital Backend running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Orders: http://localhost:${PORT}/api/orders?store_id=NL&date_from=2026-02-26&date_to=2026-02-26`);
  console.log(`   Sync: POST http://localhost:${PORT}/api/sync/backfill\n`);
});

module.exports = app;
