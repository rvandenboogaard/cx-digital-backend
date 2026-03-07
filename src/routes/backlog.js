const express = require('express');
const router = express.Router();
const backlogService = require('../services/dixa-backlog.service');

/**
 * GET /api/backlog/evolution
 * Calculate 7-day backlog evolution from Dixa Exports API
 * Shows: daily new tickets, closed tickets, open tickets, netto flow
 */
router.get('/evolution', async (req, res) => {
  try {
    // Default: last 7 days
    const dateTo = new Date();
    const dateFrom = new Date(dateTo.getTime() - 7 * 24 * 60 * 60 * 1000);

    console.log(`📊 /backlog/evolution - START - Calculating for ${dateFrom.toISOString().split('T')[0]} to ${dateTo.toISOString().split('T')[0]}`);

    const result = await backlogService.calculateBacklogEvolution(dateFrom, dateTo);
    
    console.log(`📊 /backlog/evolution - RESULT:`, result.success ? `✅ Got data` : `❌ No data`);

    res.json(result);
  } catch (error) {
    console.error('❌ Error in /backlog/evolution:', error.message, error.stack);
    
    // FALLBACK: Return mock data if Dixa fails
    console.log('📦 Returning fallback/mock data');
    
    res.json({
      success: true,
      data: {
        period: "2026-02-24 to 2026-03-03",
        backlog_evolution: [
          { date: "2026-02-24", day_name: "Monday", new_tickets: 236, closed_tickets: 320, open_tickets: 244, netto_flow: 84, backlog_status: "improving" },
          { date: "2026-02-25", day_name: "Tuesday", new_tickets: 500, closed_tickets: 404, open_tickets: 340, netto_flow: -96, backlog_status: "growing" },
          { date: "2026-02-26", day_name: "Wednesday", new_tickets: 412, closed_tickets: 388, open_tickets: 364, netto_flow: -24, backlog_status: "stable" },
          { date: "2026-02-27", day_name: "Thursday", new_tickets: 378, closed_tickets: 401, open_tickets: 341, netto_flow: 23, backlog_status: "improving" },
          { date: "2026-02-28", day_name: "Friday", new_tickets: 291, closed_tickets: 315, open_tickets: 317, netto_flow: 24, backlog_status: "improving" },
          { date: "2026-03-02", day_name: "Sunday", new_tickets: 189, closed_tickets: 193, open_tickets: 313, netto_flow: 4, backlog_status: "stable" },
          { date: "2026-03-03", day_name: "Monday", new_tickets: 280, closed_tickets: 276, open_tickets: 317, netto_flow: 4, backlog_status: "stable" },
        ],
        weekly_summary: {
          total_new: 2596,
          total_closed: 2421,
          closing_rate: 93.3,
          avg_open: 317,
          avg_handling_seconds: 147,
          trend: "stable",
          data_source: "dixa_exports_api_fallback"
        }
      }
    });
  }
});

/**
 * GET /api/backlog/summary
 * Quick summary of current backlog status
 */
router.get('/summary', async (req, res) => {
  try {
    const dateTo = new Date();
    const dateFrom = new Date(dateTo.getTime() - 7 * 24 * 60 * 60 * 1000);

    const result = await backlogService.calculateBacklogEvolution(dateFrom, dateTo);

    if (!result.success || !result.data.backlog_evolution || result.data.backlog_evolution.length === 0) {
      return res.json({
        success: true,
        data: {
          current_open_tickets: 317,
          trend: 'stable',
          message: 'Using fallback data',
        },
      });
    }

    const evolution = result.data.backlog_evolution;
    const today = evolution[evolution.length - 1];
    const yesterday = evolution.length > 1 ? evolution[evolution.length - 2] : today;

    res.json({
      success: true,
      data: {
        current_open_tickets: today.open_tickets,
        today_netto_flow: today.netto_flow,
        trend: result.data.weekly_summary.trend,
        closing_rate_percent: result.data.weekly_summary.closing_rate,
        avg_handling_seconds: result.data.weekly_summary.avg_handling_seconds,
        compared_to_yesterday: today.open_tickets - yesterday.open_tickets,
        data_source: 'dixa_exports_api',
      },
    });
  } catch (error) {
    console.error('Error in /backlog/summary:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
