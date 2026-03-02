const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Import routes
const ordersRoutes = require('./routes/orders');
const conversationsRoutes = require('./routes/conversations');
const otcRoutes = require('./routes/otc');
const dashboardRoutes = require('./routes/dashboard');
const testRoutes = require('./routes/test');
const webhooksRoutes = require('./routes/webhooks');
//const { syncDixaAndShopifyData } = require('./jobs/hourly-sync');

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
console.log('✅ All routes registered!\n');

// Manual sync endpoint (for testing)
// app.post('/api/admin/sync', async (req, res) => {
// try {
//    const result = await syncDixaAndShopifyData();
//    res.json({ success: true, result });
//  } catch (error) {
//    res.status(500).json({ error: error.message });
//  }
//  });

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 CX Digital Backend running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Orders: http://localhost:${PORT}/api/orders?store_id=NL&date_from=2026-02-26&date_to=2026-02-26`);
  console.log(`   Sync: POST http://localhost:${PORT}/api/admin/sync\n`);
});

module.exports = app;
