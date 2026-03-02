const axios = require('axios');
require('dotenv').config();

// Dixa configuration
const config = {
  exportsUrl: process.env.DIXA_EXPORTS_URL || 'https://exports.dixa.io/v1',
  apiKey: process.env.DIXA_API_KEY || process.env.DIXA_API_TOKEN,
};

if (!config.apiKey) {
  console.warn('⚠️ Dixa API key not set - backlog calculations will fail');
}

/**
 * Get conversations from Dixa Exports API for a date range
 * @param {Date} dateFrom - Start date
 * @param {Date} dateTo - End date
 * @returns {Array} Array of conversations
 */
async function getConversationsFromExports(dateFrom, dateTo) {
  try {
    const fromDateStr = dateFrom.toISOString().split('T')[0];
    const toDateStr = dateTo.toISOString().split('T')[0];

    console.log(`📊 Dixa Exports: Fetching conversations from ${fromDateStr} to ${toDateStr}`);

    const url = `${config.exportsUrl}/conversation_export`;
    
    const response = await axios.get(url, {
      params: {
        created_after: fromDateStr,
        created_before: toDateStr,
      },
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    const conversations = response.data || [];
    console.log(`✅ Got ${conversations.length} conversations from Dixa`);

    return conversations;
  } catch (error) {
    console.warn(`⚠️ Dixa Exports API Error: ${error.message}`);
    return [];
  }
}

/**
 * Calculate backlog evolution for 7 days
 * @param {Date} dateFrom - Start date (usually 7 days ago)
 * @param {Date} dateTo - End date (today)
 * @returns {Object} Backlog evolution data
 */
async function calculateBacklogEvolution(dateFrom, dateTo) {
  try {
    // Get conversations from Dixa
    const conversations = await getConversationsFromExports(dateFrom, dateTo);

    if (conversations.length === 0) {
      console.log('ℹ️ No conversations found, returning empty backlog');
      return {
        success: true,
        data: {
          backlog_evolution: [],
          weekly_summary: {
            total_new: 0,
            total_closed: 0,
            closing_rate: 0,
            avg_open: 0,
            trend: 'no_data',
          },
        },
      };
    }

    // Initialize 7-day structure
    const days = {};
    const current = new Date(dateFrom);
    while (current <= dateTo) {
      const dayStr = current.toISOString().split('T')[0];
      days[dayStr] = {
        date: dayStr,
        day_name: getDayName(current),
        new_tickets: 0,
        closed_tickets: 0,
        open_tickets: 0,
        netto_flow: 0,
        backlog_status: 'stable',
        avg_handling_seconds: 0,
      };
      current.setDate(current.getDate() + 1);
    }

    // Count new and closed tickets per day
    conversations.forEach(conv => {
      // Count new tickets
      if (conv.created_at) {
        const createdDate = new Date(conv.created_at * 1000).toISOString().split('T')[0];
        if (days[createdDate]) {
          days[createdDate].new_tickets += 1;
        }
      }

      // Count closed tickets
      if (conv.closed_at) {
        const closedDate = new Date(conv.closed_at * 1000).toISOString().split('T')[0];
        if (days[closedDate]) {
          days[closedDate].closed_tickets += 1;
        }
      }
    });

    // Calculate open tickets per day (cumulative)
    const backlogEvolution = [];
    let cumulativeOpen = 0;
    let totalHandlingSeconds = 0;
    let closedCount = 0;

    Object.keys(days)
      .sort()
      .forEach(dayStr => {
        const day = days[dayStr];

        // Update cumulative open tickets
        cumulativeOpen += day.new_tickets - day.closed_tickets;
        day.open_tickets = Math.max(0, cumulativeOpen); // Can't be negative

        // Calculate netto flow
        day.netto_flow = day.closed_tickets - day.new_tickets;

        // Set backlog status
        if (day.netto_flow > 0) {
          day.backlog_status = 'improving';
        } else if (day.netto_flow < 0) {
          day.backlog_status = 'growing';
        }

        // Calculate average handling time for conversations closed this day
        const conversationsClosedThisDay = conversations.filter(conv => {
          if (!conv.closed_at) return false;
          const closedDate = new Date(conv.closed_at * 1000).toISOString().split('T')[0];
          return closedDate === dayStr;
        });

        if (conversationsClosedThisDay.length > 0) {
          const totalHandling = conversationsClosedThisDay.reduce((sum, conv) => {
            return sum + (conv.handling_duration || 0);
          }, 0);
          day.avg_handling_seconds = Math.round(totalHandling / conversationsClosedThisDay.length);
          totalHandlingSeconds += totalHandling;
          closedCount += conversationsClosedThisDay.length;
        }

        backlogEvolution.push(day);
      });

    // Calculate weekly summary
    const totalNew = conversations.filter(c => c.created_at).length;
    const totalClosed = conversations.filter(c => c.closed_at).length;
    const closingRate = totalNew > 0 ? ((totalClosed / totalNew) * 100).toFixed(1) : 0;
    const avgOpen = backlogEvolution.length > 0
      ? (backlogEvolution.reduce((sum, d) => sum + d.open_tickets, 0) / backlogEvolution.length).toFixed(1)
      : 0;

    // Determine trend
    let trend = 'stable';
    if (backlogEvolution.length > 0) {
      const firstOpen = backlogEvolution[0].open_tickets;
      const lastOpen = backlogEvolution[backlogEvolution.length - 1].open_tickets;
      if (lastOpen > firstOpen * 1.2) {
        trend = 'growing';
      } else if (lastOpen < firstOpen * 0.8) {
        trend = 'improving';
      }
    }

    return {
      success: true,
      data: {
        period: `${dateFrom.toISOString().split('T')[0]} to ${dateTo.toISOString().split('T')[0]}`,
        backlog_evolution: backlogEvolution,
        weekly_summary: {
          total_new: totalNew,
          total_closed: totalClosed,
          closing_rate: parseFloat(closingRate),
          avg_open: parseFloat(avgOpen),
          avg_handling_seconds: closedCount > 0 ? Math.round(totalHandlingSeconds / closedCount) : 0,
          trend: trend,
          data_source: 'dixa_exports_api',
        },
      },
    };
  } catch (error) {
    console.error('❌ Error calculating backlog evolution:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get day name from date
 * @param {Date} date
 * @returns {string} Day name (Monday, Tuesday, etc.)
 */
function getDayName(date) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}

/**
 * Format seconds to HH:MM:SS
 * @param {number} seconds
 * @returns {string} Formatted time
 */
function formatSeconds(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

module.exports = {
  getConversationsFromExports,
  calculateBacklogEvolution,
  formatSeconds,
};
