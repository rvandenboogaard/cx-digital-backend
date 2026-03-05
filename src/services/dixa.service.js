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
    reopened: false,
    tags: conv.tags || [],
    queue_name: conv.queue_name || null,
    exports_handling_duration: conv.handling_duration || null,
    exports_first_response_time: conv.exports_first_response_time || null,
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
