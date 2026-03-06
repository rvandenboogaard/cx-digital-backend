const tagMapperService = require('./tag-mapper.service');

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

  const categoryMap = {};

  conversations.forEach(conv => {
    const mapping = tagMapperService.mapTagsToC1C2(conv.tags || []);
    const c1 = mapping.c1;

    if (!categoryMap[c1]) {
      categoryMap[c1] = {
        c1: c1,
        tickets: 0,
        fcr_count: 0,
        aht_seconds_total: 0,
        ast_seconds_total: 0,
        ast_count: 0,
        sla_met: 0,
        conversations: [],
      };
    }

    categoryMap[c1].tickets += 1;

    // FCR: closed én niet heropend
    if (conv.status === 'closed' && !conv.reopened) {
      categoryMap[c1].fcr_count += 1;
    }

    // AHT: exports_handling_duration in seconden
    if (conv.exports_handling_duration) {
      categoryMap[c1].aht_seconds_total += conv.exports_handling_duration;
    }

    // AST: tijd tussen aanmaken en assignen (Unix ms → seconden)
    if (conv.assigned_at && conv.created_at) {
      const ast = (conv.assigned_at - conv.created_at) / 1000;
      if (ast >= 0) {
        categoryMap[c1].ast_seconds_total += ast;
        categoryMap[c1].ast_count += 1;
      }
    }

    // SLA: closed binnen 24u (total_duration in ms)
    if (conv.status === 'closed' && conv.total_duration) {
      const durationSeconds = conv.total_duration / 1000;
      if (durationSeconds < 86400) {
        categoryMap[c1].sla_met += 1;
      }
    }

    categoryMap[c1].conversations.push(conv);
  });

  const categories = Object.values(categoryMap).map(cat => {
    const fcr_percentage = cat.tickets > 0 ? ((cat.fcr_count / cat.tickets) * 100).toFixed(1) : 0;
    const aht_seconds = cat.tickets > 0 ? Math.round(cat.aht_seconds_total / cat.tickets) : 0;
    const ast_seconds = cat.ast_count > 0 ? Math.round(cat.ast_seconds_total / cat.ast_count) : 0;
    const sla_percentage = cat.tickets > 0 ? ((cat.sla_met / cat.tickets) * 100).toFixed(1) : 0;

    return {
      category: cat.c1,
      tickets: cat.tickets,
      fcr: parseFloat(fcr_percentage),
      aht_seconds: aht_seconds,
      aht_formatted: formatDuration(aht_seconds),
      ast_seconds: ast_seconds,
      ast_formatted: formatHours(ast_seconds),
      sla: parseFloat(sla_percentage),
      fcr_count: cat.fcr_count,
      sla_met: cat.sla_met,
    };
  });

  categories.sort((a, b) => b.tickets - a.tickets);

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
      avg_aht_formatted: formatDuration(avgAht),
      avg_ast_seconds: avgAst,
      avg_ast_formatted: formatHours(avgAst),
      data_source: 'dixa_exports_api',
    },
  };
}

// AHT: minuten:seconden formaat
function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

// AST: uren formaat
function formatHours(seconds) {
  const hours = (seconds / 3600).toFixed(1);
  return `${hours}h`;
}

module.exports = { calculateC1CategoryPerformance, formatDuration, formatHours };
