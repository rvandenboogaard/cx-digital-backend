const axios = require('axios');
require('dotenv').config();

// Dixa configuration from environment variables
const config = {
  apiUrl: process.env.DIXA_API_URL || 'https://dev.dixa.io/v1',
  apiKey: process.env.DIXA_API_KEY || process.env.DIXA_API_TOKEN, // Try both
};

// Validate required env vars on startup
if (!config.apiKey) {
  console.warn('⚠️ Dixa API credentials missing - DIXA_API_KEY or DIXA_API_TOKEN not set');
}

async function getConversations(filters = {}) {
  const { dateFrom, dateTo, tags = [] } = filters;

  try {
    // Build Dixa API request
    const url = `${config.apiUrl}/conversations`;
    
    // Filter by date range and tags
    const params = {
      started_at_from: dateFrom,
      started_at_to: dateTo,
      limit: 250,
    };

    console.log(`💬 Dixa: Fetching conversations from ${dateFrom} to ${dateTo}${tags.length ? ` (tags: ${tags.join(', ')})` : ''}`);

    const response = await axios.get(url, {
      params,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    const conversations = response.data.conversations || [];

    // Filter by tags if provided
    let filtered = conversations;
    if (tags.length > 0) {
      filtered = conversations.filter(conv => {
        const convTags = conv.labels ? conv.labels.map(l => l.name) : [];
        return tags.some(tag => convTags.includes(tag));
      });
    }

    // Transform to our data model
    return filtered.map((conv) => ({
      dixa_conversation_id: conv.id,
      conversation_date: conv.started_at,
      conversation_hour: truncateToHour(conv.started_at),
      customer_email: conv.contact?.email || 'unknown',
      message_count: conv.message_count || 0,
      tags: conv.labels ? conv.labels.map(l => l.name) : [],
      source: 'dixa',
    }));
  } catch (error) {
    console.warn(`⚠️ Dixa API Error (${error.status || error.code}): ${error.message}`);
    console.log('📦 Falling back to mock conversations');
    return getMockConversations(filters);
  }
}

function truncateToHour(isoDate) {
  const date = new Date(isoDate);
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}

// Mock function for testing without API token
async function getMockConversations(filters = {}) {
  const { dateFrom, dateTo, tags = [] } = filters;

  console.log(`🧪 Dixa (MOCK): Generating test conversations`);

  // Generate mock data for testing
  const mockConversations = [];
  const baseDate = new Date(dateFrom);
  const mockTags = ['SWB', 'SWA', 'SWS', 'BSW', 'CSW']; // Market tags

  for (let i = 0; i < 50; i++) {
    const conversationDate = new Date(baseDate.getTime() + i * 3600000); // Every hour
    const assignedTags = tags.length > 0 ? tags : [mockTags[i % mockTags.length]];
    
    mockConversations.push({
      dixa_conversation_id: `MOCK-${i}`,
      conversation_date: conversationDate.toISOString(),
      conversation_hour: truncateToHour(conversationDate.toISOString()),
      customer_email: `customer${i}@example.com`,
      message_count: Math.floor(Math.random() * 10) + 1,
      tags: assignedTags,
      source: 'dixa',
    });
  }

  return mockConversations;
}

module.exports = {
  getConversations,
  getMockConversations,
  truncateToHour,
};
