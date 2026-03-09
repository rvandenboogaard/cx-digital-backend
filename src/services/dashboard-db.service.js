const db = require('./db.service');

// Queue type to SQL condition mapping
// - chat: initial_channel is widgetchat or contactform
// - mail: initial_channel is email, OR queue contains BOL (marketplace = email-like)
// - review: queue_name contains 'review'
const QUEUE_TYPE_SQL = {
  chat: `(LOWER(initial_channel) IN ('widgetchat', 'contactform'))`,
  mail: `(LOWER(initial_channel) = 'email' OR LOWER(queue_name) LIKE '%bol%')`,
  review: `(LOWER(queue_name) LIKE '%review%')`,
};

// Build dynamic filter clause for market_tags, stores, and queue_types
function buildFilters(baseParamCount, { marketTags, stores, queueTypes } = {}) {
  let clause = '';
  const params = [];
  let idx = baseParamCount + 1;

  if (marketTags && marketTags.length > 0) {
    const placeholders = marketTags.map((_, i) => `$${idx + i}`).join(', ');
    clause += ` AND market_tag IN (${placeholders})`;
    params.push(...marketTags);
    idx += marketTags.length;
  }
  if (stores && stores.length > 0) {
    // Match store name as prefix of queue_name (e.g. "smartwatchbanden.NL" matches "smartwatchbanden.NL (MAIL+CHAT)")
    const storeConditions = stores.map((_, i) => `queue_name LIKE $${idx + i} || '%'`);
    clause += ` AND (${storeConditions.join(' OR ')})`;
    params.push(...stores);
    idx += stores.length;
  }
  if (queueTypes && queueTypes.length > 0) {
    // Map queue_types to SQL conditions using initial_channel + queue_name
    const conditions = queueTypes
      .map(qt => QUEUE_TYPE_SQL[qt.toLowerCase()])
      .filter(Boolean);
    if (conditions.length > 0) {
      clause += ` AND (${conditions.join(' OR ')})`;
    }
  }
  return { clause, params };
}

// OTC summary: orders, conversations, ratio + KPIs
async function getSummary(dateFrom, dateTo, marketTag, filters = {}) {
  // Support legacy single marketTag + new multi-filter
  const marketTags = filters.marketTags || (marketTag ? [marketTag] : null);
  const { clause: marketFilter, params: filterParams } = buildFilters(2, { marketTags });
  const { clause: convFilter, params: convFilterParams } = buildFilters(2, { marketTags, stores: filters.stores, queueTypes: filters.queueTypes });
  const orderParams = [dateFrom, dateTo, ...filterParams];
  const convParams = [dateFrom, dateTo, ...convFilterParams];

  const [ordersResult, convResult, openResult] = await Promise.all([
    db.query(
      `SELECT COUNT(*) as total FROM orders WHERE order_date >= $1 AND order_date <= $2 ${marketFilter}`,
      orderParams
    ),
    db.query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'closed' AND reopened = FALSE) as fcr_count,
         AVG(exports_handling_duration) FILTER (WHERE exports_handling_duration > 0) as avg_aht,
         AVG(exports_first_response_time) FILTER (WHERE exports_first_response_time > 0) as avg_frt,
         AVG(CASE WHEN assigned_at > 0 AND created_at > 0 THEN (assigned_at - created_at) / 1000.0 END) as avg_ast,
         COUNT(*) FILTER (WHERE status = 'closed' AND total_duration IS NOT NULL AND total_duration / 1000 < 86400) as sla_met
       FROM conversations
       WHERE conversation_date >= $1 AND conversation_date <= $2 ${convFilter}`,
      convParams
    ),
    db.query(
      `SELECT COUNT(*) as total FROM conversations
       WHERE conversation_date >= $1 AND conversation_date <= $2 AND status != 'closed' ${convFilter}`,
      convParams
    ),
  ]);

  const totalOrders = parseInt(ordersResult.rows[0].total);
  const conv = convResult.rows[0];
  const totalConversations = parseInt(conv.total);
  const otcRatio = totalOrders > 0 ? ((totalConversations / totalOrders) * 100) : 0;
  const fcrPct = totalConversations > 0 ? ((parseInt(conv.fcr_count) / totalConversations) * 100) : 0;
  const avgAht = parseFloat(conv.avg_aht) || 0;
  const avgAst = parseFloat(conv.avg_ast) || 0;
  const slaPct = totalConversations > 0 ? ((parseInt(conv.sla_met) / totalConversations) * 100) : 0;

  return {
    period: { from: dateFrom, to: dateTo },
    tag: marketTag || 'all',
    metrics: {
      total_orders: totalOrders,
      total_conversations: totalConversations,
      otc_ratio: parseFloat(otcRatio.toFixed(2)),
      open_tickets: parseInt(openResult.rows[0].total),
      avg_fcr: parseFloat(fcrPct.toFixed(1)),
      avg_aht_seconds: Math.round(avgAht),
      avg_aht_formatted: formatDuration(Math.round(avgAht)),
      avg_ast_seconds: Math.round(avgAst),
      avg_ast_formatted: formatHours(Math.round(avgAst)),
      avg_sla: parseFloat(slaPct.toFixed(1)),
    },
  };
}

// Daily trend: orders + conversations per dag
async function getTrend(dateFrom, dateTo, marketTag, filters = {}) {
  const marketTags = filters.marketTags || (marketTag ? [marketTag] : null);
  const { clause: marketFilter, params: filterParams } = buildFilters(2, { marketTags });
  const { clause: convFilter, params: convFilterParams } = buildFilters(2, { marketTags, stores: filters.stores, queueTypes: filters.queueTypes });
  const orderParams = [dateFrom, dateTo, ...filterParams];
  const convParams = [dateFrom, dateTo, ...convFilterParams];

  const [ordersResult, convResult] = await Promise.all([
    db.query(
      `SELECT order_date::text as day, COUNT(*) as count
       FROM orders WHERE order_date >= $1 AND order_date <= $2 ${marketFilter}
       GROUP BY order_date ORDER BY order_date`,
      orderParams
    ),
    db.query(
      `SELECT conversation_date::text as day, COUNT(*) as count
       FROM conversations WHERE conversation_date >= $1 AND conversation_date <= $2 ${convFilter}
       GROUP BY conversation_date ORDER BY conversation_date`,
      convParams
    ),
  ]);

  // Merge into daily trend
  const ordersByDay = {};
  ordersResult.rows.forEach(r => { ordersByDay[r.day] = parseInt(r.count); });
  const convByDay = {};
  convResult.rows.forEach(r => { convByDay[r.day] = parseInt(r.count); });

  const allDays = new Set([...Object.keys(ordersByDay), ...Object.keys(convByDay)]);
  const trend = [...allDays].sort().map(day => {
    const orders = ordersByDay[day] || 0;
    const conversations = convByDay[day] || 0;
    const otc = orders > 0 ? ((conversations / orders) * 100).toFixed(2) : 0;
    return { day, orders, conversations, otc_ratio: parseFloat(otc) };
  });

  return { period: { from: dateFrom, to: dateTo }, tag: marketTag || 'all', trend };
}

// Per-store/market breakdown
async function getStores(dateFrom, dateTo) {
  const [ordersResult, convResult] = await Promise.all([
    db.query(
      `SELECT market_tag, COUNT(*) as count
       FROM orders WHERE order_date >= $1 AND order_date <= $2 AND market_tag IS NOT NULL
       GROUP BY market_tag`,
      [dateFrom, dateTo]
    ),
    db.query(
      `SELECT market_tag,
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'closed' AND reopened = FALSE) as fcr_count,
         AVG(exports_handling_duration) FILTER (WHERE exports_handling_duration > 0) as avg_aht,
         AVG(CASE WHEN assigned_at > 0 AND created_at > 0 THEN (assigned_at - created_at) / 1000.0 END) as avg_ast
       FROM conversations
       WHERE conversation_date >= $1 AND conversation_date <= $2 AND market_tag IS NOT NULL
       GROUP BY market_tag`,
      [dateFrom, dateTo]
    ),
  ]);

  const ordersByMarket = {};
  ordersResult.rows.forEach(r => { ordersByMarket[r.market_tag] = parseInt(r.count); });

  const markets = {};
  const MARKET_NAMES = {
    'SWB': 'Benelux (NL/BE)',
    'SWA': 'Germany/Austria (DE/AT)',
    'BSW': 'France (FR)',
    'CSW': 'Spain (ES)',
    'SWS': 'United Kingdom (UK)',
    'XoXo': 'XoXo Wildhearts',
  };

  // Include all markets, even if no data
  for (const [tag, name] of Object.entries(MARKET_NAMES)) {
    const orders = ordersByMarket[tag] || 0;
    const convRow = convResult.rows.find(r => r.market_tag === tag);
    const conversations = convRow ? parseInt(convRow.total) : 0;
    const fcrCount = convRow ? parseInt(convRow.fcr_count) : 0;
    const avgAht = convRow ? parseFloat(convRow.avg_aht) || 0 : 0;
    const avgAst = convRow ? parseFloat(convRow.avg_ast) || 0 : 0;

    markets[tag] = {
      name,
      orders,
      conversations,
      otc_ratio: orders > 0 ? parseFloat(((conversations / orders) * 100).toFixed(2)) : 0,
      fcr: conversations > 0 ? parseFloat(((fcrCount / conversations) * 100).toFixed(1)) : 0,
      avg_aht_seconds: Math.round(avgAht),
      avg_aht_formatted: formatDuration(Math.round(avgAht)),
      avg_ast_seconds: Math.round(avgAst),
      avg_ast_formatted: formatHours(Math.round(avgAst)),
    };
  }

  return { period: { from: dateFrom, to: dateTo }, markets };
}

// Queue breakdown
async function getQueues(dateFrom, dateTo, marketTag, filters = {}) {
  const marketTags = filters.marketTags || (marketTag ? [marketTag] : null);
  const { clause: convFilter, params: filterParams } = buildFilters(2, { marketTags, stores: filters.stores, queueTypes: filters.queueTypes });
  const params = [dateFrom, dateTo, ...filterParams];

  const result = await db.query(
    `SELECT queue_name,
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE status = 'closed' AND reopened = FALSE) as fcr_count,
       AVG(exports_handling_duration) FILTER (WHERE exports_handling_duration > 0) as avg_aht
     FROM conversations
     WHERE conversation_date >= $1 AND conversation_date <= $2 AND queue_name IS NOT NULL ${convFilter}
     GROUP BY queue_name
     ORDER BY total DESC`,
    params
  );

  return {
    period: { from: dateFrom, to: dateTo },
    queues: result.rows.map(r => ({
      queue_name: r.queue_name,
      conversations: parseInt(r.total),
      fcr: parseInt(r.total) > 0 ? parseFloat(((parseInt(r.fcr_count) / parseInt(r.total)) * 100).toFixed(1)) : 0,
      avg_aht_seconds: Math.round(parseFloat(r.avg_aht) || 0),
      avg_aht_formatted: formatDuration(Math.round(parseFloat(r.avg_aht) || 0)),
    })),
  };
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function formatHours(seconds) {
  return `${(seconds / 3600).toFixed(1)}h`;
}

module.exports = { getSummary, getTrend, getStores, getQueues };
