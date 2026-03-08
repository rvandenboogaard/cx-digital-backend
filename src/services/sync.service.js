const db = require('./db.service');
const shopifyRESTService = require('./shopify-rest.service');
const dixaService = require('./dixa.service');
const queueMatcher = require('./queue-matcher.service');

// Sync Shopify orders voor 1 dag
async function syncShopifyDay(date) {
  const dateStr = typeof date === 'string' ? date : date.toISOString().substring(0, 10);
  const dateFrom = `${dateStr}T00:00:00.000Z`;
  const dateTo = `${dateStr}T23:59:59.999Z`;

  console.log(`Sync Shopify: ${dateStr}`);

  let orders;
  try {
    orders = await shopifyRESTService.getOrdersViaREST({ dateFrom, dateTo });
  } catch (err) {
    await logSync(dateStr, 'shopify', 0, err.message);
    return { date: dateStr, synced: 0, error: err.message };
  }
  if (!orders || orders.length === 0) {
    await logSync(dateStr, 'shopify', 0);
    return { date: dateStr, synced: 0 };
  }

  let synced = 0;
  for (const order of orders) {
    try {
      await db.query(
        `INSERT INTO orders (shopify_order_id, order_date, order_hour, customer_email, product_count, total_price, country_code, market_tag, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (shopify_order_id) DO UPDATE SET
           order_date = EXCLUDED.order_date,
           product_count = EXCLUDED.product_count,
           total_price = EXCLUDED.total_price,
           country_code = EXCLUDED.country_code,
           market_tag = EXCLUDED.market_tag,
           synced_at = NOW()`,
        [
          order.shopify_order_id,
          dateStr,
          order.order_hour,
          order.customer_email,
          order.product_count,
          order.total_price,
          order.country_code,
          order.market_tag,
          order.source || 'shopify-rest',
        ]
      );
      synced++;
    } catch (err) {
      console.error(`Order insert failed ${order.shopify_order_id}:`, err.message);
    }
  }

  await logSync(dateStr, 'shopify', synced);
  console.log(`Sync Shopify ${dateStr}: ${synced}/${orders.length} orders opgeslagen`);
  return { date: dateStr, synced, total: orders.length };
}

// Sync Dixa conversations voor 1 dag
async function syncDixaDay(date) {
  const dateStr = typeof date === 'string' ? date : date.toISOString().substring(0, 10);
  const dateFrom = `${dateStr}T00:00:00.000Z`;
  const dateTo = `${dateStr}T23:59:59.999Z`;

  console.log(`Sync Dixa: ${dateStr}`);

  let conversations;
  try {
    conversations = await dixaService.getConversations({ dateFrom, dateTo });
  } catch (err) {
    await logSync(dateStr, 'dixa', 0, err.message);
    return { date: dateStr, synced: 0, error: err.message };
  }
  if (!conversations || conversations.length === 0) {
    await logSync(dateStr, 'dixa', 0);
    return { date: dateStr, synced: 0 };
  }

  let synced = 0;
  for (const conv of conversations) {
    try {
      // Bepaal market_tag op basis van queue naam
      const marketTag = queueMatcher.getMarketFromQueue(conv.queue_name);

      await db.query(
        `INSERT INTO conversations (dixa_conversation_id, conversation_date, conversation_hour, customer_email, message_count, status, reopened, queue_name, tags, assigned_at, created_at, closed_at, exports_handling_duration, exports_first_response_time, total_duration, market_tag, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         ON CONFLICT (dixa_conversation_id) DO UPDATE SET
           status = EXCLUDED.status,
           reopened = EXCLUDED.reopened,
           message_count = EXCLUDED.message_count,
           closed_at = EXCLUDED.closed_at,
           exports_handling_duration = EXCLUDED.exports_handling_duration,
           exports_first_response_time = EXCLUDED.exports_first_response_time,
           total_duration = EXCLUDED.total_duration,
           synced_at = NOW()`,
        [
          conv.dixa_conversation_id,
          dateStr,
          conv.conversation_hour,
          conv.customer_email,
          conv.message_count,
          conv.status,
          conv.reopened,
          conv.queue_name,
          conv.tags || [],
          conv.assigned_at,
          conv.created_at,
          conv.closed_at,
          conv.exports_handling_duration,
          conv.exports_first_response_time,
          conv.total_duration,
          marketTag,
          conv.source || 'dixa_exports',
        ]
      );
      synced++;
    } catch (err) {
      console.error(`Conversation insert failed ${conv.dixa_conversation_id}:`, err.message);
    }
  }

  await logSync(dateStr, 'dixa', synced);
  console.log(`Sync Dixa ${dateStr}: ${synced}/${conversations.length} conversations opgeslagen`);
  return { date: dateStr, synced, total: conversations.length };
}

// Sync gisteren (standaard daily cron)
async function syncYesterday() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().substring(0, 10);

  const shopify = await syncShopifyDay(dateStr);
  const dixa = await syncDixaDay(dateStr);

  return { date: dateStr, shopify, dixa };
}

// Sync vandaag (voor tussentijdse updates)
async function syncToday() {
  const today = new Date().toISOString().substring(0, 10);

  const shopify = await syncShopifyDay(today);
  const dixa = await syncDixaDay(today);

  return { date: today, shopify, dixa };
}

// Backfill: sync meerdere dagen (met limiet per request)
async function backfill(startDate, endDate, dayLimit = 3) {
  const results = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  let processed = 0;

  while (current <= end && processed < dayLimit) {
    const dateStr = current.toISOString().substring(0, 10);

    // Check of deze dag al gesynchroniseerd is
    const existing = await db.query(
      `SELECT source, records_synced FROM sync_log WHERE sync_date = $1 AND status = 'completed'`,
      [dateStr]
    );
    const syncedSources = existing.rows.map(r => r.source);

    const dayResult = { date: dateStr };

    if (!syncedSources.includes('shopify')) {
      dayResult.shopify = await syncShopifyDay(dateStr);
    } else {
      dayResult.shopify = { date: dateStr, skipped: true, reason: 'already synced' };
    }

    if (!syncedSources.includes('dixa')) {
      dayResult.dixa = await syncDixaDay(dateStr);
    } else {
      dayResult.dixa = { date: dateStr, skipped: true, reason: 'already synced' };
    }

    results.push(dayResult);
    current.setDate(current.getDate() + 1);
    // Alleen tellen als er echt data gesynchroniseerd is (niet overgeslagen)
    if (!dayResult.shopify?.skipped || !dayResult.dixa?.skipped) {
      processed++;
    }
  }

  return results;
}

// Sync log bijhouden
async function logSync(dateStr, source, recordsSynced, error = null) {
  try {
    await db.query(
      `INSERT INTO sync_log (sync_date, source, records_synced, status, error_message, completed_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (sync_date, source) DO UPDATE SET
         records_synced = EXCLUDED.records_synced,
         status = EXCLUDED.status,
         error_message = EXCLUDED.error_message,
         completed_at = NOW()`,
      [dateStr, source, recordsSynced, error ? 'failed' : 'completed', error]
    );
  } catch (err) {
    console.error('Sync log failed:', err.message);
  }
}

module.exports = { syncShopifyDay, syncDixaDay, syncYesterday, syncToday, backfill };
