/**
 * Queue Matcher Service
 * Maps Shopify orders to Dixa queues for accurate OTC% calculation
 * 
 * Rules:
 * - MAIL + CHAT combined per store
 * - BOL separate per store
 * - Exclude: ASAP, High prio, Reviews, Manager, Invoices
 * - Include: Cancel orders
 */

const QUEUE_CONFIG = {
  // SWB = Benelux (NL, BE)
  'SWB': {
    market: 'SWB',
    countries: ['NL', 'BE'],
    stores: [
      {
        name: 'smartwatchbanden.NL',
        channels: {
          mail_chat: 'smartwatchbanden.NL (MAIL+CHAT)',
          bol: 'smartwatchbanden.NL (BOL)',
        }
      },
      {
        name: 'phone-factory.NL',
        channels: {
          mail_chat: 'phone-factory.NL (MAIL+CHAT)',
          bol: 'phone-factory.NL (BOL)',
        }
      }
    ],
    asap_queue: 'NL ASAP (EXCLUDE from OTC%)',
    cancel_queue: 'Cancel order (INCLUDE)',
  },

  // SWA = Germany + Austria (DE, AT)
  'SWA': {
    market: 'SWA',
    countries: ['DE', 'AT'],
    stores: [
      {
        name: 'smartwatcharmbaender.DE',
        channels: {
          mail_chat: 'smartwatcharmbaender.DE (MAIL+CHAT)',
          bol: 'smartwatcharmbaender.DE (BOL)',
        }
      },
      {
        name: 'huellen-shop.DE',
        channels: {
          mail_chat: 'huellen-shop.DE (MAIL+CHAT)',
          bol: 'huellen-shop.DE (BOL)',
        }
      }
    ],
    asap_queue: 'DE ASAP (EXCLUDE from OTC%)',
    cancel_queue: 'Cancel order (INCLUDE)',
  },

  // BSW = France (FR)
  'BSW': {
    market: 'BSW',
    countries: ['FR'],
    stores: [
      {
        name: 'braceletsmartwatch.FR',
        channels: {
          mail_chat: 'braceletsmartwatch.FR (MAIL+CHAT)',
          bol: 'braceletsmartwatch.FR (BOL)',
        }
      },
      {
        name: 'coque-telephone.FR',
        channels: {
          mail_chat: 'coque-telephone.FR (MAIL+CHAT)',
          bol: 'coque-telephone.FR (BOL)',
        }
      }
    ],
    asap_queue: 'FR ASAP (EXCLUDE from OTC%)',
    cancel_queue: 'Cancel order (INCLUDE)',
  },

  // CSW = Spain (ES)
  'CSW': {
    market: 'CSW',
    countries: ['ES'],
    stores: [
      {
        name: 'correasmartwatch.ES',
        channels: {
          mail_chat: 'correasmartwatch.ES (MAIL+CHAT)',
          bol: 'correasmartwatch.ES (BOL)',
        }
      }
    ],
    asap_queue: 'ES ASAP (EXCLUDE from OTC%)',
    cancel_queue: 'Cancel order (INCLUDE)',
  },

  // SWS = United Kingdom (GB, UK)
  'SWS': {
    market: 'SWS',
    countries: ['GB', 'UK'],
    stores: [
      {
        name: 'smartwatch-straps.co.UK',
        channels: {
          mail_chat: 'smartwatch-straps.co.UK (MAIL+CHAT)',
          bol: 'smartwatch-straps.co.UK (BOL)',
        }
      }
    ],
    asap_queue: 'UK ASAP (EXCLUDE from OTC%)',
    cancel_queue: 'Cancel order (INCLUDE)',
  },

  // XoXo = Special brand
  'XoXo': {
    market: 'XoXo',
    countries: ['ALL'],
    stores: [
      {
        name: 'XoXoWildhearts.com',
        channels: {
          mail_chat: 'XoXoWildhearts.com (MAIL+CHAT)',
          bol: 'XoXoWildhearts.com (BOL)',
        }
      }
    ],
    asap_queue: 'XoXo ASAP (EXCLUDE from OTC%)',
    cancel_queue: 'Cancel order (INCLUDE)',
  }
};

/**
 * Get queues for an order based on market and channel
 * @param {string} market - Market tag (SWB, SWA, SWS, BSW, CSW)
 * @param {string} channel - Channel type (mail_chat, bol)
 * @returns {object} Queue mapping with OTC classification
 */
function getQueuesForMarket(market, channel = 'mail_chat') {
  const config = QUEUE_CONFIG[market];
  
  if (!config) {
    console.warn(`⚠️ Unknown market: ${market}, defaulting to SWB`);
    return getQueuesForMarket('SWB', channel);
  }

  return {
    market,
    queues: config.stores.map(store => ({
      store: store.name,
      queue: store.channels[channel],
      channel: channel === 'mail_chat' ? 'MAIL+CHAT' : 'BOL',
      include_in_otc: true,
    })),
    asap_queue: config.asap_queue,
    cancel_queue: config.cancel_queue,
  };
}

/**
 * Get all queues for OTC calculation (INCLUDE)
 * @param {string} market - Market tag
 * @returns {array} Queues to include in OTC%
 */
function getOTCIncludedQueues(market) {
  const config = QUEUE_CONFIG[market];
  
  if (!config) {
    console.warn(`⚠️ Unknown market: ${market}, defaulting to SWB`);
    return getOTCIncludedQueues('SWB');
  }

  const queues = [];
  
  // Add MAIL+CHAT queues
  config.stores.forEach(store => {
    queues.push(store.channels.mail_chat);
  });

  // Add BOL queues separately
  config.stores.forEach(store => {
    queues.push(store.channels.bol);
  });

  // Add cancel order queue
  queues.push(config.cancel_queue);

  return queues;
}

/**
 * Get queues to EXCLUDE from OTC calculation
 * @param {string} market - Market tag
 * @returns {array} Queues to exclude from OTC%
 */
function getOTCExcludedQueues(market) {
  const config = QUEUE_CONFIG[market];
  
  if (!config) {
    console.warn(`⚠️ Unknown market: ${market}, defaulting to SWB`);
    return getOTCExcludedQueues('SWB');
  }

  return [
    config.asap_queue,
    'High prio Mails',
    'Reviews (all)',
    'Manager (Margot) Default',
    'Invoices, payments, bills',
    'Shopify Notifications',
  ];
}

/**
 * Enrich order with queue information
 * @param {object} order - Order with market_tag
 * @returns {object} Order with queue info
 */
function enrichOrderWithQueues(order) {
  if (!order.market_tag) {
    console.warn('⚠️ Order missing market_tag, defaulting to SWB');
    order.market_tag = 'SWB';
  }

  const queuesForMarket = getQueuesForMarket(order.market_tag);
  const otcIncluded = getOTCIncludedQueues(order.market_tag);

  return {
    ...order,
    queue_mapping: {
      market: order.market_tag,
      expected_queues: queuesForMarket,
      include_in_otc: otcIncluded,
      exclude_from_otc: getOTCExcludedQueues(order.market_tag),
    }
  };
}

/**
 * Map queue name back to market tag
 * @param {string} queueName - Dixa queue name
 * @returns {string|null} Market tag or null
 */
function getMarketFromQueue(queueName) {
  if (!queueName) return null;
  const lower = queueName.toLowerCase();

  for (const [market, config] of Object.entries(QUEUE_CONFIG)) {
    for (const store of config.stores) {
      const mailChat = store.channels.mail_chat?.toLowerCase();
      const bol = store.channels.bol?.toLowerCase();
      if (mailChat && lower.includes(mailChat.split(' ')[0])) return market;
      if (bol && lower.includes(bol.split(' ')[0])) return market;
    }
  }

  // Fallback: check country codes in queue name
  if (lower.includes('.nl') || lower.includes('nl ')) return 'SWB';
  if (lower.includes('.de') || lower.includes('de ')) return 'SWA';
  if (lower.includes('.fr') || lower.includes('fr ')) return 'BSW';
  if (lower.includes('.es') || lower.includes('es ')) return 'CSW';
  if (lower.includes('.uk') || lower.includes('uk ')) return 'SWS';
  if (lower.includes('xoxo') || lower.includes('wildhearts')) return 'XoXo';

  return null;
}

module.exports = {
  QUEUE_CONFIG,
  getQueuesForMarket,
  getOTCIncludedQueues,
  getOTCExcludedQueues,
  enrichOrderWithQueues,
  getMarketFromQueue,
};
