const dixa = require('../services/dixa.service');
const shopify = require('../services/shopify.service');
const database = require('../services/database.service');

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function syncDixaAndShopifyData() {
  const startTime = Date.now();
  console.log(`\n🔄 Starting Dixa + Shopify sync at ${new Date().toISOString()}`);
  
  try {
    // Get yesterday's data
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = formatDate(yesterday);
    
    const dateFromISO = `${dateStr}T00:00:00Z`;
    const dateToISO = `${dateStr}T23:59:59Z`;
    
    console.log(`📅 Syncing data for: ${dateStr}`);
    
    // 1. Fetch Dixa conversations
    console.log('📞 Fetching Dixa conversations...');
    const conversations = await dixa.getConversations({
      dateFrom: dateFromISO,
      dateTo: dateToISO
    });
    console.log(`✅ Dixa: ${conversations.length} conversations`);
    
    // 2. Fetch Shopify orders (use mock for now if no keys)
    const stores = ['NL', 'DE', 'FR', 'ES', 'UK', 'INTL'];
    let allOrders = [];
    
    for (const store of stores) {
      try {
        console.log(`📦 Fetching Shopify orders for ${store}...`);
        // Use mock data if API keys not configured
        const orders = await shopify.getMockOrders({
          store_id: store,
          dateFrom: dateFromISO,
          dateTo: dateToISO
        });
        console.log(`✅ Shopify (${store}): ${orders.length} orders`);
        allOrders = allOrders.concat(orders);
      } catch (error) {
        console.error(`⚠️ Shopify sync failed for ${store}:`, error.message);
        // Continue with other stores
      }
    }
    
    // 3. Store in database
    console.log(`💾 Storing ${allOrders.length} orders in database...`);
    for (const order of allOrders) {
      try {
        await database.upsertOrder(order);
      } catch (error) {
        console.error(`Error storing order:`, error.message);
      }
    }
    
    // 4. Calculate OTC ratio
    const ticketsPerStore = {};
    const ordersPerStore = {};
    
    conversations.forEach(conv => {
      const storeId = conv.store_id || 'UNKNOWN';
      ticketsPerStore[storeId] = (ticketsPerStore[storeId] || 0) + 1;
    });
    
    allOrders.forEach(order => {
      ordersPerStore[order.store_id] = (ordersPerStore[order.store_id] || 0) + 1;
    });
    
    console.log('\n📊 OTC Ratios:');
    for (const store in ticketsPerStore) {
      const tickets = ticketsPerStore[store];
      const orders = ordersPerStore[store] || 1;
      const otc = ((tickets / orders) * 100).toFixed(2);
      console.log(`  ${store}: ${otc}% (${tickets} tickets / ${orders} orders)`);
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Sync complete in ${duration}s\n`);
    
    return { success: true, conversations: conversations.length, orders: allOrders.length };
    
  } catch (error) {
    console.error('❌ Sync job failed:', error.message);
    return { success: false, error: error.message };
  }
}

function startScheduler() {
  console.log('📅 Hourly sync scheduled');
  const cron = require('node-cron');
  cron.schedule('0 * * * *', syncDixaAndShopifyData);
}

module.exports = {
  syncDixaAndShopifyData,
  startScheduler
};
