const tagMapperService = require('./tag-mapper.service');

/**
 * Calculate C1 Category Performance metrics
 * @param {Array} conversations - Raw Dixa conversations
 * @returns {Object} C1 performance data
 */
function calculateC1CategoryPerformance(conversations) {
  if (!conversations || conversations.length === 0) {
    return {
      success: true,
      categories: [],
      summary: {
        total_tickets: 0,
        avg_fcr: 0,
        avg_aht_seconds: 0,
        avg_ast_seconds: 0,
      },
    };
  }

  // Group conversations by C1 category
  const categoryMap = {};

  conversations.forEach(conv => {
    // Map tags to C1-C2
    const mapping = tagMapperService.mapTagsToC1C2(conv.tags || []);
    const c1 = mapping.c1;

    // Initialize category if not exists
    if (!categoryMap[c1]) {
      categoryMap[c1] = {
        c1: c1,
        tickets: 0,
        fcr_count: 0,
        aht_seconds_total: 0,
        ast_seconds_total: 0,
        sla_met: 0,
        conversations: [],
      };
    }

    // Count ticket
    categoryMap[c1].tickets += 1;

    // FCR: TRUE = resolved without reopening within 48h (status=closed + no follow-up)
    if (conv.status === 'closed') {
      categoryMap[c1].fcr_count += 1;
    }

    // AHT: Average Handling Time (from exports_handling_duration in seconds)
    if (conv.exports_handling_duration) {
      categoryMap[c1].aht_seconds_total += conv.exports_handling_duration;
    }

    // AST: Average Speed to Respond (assigned_at - created_at)
    if (conv.assigned_at && conv.created_at) {
      const ast = (conv.assigned_at - conv.created_at) / 1000; // Convert to seconds
      categoryMap[c1].ast_seconds_total += Math.max(0, ast);
    }

    // SLA: For now, assume all closed conversations met SLA (will improve when Dixa SLA configured)
    if (conv.status === 'closed') {
      categoryMap[c1].sla_met += 1;
    }

    categoryMap[c1].conversations.push(conv);
  });

  // Convert to array and calculate percentages
  const categories = Object.values(categoryMap).map(cat => {
    const fcr_percentage = cat.tickets > 0 ? ((cat.fcr_count / cat.tickets) * 100).toFixed(1) : 0;
    const aht_seconds = cat.tickets > 0 ? Math.round(cat.aht_seconds_total / cat.tickets) : 0;
    const ast_seconds = cat.conversations.filter(c => c.assigned_at).length > 0 
      ? Math.round(cat.ast_seconds_total / cat.conversations.filter(c => c.assigned_at).length)
      : 0;
    const sla_percentage = cat.tickets > 0 ? ((cat.sla_met / cat.tickets) * 100).toFixed(1) : 0;

    return {
      category: cat.c1,
      tickets: cat.tickets,
      fcr: parseFloat(fcr_percentage),
      aht_seconds: aht_seconds,
      aht_formatted: formatSeconds(aht_seconds),
      ast_seconds: ast_seconds,
      ast_formatted: formatSeconds(ast_seconds),
      sla: parseFloat(sla_percentage),
      fcr_count: cat.fcr_count,
      sla_met: cat.sla_met,
    };
  });

  // Sort by tickets descending
  categories.sort((a, b) => b.tickets - a.tickets);

  // Calculate summary
  const totalTickets = conversations.length;
  const totalFcr = categories.reduce((sum, cat) => sum + cat.fcr_count, 0);
  const avgFcr = totalTickets > 0 ? ((totalFcr / totalTickets) * 100).toFixed(1) : 0;
  const totalAht = categories.reduce((sum, cat) => sum + cat.aht_seconds, 0);
  const avgAht = categories.length > 0 ? Math.round(totalAht / categories.length) : 0;
  const totalAst = categories.reduce((sum, cat) => sum + cat.ast_seconds, 0);
  const avgAst = categories.length > 0 ? Math.round(totalAst / categories.length) : 0;

  return {
    success: true,
    categories: categories,
    summary: {
      total_tickets: totalTickets,
      avg_fcr: parseFloat(avgFcr),
      avg_aht_seconds: avgAht,
      avg_aht_formatted: formatSeconds(avgAht),
      avg_ast_seconds: avgAst,
      avg_ast_formatted: formatSeconds(avgAst),
      data_source: 'dixa_exports_api',
    },
  };
}

/**
 * Format seconds to HH:MM:SS
 */
function formatSeconds(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

module.exports = {
  calculateC1CategoryPerformance,
  formatSeconds,
};
