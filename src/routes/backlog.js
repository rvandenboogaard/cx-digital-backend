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

    console.log(`📊 /backlog/evolution - Calculating for ${dateFrom.toISOString().split('T')[0]} to ${dateTo.toISOString().split('T')[0]}`);

    const result = await backlogService.calculateBacklogEvolution(dateFrom, dateTo);

    res.json(result);
  } catch (error) {
    console.error('Error in /backlog/evolution:', error);
    res.status(500).json({
      success: false,
      error: error.message,
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
          current_open_tickets: 0,
          trend: 'no_data',
          message: 'No backlog data available',
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
