const axios = require('axios');
require('dotenv').config();

const config = {
  apiUrl: 'https://exports.dixa.io/v1',
  apiKey: process.env.DIXA_API_KEY || process.env.DIXA_API_TOKEN,
};

if (!config.apiKey) {
  console.warn('WARNING: Dixa API credentials missing');
}

async function getConversations(filters = {}) {
  const { dateFrom, dateTo } = filters;

  if (!config.apiKey) throw new Error('Dixa API key not configured.');

  const createdAfter = dateFrom.split('T')[0];
  const createdBefore = dateTo.split('T')[0];

  console.log(`Dixa: Fetching conversations from ${createdAfter} to ${createdBefore}`);

  const response = await axios.get(
    `${config.apiUrl}/conversation_export`,
    {
      params: { created_after: createdAfter, created_before: createdBefore },
      headers: {
        'Authorization': `bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  const conversations = response.data || [];
  console.log(`Dixa: Retrieved ${conversations.length} conversations`);

  return conversations.map((conv) => ({
    dixa_conversation_id: conv.id,
    conversation_date: new Date(conv.created_at).toISOString(),
    conversation_hour: truncateToHour(new Date(conv.created_at).toISOString()),
    customer_email: conv.requester_email || 'unknown',
    message_count: 1,
    status: conv.status || 'unknown',
    reopened: conv.status === 'open' && conv.closed_at !== null, // heropend als ooit gesloten maar nu open
    tags: conv.tags || [],
    queue_name: conv.queue_name || null,
    assigned_at: conv.assigned_at || null,           // Unix ms — voor AST berekening
    created_at: conv.created_at || null,             // Unix ms — voor AST berekening
    exports_handling_duration: conv.exports_handling_duration || null,  // fix: was handling_duration
    exports_first_response_time: conv.exports_first_response_time || null,
    total_duration: conv.total_duration || null,
    source: 'dixa_exports',
  }));
}

function truncateToHour(isoDate) {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}

module.exports = { getConversations, truncateToHour };
