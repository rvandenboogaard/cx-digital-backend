const axios = require('axios');
require('dotenv').config();

const config = {
  apiUrl: process.env.DIXA_API_URL || 'https://exports.dixa.io/v1',
  apiKey: process.env.DIXA_API_KEY || process.env.DIXA_API_TOKEN,
};

if (!config.apiKey) {
  console.warn('WARNING: Dixa API credentials missing - DIXA_API_KEY or DIXA_API_TOKEN not set');
}

async function getConversations(filters = {}) {
  const { dateFrom, dateTo } = filters;

  if (!config.apiKey) {
    throw new Error('Dixa API key not configured. Cannot fetch live data.');
  }

  console.log(`Dixa: Fetching conversations from ${dateFrom} to ${dateTo}`);

  // Use Exports API for full conversation data including AHT and SLA fields
  const url = `${config.apiUrl}/conversation_export`;

  const params = {
  created_after: new Date(dateFrom).getTime(),
  created_before: new Date(dateTo).getTime(),
};

  const response = await axios.get(url, {
    params,
    headers: {
      'Authorization': `bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });

  const conversations = response.data.data || response.data.conversations || [];

  console.log(`Dixa: Retrieved ${conversations.length} conversations`);

  return conversations.map((conv) => ({
    dixa_conversation_id: conv.id,
    conversation_date: conv.created_at || conv.started_at,
    conversation_hour: truncateToHour(conv.created_at || conv.started_at),
    customer_email: conv.contact?.email || conv.requester_email || 'unknown',
    message_count: conv.message_count || 0,
    status: conv.state || conv.status || 'unknown',
    reopened: conv.reopened || false,
    tags: conv.labels
      ? conv.labels.map(l => (typeof l === 'string' ? l : l.name))
      : (conv.tags || []),
    // AHT field from Exports API
    exports_handling_duration: conv.handling_time_seconds || conv.exports_handling_duration || null,
    // SLA field from Exports API
    exports_first_response_time: conv.first_response_time_seconds || conv.exports_first_response_time || null,
    source: 'dixa_live',
  }));
}

function truncateToHour(isoDate) {
  const date = new Date(isoDate);
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}

module.exports = {
  getConversations,
  truncateToHour,
};
