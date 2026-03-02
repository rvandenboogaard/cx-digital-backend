/**
 * FCR (First Contact Resolution) Calculator Service
 * Calculates FCR percentage from conversation data
 * 
 * FCR = Conversations resolved in first contact / Total conversations × 100
 * Proxy: Conversations with ≤2 messages = first contact resolved
 */

/**
 * Calculate FCR from conversations
 * @param {array} conversations - Array of conversation objects with message_count
 * @returns {object} FCR statistics
 */
function calculateFCR(conversations = []) {
  if (!conversations || conversations.length === 0) {
    return {
      fcr_avg: 0,
      fcr_count: 0,
      fcr_resolved_count: 0,
      total_conversations: 0,
      calculation_method: 'no_data'
    };
  }

  const totalConversations = conversations.length;
  
  // Count conversations resolved in first contact
  // Proxy: message_count ≤ 2 (usually 1 or 2 messages for resolution)
  const fcrResolvedCount = conversations.filter(conv => {
    const msgCount = conv.message_count || 0;
    return msgCount <= 2; // First contact = 1-2 messages typically
  }).length;

  const fcrPercentage = totalConversations > 0 
    ? ((fcrResolvedCount / totalConversations) * 100).toFixed(1)
    : 0;

  return {
    fcr_avg: parseFloat(fcrPercentage),
    fcr_resolved_count: fcrResolvedCount,
    total_conversations: totalConversations,
    not_fcr_count: totalConversations - fcrResolvedCount,
    calculation_method: 'from_message_count',
    note: 'FCR estimated: conversations with ≤2 messages = first contact resolved'
  };
}

/**
 * Get FCR breakdown by market
 * @param {object} conversationsByMarket - Conversations grouped by market
 * @returns {object} FCR stats per market
 */
function calculateFCRByMarket(conversationsByMarket = {}) {
  const fcrByMarket = {};
  
  Object.entries(conversationsByMarket).forEach(([market, conversations]) => {
    fcrByMarket[market] = calculateFCR(conversations);
  });

  return fcrByMarket;
}

/**
 * Estimate realistic FCR for mock data
 * For test/demo purposes
 * @returns {object} Realistic FCR estimate
 */
function estimateRealisticFCR() {
  // For mock data with 47 conversations, 5.7 avg messages
  // Estimate: ~30-40% resolve on first contact (typical e-commerce)
  // Conversations with 1-2 messages: roughly 12-14 out of 47
  
  const totalConversations = 47;
  const estimatedFcrCount = 14; // ~30% FCR
  const fcrPercentage = ((estimatedFcrCount / totalConversations) * 100).toFixed(1);

  return {
    fcr_avg: parseFloat(fcrPercentage), // ~29.8%
    fcr_resolved_count: estimatedFcrCount,
    total_conversations: totalConversations,
    not_fcr_count: totalConversations - estimatedFcrCount,
    calculation_method: 'estimated_from_message_distribution',
    note: 'Based on avg 5.7 messages per conversation'
  };
}

module.exports = {
  calculateFCR,
  calculateFCRByMarket,
  estimateRealisticFCR
};
