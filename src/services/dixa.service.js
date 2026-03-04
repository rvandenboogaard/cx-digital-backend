const axios = require('axios');
require('dotenv').config();

const config = {
  apiUrl: 'https://dev.dixa.io/v1',
  apiKey: process.env.DIXA_API_KEY || process.env.DIXA_API_TOKEN,
};

if (!config.apiKey) {
  console.warn('WARNING: Dixa API credentials missing');
}

async function getConversations(filters = {}) {
  const { dateFrom, dateTo } = filters;

  if (!config.apiKey) {
    throw new Error('Dixa API key not configured.');
  }

  console.log(`Dixa: Fetching conversations from ${dateFrom} to ${dateTo}`);

  const response = await axios.post(
    `${config.apiUrl}/search/conversations`,
    {
      filter: {
        createdAfter: new Date(dateFrom).toISOString(),
        createdBefore: new Date(dateTo).toISOString(),
      }
    },
    {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );

  const conversations = response.data.data || [];
  console.log(`Dixa: Retrieved ${conversations.length} conversations`);

  return conversations.map((conv) => ({
    dixa_conversation_id: conv.id,
    conversation_date: conv.createdAt,
    conversation_hour: truncateToHour(conv.createdAt),
    customer_email: conv.requesterEmail || 'unknown',
    message_count: conv.messageCount || 0,
    status: conv.status || 'unknown',
    reopened: conv.reopened || false,
    tags: conv.tags || [],
    exports_handling_duration: conv.handlingTime || null,
    exports_first_response_time: conv.firstResponseTime || null,
    source: 'dixa_live',
  }));
}

function truncateToHour(isoDate) {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}

module.exports = { getConversations, truncateToHour };
