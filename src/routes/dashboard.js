const express = require('express');
const router = express.Router();
const dashboardDB = require('../services/dashboard-db.service');
const dbService = require('../services/db.service');
const cache = require('../services/cache.service');

// Fallback imports voor als DB niet beschikbaar is
const shopifyService = require('../services/shopify.service');
const shopifyRESTService = require('../services/shopify-rest.service');
const dixaService = require('../services/dixa.service');
const c1CategoryService = require('../services/c1-category.service');

// Check of DB beschikbaar is
async function useDB() {
  try {
    return await dbService.isConnected();
  } catch {
    return false;
  }
}

// Cache wrapper: check cache first, compute if miss
async function cached(key, computeFn) {
  const hit = cache.get(key);
  if (hit) return hit;
  const data = await computeFn();
  cache.set(key, data);
  return data;
}

// Calculate previous period dates (same length, directly before)
function getPreviousPeriod(dateFrom, dateTo) {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const durationMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1); // day before current from
  const prevFrom = new Date(prevTo.getTime() - durationMs + 1);
  return { prevFrom: prevFrom.toISOString().split('T')[0], prevTo: prevTo.toISOString().split('T')[0] };
}

// Calculate trend diffs: current metrics - previous metrics
function calculateTrends(current, previous) {
  if (!previous) return { trend_contact_rate: null, trend_fcr: null, trend_aht: null, trend_sla: null };
  const diff = (a, b) => a != null && b != null ? parseFloat((a - b).toFixed(1)) : null;
  return {
    trend_contact_rate: diff(current.otc_ratio, previous.otc_ratio),
    trend_fcr: diff(current.avg_fcr, previous.avg_fcr),
    trend_aht: current.avg_aht_seconds != null && previous.avg_aht_seconds != null
      ? Math.round(current.avg_aht_seconds - previous.avg_aht_seconds)
      : null,
    trend_sla: diff(current.avg_sla, previous.avg_sla),
  };
}

// === SUMMARY ===
router.get('/summary', async (req, res) => {
  try {
    const { tag, date_from, date_to } = req.query;
    if (!date_from || !date_to) return res.status(400).json({ error: 'Missing date_from and date_to' });

    const { prevFrom, prevTo } = getPreviousPeriod(date_from, date_to);

    // Probeer DB eerst
    if (await useDB()) {
      const cacheKey = `summary:${date_from}:${date_to}:${tag || 'all'}:with-trend`;
      const data = await cached(cacheKey, async () => {
        const marketTag = tag || null;
        const [current, previous] = await Promise.all([
          dashboardDB.getSummary(date_from, date_to, marketTag),
          dashboardDB.getSummary(prevFrom, prevTo, marketTag).catch(() => null),
        ]);
        const trends = calculateTrends(current.metrics, previous ? previous.metrics : null);
        return { ...current, metrics: { ...current.metrics, ...trends } };
      });
      return res.json({ success: true, data_source: 'database', data });
    }

    // Fallback: live API
    const dateFrom = new Date(date_from).toISOString();
    const dateTo = new Date(date_to).toISOString();
    const filters = { dateFrom, dateTo, tags: tag ? tag.split(',').map(t => t.trim()) : [] };

    let orders;
    try { orders = await shopifyRESTService.getOrdersViaREST(filters); }
    catch (err) { console.warn('Shopify REST failed:', err.message); orders = await shopifyService.getOrders(filters); }
    const conversations = await dixaService.getConversations(filters);
    const c1Result = c1CategoryService.calculateC1CategoryPerformance(conversations);

    const totalOrders = orders.length;
    const totalConversations = conversations.length;
    const otcRatio = totalOrders > 0 ? ((totalConversations / totalOrders) * 100).toFixed(2) : 0;

    const currentMetrics = {
      total_orders: totalOrders, total_conversations: totalConversations,
      otc_ratio: parseFloat(otcRatio),
      open_tickets: 0,
      avg_fcr: c1Result.summary.avg_fcr || 0,
      avg_aht_seconds: c1Result.summary.avg_aht_seconds || 0,
      avg_aht_formatted: c1Result.summary.avg_aht_formatted || '0:00',
      avg_ast_seconds: c1Result.summary.avg_ast_seconds || 0,
      avg_ast_formatted: c1Result.summary.avg_ast_formatted || '0.0h',
      avg_sla: c1Result.summary.avg_sla || 0,
    };

    // Try to fetch previous period for trends (don't fail if unavailable)
    let trends = { trend_contact_rate: null, trend_fcr: null, trend_aht: null, trend_sla: null };
    try {
      const prevDateFrom = new Date(prevFrom).toISOString();
      const prevDateTo = new Date(prevTo).toISOString();
      const prevFilters = { dateFrom: prevDateFrom, dateTo: prevDateTo, tags: filters.tags };
      let prevOrders;
      try { prevOrders = await shopifyRESTService.getOrdersViaREST(prevFilters); }
      catch { prevOrders = []; }
      const prevConvs = await dixaService.getConversations(prevFilters);
      const prevC1 = c1CategoryService.calculateC1CategoryPerformance(prevConvs);
      const prevTotalOrders = prevOrders.length;
      const prevTotalConvs = prevConvs.length;
      const prevOtc = prevTotalOrders > 0 ? (prevTotalConvs / prevTotalOrders) * 100 : 0;
      const prevMetrics = {
        otc_ratio: parseFloat(prevOtc.toFixed(2)),
        avg_fcr: prevC1.summary.avg_fcr || 0,
        avg_aht_seconds: prevC1.summary.avg_aht_seconds || 0,
        avg_sla: prevC1.summary.avg_sla || 0,
      };
      trends = calculateTrends(currentMetrics, prevMetrics);
    } catch (err) { console.warn('Trend calculation failed (live):', err.message); }

    res.json({
      success: true, data_source: 'live', data: {
        period: { from: dateFrom, to: dateTo }, tag: tag || 'all',
        metrics: { ...currentMetrics, ...trends },
      },
    });
  } catch (error) { res.status(500).json({ error: error.message, data_source: 'error' }); }
});

// === TREND ===
router.get('/trend', async (req, res) => {
  try {
    const { tag, date_from, date_to } = req.query;
    if (!date_from || !date_to) return res.status(400).json({ error: 'Missing date_from and date_to' });

    if (await useDB()) {
      const cacheKey = `trend:${date_from}:${date_to}:${tag || 'all'}`;
      const data = await cached(cacheKey, () => dashboardDB.getTrend(date_from, date_to, tag || null));
      return res.json({ success: true, data_source: 'database', data });
    }

    // Fallback: live API
    const dateFrom = new Date(date_from).toISOString();
    const dateTo = new Date(date_to).toISOString();
    const filters = { dateFrom, dateTo, tags: tag ? tag.split(',').map(t => t.trim()) : [] };

    let orders;
    try { orders = await shopifyRESTService.getOrdersViaREST(filters); }
    catch (err) { orders = []; }
    const conversations = await dixaService.getConversations(filters);

    const dailyTrend = {};
    orders.forEach(o => {
      const day = o.order_date.substring(0, 10);
      if (!dailyTrend[day]) dailyTrend[day] = { orders: 0, conversations: 0, otc_ratio: 0 };
      dailyTrend[day].orders += 1;
    });
    conversations.forEach(c => {
      const day = c.conversation_date.substring(0, 10);
      if (!dailyTrend[day]) dailyTrend[day] = { orders: 0, conversations: 0, otc_ratio: 0 };
      dailyTrend[day].conversations += 1;
    });
    Object.keys(dailyTrend).forEach(day => {
      const d = dailyTrend[day];
      d.otc_ratio = d.orders > 0 ? parseFloat(((d.conversations / d.orders) * 100).toFixed(2)) : 0;
    });

    const trend = Object.keys(dailyTrend).sort().map(day => ({ day, ...dailyTrend[day] }));
    res.json({ success: true, data_source: 'live', data: { period: { from: dateFrom, to: dateTo }, tag: tag || 'all', trend } });
  } catch (error) { res.status(500).json({ error: error.message, data_source: 'error' }); }
});

// === STORES (per market) ===
router.get('/stores', async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    if (!date_from || !date_to) return res.status(400).json({ error: 'Missing date_from and date_to' });

    if (await useDB()) {
      const cacheKey = `stores:${date_from}:${date_to}`;
      const data = await cached(cacheKey, () => dashboardDB.getStores(date_from, date_to));
      return res.json({ success: true, data_source: 'database', data });
    }

    // Fallback: live API (beperkt)
    res.json({ success: true, data_source: 'live', data: { period: { from: date_from, to: date_to }, markets: {} } });
  } catch (error) { res.status(500).json({ error: error.message, data_source: 'error' }); }
});

// === QUEUES ===
router.get('/queues', async (req, res) => {
  try {
    const { tag, date_from, date_to } = req.query;
    if (!date_from || !date_to) return res.status(400).json({ error: 'Missing date_from and date_to' });

    if (await useDB()) {
      const cacheKey = `queues:${date_from}:${date_to}:${tag || 'all'}`;
      const data = await cached(cacheKey, () => dashboardDB.getQueues(date_from, date_to, tag || null));
      return res.json({ success: true, data_source: 'database', data });
    }

    res.json({ success: true, data_source: 'live', data: { queues: [] } });
  } catch (error) { res.status(500).json({ error: error.message, data_source: 'error' }); }
});

// === BACKLOG (open tickets) ===
router.get('/backlog', async (req, res) => {
  try {
    const { tag } = req.query;

    if (await useDB()) {
      const marketFilter = tag ? 'AND market_tag = $1' : '';
      const params = tag ? [tag] : [];

      const result = await dbService.query(
        `SELECT dixa_conversation_id, customer_email, message_count, queue_name, market_tag, conversation_date
         FROM conversations
         WHERE status != 'closed' ${marketFilter}
         ORDER BY conversation_date DESC
         LIMIT 50`,
        params
      );

      const backlog = result.rows;
      return res.json({
        success: true, data_source: 'database',
        data: {
          total_backlog: backlog.length,
          high_priority: backlog.filter(b => b.message_count > 8).length,
          backlog: backlog.map(b => ({
            id: b.dixa_conversation_id, customer: b.customer_email,
            messages: b.message_count, queue: b.queue_name, market: b.market_tag,
            priority: b.message_count > 8 ? 'high' : 'medium',
          })),
        },
      });
    }

    // Fallback: live API
    const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateTo = new Date().toISOString();
    const conversations = await dixaService.getConversations({ dateFrom, dateTo, tags: tag ? [tag] : [] });
    const backlog = conversations.filter(c => c.status !== 'closed').slice(0, 50);
    res.json({
      success: true, data_source: 'live',
      data: {
        total_backlog: backlog.length,
        high_priority: backlog.filter(b => b.message_count > 8).length,
        backlog: backlog.map(c => ({
          id: c.dixa_conversation_id, customer: c.customer_email,
          messages: c.message_count, queue: c.queue_name,
          priority: c.message_count > 8 ? 'high' : 'medium',
        })),
      },
    });
  } catch (error) { res.status(500).json({ error: error.message, data_source: 'error' }); }
});

// === C1 CATEGORIES ===
router.get('/c1-categories', async (req, res) => {
  try {
    const cacheKey = 'c1-categories:7d';
    const result = await cached(cacheKey, async () => {
      const backlogService = require('../services/dixa-backlog.service');
      const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const dateTo = new Date().toISOString();
      const conversations = await backlogService.getConversationsFromExports(new Date(dateFrom), new Date(dateTo));
      if (!conversations || conversations.length === 0) return { data: { categories: [], summary: { total_tickets: 0, avg_fcr: 0, avg_aht_seconds: 0, avg_ast_seconds: 0 } }, period: null };
      const data = c1CategoryService.calculateC1CategoryPerformance(conversations);
      return { data, period: { from: dateFrom.split('T')[0], to: dateTo.split('T')[0] } };
    });
    res.json({ success: true, data_source: 'live', data: result.data, ...(result.period && { period: result.period }) });
  } catch (error) { res.status(500).json({ success: false, error: error.message, data_source: 'error' }); }
});

// === SLA PERFORMANCE ===
router.get('/sla-performance', async (req, res) => {
  try {
    const cacheKey = 'sla-performance:7d:with-trend';
    const result = await cached(cacheKey, async () => {
      const slaService = require('../services/sla-performance.service');
      const backlogService = require('../services/dixa-backlog.service');
      const now = Date.now();
      const currentFrom = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const currentTo = new Date(now);
      const prevFrom = new Date(now - 14 * 24 * 60 * 60 * 1000);
      const prevTo = new Date(now - 7 * 24 * 60 * 60 * 1000);

      // Fetch both periods in parallel
      const [currentConvs, prevConvs] = await Promise.all([
        backlogService.getConversationsFromExports(currentFrom, currentTo),
        backlogService.getConversationsFromExports(prevFrom, prevTo),
      ]);

      if (!currentConvs || currentConvs.length === 0) {
        return { data: { policies: [], summary: { total_conversations: 0, avg_sla_compliance: 0 } }, period: null };
      }

      const currentData = slaService.calculateSLAPerformance(currentConvs);
      const prevData = prevConvs && prevConvs.length > 0
        ? slaService.calculateSLAPerformance(prevConvs)
        : null;

      // Add trend_pct per policy: current compliance - previous compliance
      if (prevData) {
        const prevByName = {};
        prevData.policies.forEach(p => { prevByName[p.policy_name] = parseFloat(p.compliance_percentage); });

        currentData.policies = currentData.policies.map(p => {
          const prevCompliance = prevByName[p.policy_name];
          const trend_pct = prevCompliance != null
            ? parseFloat((parseFloat(p.compliance_percentage) - prevCompliance).toFixed(1))
            : null;
          return { ...p, trend_pct };
        });
      }

      return { data: currentData, period: { from: currentFrom.toISOString().split('T')[0], to: currentTo.toISOString().split('T')[0] } };
    });
    res.json({ success: true, data_source: 'live', data: result.data, ...(result.period && { period: result.period }) });
  } catch (error) { res.status(500).json({ success: false, error: error.message, data_source: 'error' }); }
});

// === ALL (combined endpoint for fast dashboard loading) ===
router.get('/all', async (req, res) => {
  try {
    const { tag, date_from, date_to } = req.query;
    if (!date_from || !date_to) return res.status(400).json({ error: 'Missing date_from and date_to' });

    const dbAvailable = await useDB();
    if (!dbAvailable) return res.status(503).json({ error: 'Database not available' });

    const tagKey = tag || 'all';
    const [summary, trend, stores, queues] = await Promise.all([
      cached(`summary:${date_from}:${date_to}:${tagKey}`, () => dashboardDB.getSummary(date_from, date_to, tag || null)),
      cached(`trend:${date_from}:${date_to}:${tagKey}`, () => dashboardDB.getTrend(date_from, date_to, tag || null)),
      cached(`stores:${date_from}:${date_to}`, () => dashboardDB.getStores(date_from, date_to)),
      cached(`queues:${date_from}:${date_to}:${tagKey}`, () => dashboardDB.getQueues(date_from, date_to, tag || null)),
    ]);

    res.json({
      success: true,
      data_source: 'database',
      data: { summary, trend, stores, queues },
    });
  } catch (error) { res.status(500).json({ error: error.message, data_source: 'error' }); }
});

module.exports = router;
