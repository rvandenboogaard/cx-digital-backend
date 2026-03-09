const db = require('./db.service');
const shopifyRESTService = require('./shopify-rest.service');
const dixaService = require('./dixa.service');
const queueMatcher = require('./queue-matcher.service');
const slack = require('./slack.service');

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Retry wrapper: probeert een functie max 3x met oplopende wachttijd (5s, 15s, 30s)
async function withRetry(fn, label) {
  const delays = [5000, 15000, 30000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt < delays.length) {
        console.warn(`${label} poging ${attempt + 1} mislukt: ${err.message}. Retry in ${delays[attempt] / 1000}s...`);
        await sleep(delays[attempt]);
      } else {
        console.error(`${label} definitief mislukt na ${attempt + 1} pogingen: ${err.message}`);
        throw err;
      }
    }
  }
}

// Sync Shopify orders voor 1 dag
async function syncShopifyDay(date) {
  const dateStr = typeof date === 'string' ? date : date.toISOString().substring(0, 10);
  const dateFrom = `${dateStr}T00:00:00.000Z`;
  const dateTo = `${dateStr}T23:59:59.999Z`;

  console.log(`Sync Shopify: ${dateStr}`);

  let orders;
  try {
    orders = await withRetry(
      () => shopifyRESTService.getOrdersViaREST({ dateFrom, dateTo }),
      `Shopify API ${dateStr}`
    );
  } catch (err) {
    await logSync(dateStr, 'shopify', 0, err.message);
    return { date: dateStr, synced: 0, error: err.message };
  }
  if (!orders || orders.length === 0) {
    await logSync(dateStr, 'shopify', 0);
    return { date: dateStr, synced: 0 };
  }

  // Batch insert: 100 orders per query voor snelheid (past binnen Vercel timeout)
  let synced = 0;
  const batchSize = 100;
  for (let i = 0; i < orders.length; i += batchSize) {
    const batch = orders.slice(i, i + batchSize);
    try {
      const values = [];
      const params = [];
      batch.forEach((order, idx) => {
        const offset = idx * 9;
        values.push(`($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6}, $${offset+7}, $${offset+8}, $${offset+9})`);
        params.push(
          order.shopify_order_id,
          dateStr,
          order.order_hour,
          order.customer_email,
          order.product_count,
          order.total_price,
          order.country_code,
          order.market_tag,
          order.source || 'shopify-rest',
        );
      });
      await db.query(
        `INSERT INTO orders (shopify_order_id, order_date, order_hour, customer_email, product_count, total_price, country_code, market_tag, source)
         VALUES ${values.join(', ')}
         ON CONFLICT (shopify_order_id) DO UPDATE SET
           order_date = EXCLUDED.order_date,
           product_count = EXCLUDED.product_count,
           total_price = EXCLUDED.total_price,
           country_code = EXCLUDED.country_code,
           market_tag = EXCLUDED.market_tag,
           synced_at = NOW()`,
        params
      );
      synced += batch.length;
    } catch (err) {
      console.error(`Batch insert failed at offset ${i}:`, err.message);
      // Fallback: probeer individueel
      for (const order of batch) {
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
            [order.shopify_order_id, dateStr, order.order_hour, order.customer_email, order.product_count, order.total_price, order.country_code, order.market_tag, order.source || 'shopify-rest']
          );
          synced++;
        } catch (e) {
          console.error(`Order insert failed ${order.shopify_order_id}:`, e.message);
        }
      }
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
    conversations = await withRetry(
      () => dixaService.getConversations({ dateFrom, dateTo }),
      `Dixa API ${dateStr}`
    );
  } catch (err) {
    await logSync(dateStr, 'dixa', 0, err.message);
    return { date: dateStr, synced: 0, error: err.message };
  }
  if (!conversations || conversations.length === 0) {
    await logSync(dateStr, 'dixa', 0);
    return { date: dateStr, synced: 0 };
  }

  // Batch insert: 50 conversations per query (18 params each = 900 params, under PG limit)
  let synced = 0;
  const batchSize = 50;
  for (let i = 0; i < conversations.length; i += batchSize) {
    const batch = conversations.slice(i, i + batchSize);
    try {
      const values = [];
      const params = [];
      batch.forEach((conv, idx) => {
        const marketTag = queueMatcher.getMarketFromQueue(conv.queue_name);
        const offset = idx * 18;
        values.push(`($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6}, $${offset+7}, $${offset+8}, $${offset+9}, $${offset+10}, $${offset+11}, $${offset+12}, $${offset+13}, $${offset+14}, $${offset+15}, $${offset+16}, $${offset+17}, $${offset+18})`);
        params.push(
          conv.dixa_conversation_id, dateStr, conv.conversation_hour, conv.customer_email,
          conv.message_count, conv.status, conv.reopened, conv.queue_name,
          conv.tags || [], conv.assigned_at, conv.created_at, conv.closed_at,
          conv.initial_channel, conv.exports_handling_duration, conv.exports_first_response_time,
          conv.total_duration, marketTag, conv.source || 'dixa_exports',
        );
      });
      await db.query(
        `INSERT INTO conversations (dixa_conversation_id, conversation_date, conversation_hour, customer_email, message_count, status, reopened, queue_name, tags, assigned_at, created_at, closed_at, initial_channel, exports_handling_duration, exports_first_response_time, total_duration, market_tag, source)
         VALUES ${values.join(', ')}
         ON CONFLICT (dixa_conversation_id) DO UPDATE SET
           status = EXCLUDED.status,
           reopened = EXCLUDED.reopened,
           message_count = EXCLUDED.message_count,
           closed_at = EXCLUDED.closed_at,
           initial_channel = EXCLUDED.initial_channel,
           exports_handling_duration = EXCLUDED.exports_handling_duration,
           exports_first_response_time = EXCLUDED.exports_first_response_time,
           total_duration = EXCLUDED.total_duration,
           synced_at = NOW()`,
        params
      );
      synced += batch.length;
    } catch (err) {
      console.error(`Batch conversation insert failed at offset ${i}:`, err.message);
      // Fallback: individual inserts
      for (const conv of batch) {
        try {
          const marketTag = queueMatcher.getMarketFromQueue(conv.queue_name);
          await db.query(
            `INSERT INTO conversations (dixa_conversation_id, conversation_date, conversation_hour, customer_email, message_count, status, reopened, queue_name, tags, assigned_at, created_at, closed_at, initial_channel, exports_handling_duration, exports_first_response_time, total_duration, market_tag, source)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
             ON CONFLICT (dixa_conversation_id) DO UPDATE SET
               status = EXCLUDED.status, reopened = EXCLUDED.reopened, message_count = EXCLUDED.message_count,
               closed_at = EXCLUDED.closed_at, initial_channel = EXCLUDED.initial_channel,
               exports_handling_duration = EXCLUDED.exports_handling_duration,
               exports_first_response_time = EXCLUDED.exports_first_response_time,
               total_duration = EXCLUDED.total_duration, synced_at = NOW()`,
            [conv.dixa_conversation_id, dateStr, conv.conversation_hour, conv.customer_email,
             conv.message_count, conv.status, conv.reopened, conv.queue_name,
             conv.tags || [], conv.assigned_at, conv.created_at, conv.closed_at,
             conv.initial_channel, conv.exports_handling_duration, conv.exports_first_response_time,
             conv.total_duration, marketTag, conv.source || 'dixa_exports']
          );
          synced++;
        } catch (e) {
          console.error(`Conversation insert failed ${conv.dixa_conversation_id}:`, e.message);
        }
      }
    }
  }

  await logSync(dateStr, 'dixa', synced);
  console.log(`Sync Dixa ${dateStr}: ${synced}/${conversations.length} conversations opgeslagen`);
  return { date: dateStr, synced, total: conversations.length };
}

// Sync gisteren (standaard daily cron) — parallel Shopify + Dixa
async function syncYesterday() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().substring(0, 10);

  const [shopify, dixa] = await Promise.all([
    syncShopifyDay(dateStr),
    syncDixaDay(dateStr),
  ]);

  return { date: dateStr, shopify, dixa };
}

// Sync vandaag (voor tussentijdse updates) — parallel Shopify + Dixa
async function syncToday() {
  const today = new Date().toISOString().substring(0, 10);

  const [shopify, dixa] = await Promise.all([
    syncShopifyDay(today),
    syncDixaDay(today),
  ]);

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

    const syncTasks = [];
    if (!syncedSources.includes('shopify')) {
      syncTasks.push(syncShopifyDay(dateStr).then(r => { dayResult.shopify = r; }));
    } else {
      dayResult.shopify = { date: dateStr, skipped: true, reason: 'already synced' };
    }
    if (!syncedSources.includes('dixa')) {
      syncTasks.push(syncDixaDay(dateStr).then(r => { dayResult.dixa = r; }));
    } else {
      dayResult.dixa = { date: dateStr, skipped: true, reason: 'already synced' };
    }
    if (syncTasks.length > 0) await Promise.all(syncTasks);

    results.push(dayResult);
    current.setDate(current.getDate() + 1);
    // Alleen tellen als er echt data gesynchroniseerd is (niet overgeslagen)
    if (!dayResult.shopify?.skipped || !dayResult.dixa?.skipped) {
      processed++;
    }
  }

  return results;
}

// Sync log bijhouden + Slack alert bij problemen
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

  // Slack alert bij fout of 0 records op werkdag
  await slack.notifySyncResult(dateStr, source, recordsSynced, error);
}

// Retry failed syncs: herprobeert alle mislukte syncs van de laatste 2 dagen
async function retryFailed() {
  const failed = await db.query(
    `SELECT sync_date, source FROM sync_log
     WHERE status = 'failed'
       AND sync_date >= NOW() - INTERVAL '2 days'
     ORDER BY sync_date`
  );

  if (failed.rows.length === 0) {
    return { retried: 0, message: 'Geen failed syncs gevonden' };
  }

  const results = [];
  for (const row of failed.rows) {
    const dateStr = new Date(row.sync_date).toISOString().substring(0, 10);
    console.log(`Retry: ${row.source} ${dateStr}`);

    // Verwijder failed entry zodat logSync opnieuw kan schrijven
    await db.query(
      `DELETE FROM sync_log WHERE sync_date = $1 AND source = $2 AND status = 'failed'`,
      [dateStr, row.source]
    );

    let result;
    if (row.source === 'shopify') {
      result = await syncShopifyDay(dateStr);
    } else {
      result = await syncDixaDay(dateStr);
    }
    results.push({ source: row.source, date: dateStr, result });
  }

  // Stuur retry resultaten naar Slack
  await slack.notifyRetryResult(results);

  return { retried: results.length, results };
}

module.exports = { syncShopifyDay, syncDixaDay, syncYesterday, syncToday, backfill, retryFailed };
