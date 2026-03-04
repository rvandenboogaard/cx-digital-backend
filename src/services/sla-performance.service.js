const axios = require('axios');
require('dotenv').config();

const config = {
  exportsUrl: process.env.DIXA_EXPORTS_URL || 'https://exports.dixa.io/v1',
  apiUrl: process.env.DIXA_API_URL || 'https://api.dixa.io/v1',
  apiKey: process.env.DIXA_API_KEY || process.env.DIXA_API_TOKEN,
};

/**
 * SLA Policies in Dixa (as of latest config)
 * Format: policy_name -> { response_minutes, resolution_minutes, business_hours }
 */
const SLA_POLICIES = {
  'Response SLA - Chat/Contact form': { response_minutes: 4 * 60, business_hours: true },
  'Response SLA - Email': { response_minutes: 4 * 60, business_hours: true },
  'Response SLA - Urgent': { response_minutes: 60, business_hours: true },
  'Response SLA - Reviews': { response_minutes: 2 * 24 * 60, business_hours: true },
  
  'Resolution SLA - Chat/Contact form': { resolution_minutes: 24 * 60, business_hours: true },
  'Resolution SLA - Email': { resolution_minutes: 24 * 60, business_hours: true },
  'Resolution SLA - Urgent': { resolution_minutes: 4 * 60, business_hours: true },
  'Resolution SLA - Reviews': { resolution_minutes: 3 * 24 * 60, business_hours: true },
};

/**
 * Business hours calculation (Mon-Fri 9-17 CET)
 * @param {number} startMs - Start timestamp in milliseconds
 * @param {number} endMs - End timestamp in milliseconds
 * @returns {number} Minutes in business hours
 */
function calculateBusinessHours(startMs, endMs) {
  const start = new Date(startMs);
  const end = new Date(endMs);
  
  let businessMinutes = 0;
  let current = new Date(start);
  
  while (current < end) {
    const dayOfWeek = current.getDay();
    const hour = current.getHours();
    
    // Mon-Fri (1-5), 9-17
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 9 && hour < 17) {
      businessMinutes += 1;
    }
    
    current.setMinutes(current.getMinutes() + 1);
  }
  
  return businessMinutes;
}

/**
 * Calculate SLA performance for conversations
 * @param {Array} conversations - Dixa conversations
 * @returns {Object} SLA performance metrics
 */
function calculateSLAPerformance(conversations) {
  if (!conversations || conversations.length === 0) {
    return {
      success: true,
      policies: [],
      summary: {
        total_conversations: 0,
        avg_response_sla_compliance: 0,
        avg_resolution_sla_compliance: 0,
      },
    };
  }

  const policyMetrics = {};

  // Initialize policies
  Object.keys(SLA_POLICIES).forEach(policyName => {
    policyMetrics[policyName] = {
      policy_name: policyName,
      total: 0,
      sla_met: 0,
      sla_breached: 0,
      avg_time_minutes: 0,
      total_time_minutes: 0,
    };
  });

  // Process conversations
  conversations.forEach(conv => {
    // Response SLA
    if (conv.assigned_at && conv.created_at) {
      const responseMinutes = calculateBusinessHours(conv.created_at, conv.assigned_at) / 60;
      
      // Determine which response SLA applies (simple: based on tags)
      let responsePolicy = 'Response SLA - Email'; // default
      
      if (conv.tags && conv.tags.length > 0) {
        if (conv.tags.some(t => t.toLowerCase().includes('urgent'))) {
          responsePolicy = 'Response SLA - Urgent';
        } else if (conv.tags.some(t => t.toLowerCase().includes('review'))) {
          responsePolicy = 'Response SLA - Reviews';
        } else if (conv.tags.some(t => t.toLowerCase().includes('chat') || t.toLowerCase().includes('contact'))) {
          responsePolicy = 'Response SLA - Chat/Contact form';
        }
      }
      
      const slaPolicy = SLA_POLICIES[responsePolicy];
      if (slaPolicy) {
        policyMetrics[responsePolicy].total += 1;
        policyMetrics[responsePolicy].total_time_minutes += responseMinutes;
        
        if (responseMinutes <= slaPolicy.response_minutes) {
          policyMetrics[responsePolicy].sla_met += 1;
        } else {
          policyMetrics[responsePolicy].sla_breached += 1;
        }
      }
    }

    // Resolution SLA
    if (conv.closed_at && conv.created_at && conv.status === 'closed') {
      const resolutionMinutes = calculateBusinessHours(conv.created_at, conv.closed_at) / 60;
      
      // Determine which resolution SLA applies
      let resolutionPolicy = 'Resolution SLA - Email'; // default
      
      if (conv.tags && conv.tags.length > 0) {
        if (conv.tags.some(t => t.toLowerCase().includes('urgent'))) {
          resolutionPolicy = 'Resolution SLA - Urgent';
        } else if (conv.tags.some(t => t.toLowerCase().includes('review'))) {
          resolutionPolicy = 'Resolution SLA - Reviews';
        } else if (conv.tags.some(t => t.toLowerCase().includes('chat') || t.toLowerCase().includes('contact'))) {
          resolutionPolicy = 'Resolution SLA - Chat/Contact form';
        }
      }
      
      const slaPolicy = SLA_POLICIES[resolutionPolicy];
      if (slaPolicy) {
        policyMetrics[resolutionPolicy].total += 1;
        policyMetrics[resolutionPolicy].total_time_minutes += resolutionMinutes;
        
        if (resolutionMinutes <= slaPolicy.resolution_minutes) {
          policyMetrics[resolutionPolicy].sla_met += 1;
        } else {
          policyMetrics[resolutionPolicy].sla_breached += 1;
        }
      }
    }
  });

  // Calculate percentages and averages
  const policies = Object.values(policyMetrics)
    .filter(p => p.total > 0)
    .map(p => ({
      policy_name: p.policy_name,
      total_conversations: p.total,
      sla_met: p.sla_met,
      sla_breached: p.sla_breached,
      compliance_percentage: ((p.sla_met / p.total) * 100).toFixed(1),
      breach_percentage: ((p.sla_breached / p.total) * 100).toFixed(1),
      avg_time_minutes: Math.round(p.total_time_minutes / p.total),
      avg_time_formatted: formatMinutes(Math.round(p.total_time_minutes / p.total)),
    }))
    .sort((a, b) => parseFloat(b.compliance_percentage) - parseFloat(a.compliance_percentage));

  // Summary
  const totalConvs = conversations.length;
  const avgCompliance = policies.length > 0
    ? (policies.reduce((sum, p) => sum + parseFloat(p.compliance_percentage), 0) / policies.length).toFixed(1)
    : 0;

  return {
    success: true,
    policies: policies,
    summary: {
      total_conversations: totalConvs,
      policies_tracked: policies.length,
      avg_sla_compliance: parseFloat(avgCompliance),
      data_source: 'dixa_exports_api_with_business_hours',
      note: 'Business hours: Mon-Fri 9-17 CET | Margot queues excluded',
    },
  };
}

/**
 * Format minutes to readable format
 */
function formatMinutes(minutes) {
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const mins = minutes % 60;
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

module.exports = {
  calculateSLAPerformance,
  formatMinutes,
};
