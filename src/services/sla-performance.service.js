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
 * Optimized: calculates in hours, not minute-by-minute
 * @param {number} startMs - Start timestamp in milliseconds
 * @param {number} endMs - End timestamp in milliseconds
 * @returns {number} Minutes in business hours (Mon-Fri 9-17)
 */
function calculateBusinessHours(startMs, endMs) {
  const start = new Date(startMs);
  const end = new Date(endMs);
  
  let businessMinutes = 0;
  let current = new Date(start);
  
  // Move to next business hour if starting outside business hours
  if (current.getHours() < 9 || current.getHours() >= 17 || current.getDay() === 0 || current.getDay() === 6) {
    // Move to 9 AM next business day
    current.setHours(9, 0, 0, 0);
    const dayOfWeek = current.getDay();
    if (dayOfWeek === 0) {
      current.setDate(current.getDate() + 1); // Sunday -> Monday
    } else if (dayOfWeek === 6) {
      current.setDate(current.getDate() + 2); // Saturday -> Monday
    }
  }
  
  // Loop through hours (not minutes) for performance
  while (current < end) {
    const dayOfWeek = current.getDay();
    const hour = current.getHours();
    
    // Mon-Fri (1-5), 9-17
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 9 && hour < 17) {
      // Add remaining minutes in this hour
      const minutesInHour = Math.min(60, Math.ceil((end - current) / (1000 * 60)));
      businessMinutes += minutesInHour;
      current.setHours(current.getHours() + 1, 0, 0, 0);
    } else {
      // Skip to 9 AM next business day
      current.setHours(9, 0, 0, 0);
      current.setDate(current.getDate() + 1);
      const dow = current.getDay();
      if (dow === 0) current.setDate(current.getDate() + 1); // Skip Sunday
      if (dow === 6) current.setDate(current.getDate() + 2); // Skip Saturday
    }
  }
  
  return Math.max(0, businessMinutes);
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
    // Determine queue/channel for policy matching
    const queueName = conv.queue_name ? conv.queue_name.toLowerCase() : '';
    const channelType = conv.initial_channel ? conv.initial_channel.toLowerCase() : '';
    const tags = conv.tags ? conv.tags.map(t => t.toLowerCase()) : [];
    
    // Response SLA
    if (conv.assigned_at && conv.created_at) {
      const responseMinutes = calculateBusinessHours(conv.created_at, conv.assigned_at) / 60;
      
      // Determine which response SLA applies (based on queue/channel/tags)
      let responsePolicy = 'Response SLA - Email'; // default
      
      // Check queue name first (most accurate)
      if (queueName.includes('urgent')) {
        responsePolicy = 'Response SLA - Urgent';
      } else if (queueName.includes('review') || tags.some(t => t.includes('review'))) {
        responsePolicy = 'Response SLA - Reviews';
      } else if (queueName.includes('chat') || queueName.includes('contact') || channelType === 'widgetchat' || channelType === 'contactform') {
        responsePolicy = 'Response SLA - Chat/Contact form';
      } else if (channelType === 'email' || queueName.includes('email')) {
        responsePolicy = 'Response SLA - Email';
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
      
      // Determine which resolution SLA applies (based on queue/channel/tags)
      let resolutionPolicy = 'Resolution SLA - Email'; // default
      
      // Check queue name first (most accurate)
      if (queueName.includes('urgent')) {
        resolutionPolicy = 'Resolution SLA - Urgent';
      } else if (queueName.includes('review') || tags.some(t => t.includes('review'))) {
        resolutionPolicy = 'Resolution SLA - Reviews';
      } else if (queueName.includes('chat') || queueName.includes('contact') || channelType === 'widgetchat' || channelType === 'contactform') {
        resolutionPolicy = 'Resolution SLA - Chat/Contact form';
      } else if (channelType === 'email' || queueName.includes('email')) {
        resolutionPolicy = 'Resolution SLA - Email';
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
