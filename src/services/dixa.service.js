const axios = require('axios');
require('dotenv').config();

const config = {
  apiUrl: 'https://exports.dixa.io/v1',
  apiKey: process.env.DIXA_API_KEY || process.env.DIXA_API_TOKEN,
};

if (!config.apiKey) { console.warn('WARNING: Dixa API credentials missing'); }

// Queues uitsluiten die niet order-gerelateerd zijn
// 'review' verwijderd: review tickets tellen nu mee in OTC%
const EXCLUDED_QUEUE_PATTERNS = ['margot', 'etrusted', 'invoice', 'payment', 'bill', 'spam', 'trustpilot'];

// Review queue herkenning voor tagging
const REVIEW_QUEUE_PATTERNS = ['review'];
function isExcludedQueue(queueName) {
  if (!queueName) return true; // geen queue = uitsluiten
  const lower = queueName.toLowerCase();
  return EXCLUDED_QUEUE_PATTERNS.some(p => lower.includes(p));
}

function isReviewQueue(queueName) {
  if (!queueName) return false;
  const lower = queueName.toLowerCase();
  return REVIEW_QUEUE_PATTERNS.some(p => lower.includes(p));
}

/**
 * Transformeer Dixa custom_fields array naar flat object voor channel-match.
 * Dixa levert: [{identifier, value, data_type, ...}, ...]
 * Spec wil:    { identifier: value, ... }
 * Returnt null als er geen custom_fields zijn (houdt payload klein).
 */
function flattenCustomFields(customFields) {
  if (!Array.isArray(customFields) || customFields.length === 0) return null;
  const out = {};
  for (const cf of customFields) {
    if (cf && cf.identifier && cf.value != null && !cf.archived) {
      out[cf.identifier] = cf.value;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

async function getConversations(filters = {}) {
  const { dateFrom, dateTo } = filters;
  if (!config.apiKey) throw new Error('Dixa API key not configured.');

  const createdAfter = dateFrom.split('T')[0];
  // created_before moet de dag NA de gewenste dag zijn (exclusive)
  const nextDay = new Date(dateTo);
  nextDay.setDate(nextDay.getDate() + 1);
  const createdBefore = nextDay.toISOString().substring(0, 10);
  console.log(`Dixa: Fetching conversations from ${createdAfter} to ${createdBefore}`);

  const response = await axios.get(
    `${config.apiUrl}/conversation_export`,
    {
      params: { created_after: createdAfter, created_before: createdBefore },
      headers: { 'Authorization': `bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    }
  );

  const conversations = response.data || [];
  console.log(`Dixa: Retrieved ${conversations.length} conversations`);

  const mapped = conversations.map((conv) => ({
    // === BESTAANDE VELDEN (ongewijzigd) ===
    dixa_conversation_id: conv.id,
    conversation_date: new Date(conv.created_at).toISOString(),
    conversation_hour: truncateToHour(new Date(conv.created_at).toISOString()),
    customer_email: conv.requester_email || 'unknown',
    message_count: conv.message_count || conv.messages_count || 1,
    status: conv.status || 'unknown',
    initial_channel: conv.initial_channel || null,
    reopened: conv.status === 'open' && conv.closed_at !== null,
    tags: conv.tags || [],
    queue_name: conv.queue_name || null,
    assigned_at: conv.assigned_at || null,
    created_at: conv.created_at || null,
    exports_handling_duration: conv.exports_handling_duration || null,
    exports_first_response_time: conv.exports_first_response_time || null,
    total_duration: conv.total_duration || null,
    source: 'dixa_exports',
    is_review: isReviewQueue(conv.queue_name),
    ticket_type: isReviewQueue(conv.queue_name) ? 'review' : 'support',

    // === NIEUWE VELDEN — Fase 1 (Spec v1) ===
    // Doel: match-engine kan masked Bol/Amazon emails + ordernummers in subject/custom_fields scannen
    subject: conv.subject || null,                          // Klanten zetten regelmatig #12345 in onderwerp
    requester_email: conv.requester_email || null,          // Fallback wanneer customer_email masked is
    custom_attributes: flattenCustomFields(conv.custom_fields), // Agents tikken hier track&trace, client_address, etc.
    assignee_id: conv.assignee_id || null,                  // Agent-prestaties per kanaal
    assignee_name: conv.assignee_name || null,              // Idem (frontend maskeert voor viewer-rol)
    closed_at: conv.closed_at || null,                      // Accurate cycle-time
    direction: conv.direction || null,                      // inbound/outbound — outbound uitsluiten van OTC-noemer
    csat_score: conv.rating_score || null,                  // Dixa: rating_score (1-5)
    csat_comment: conv.rating_message || null,              // Dixa: rating_message
  }));

  const filtered = mapped.filter(c => !isExcludedQueue(c.queue_name));
  console.log(`Dixa: ${filtered.length} na filter (${mapped.length - filtered.length} uitgesloten)`);

  return filtered;
}

function truncateToHour(isoDate) {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}

module.exports = { getConversations, isExcludedQueue, isReviewQueue, truncateToHour, flattenCustomFields };
