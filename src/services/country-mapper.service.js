/**
 * Country to Market Tag Mapper
 * Maps Shopify shipping country codes to CX Digital market tags
 */

const COUNTRY_TO_MARKET = {
  // SWB = Benelux (NL, BE)
  'NL': 'SWB',
  'BE': 'SWB',
  
  // SWA = Germany + Austria (DE, AT)
  'DE': 'SWA',
  'AT': 'SWA',
  
  // SWS = United Kingdom (GB, ENG)
  'GB': 'SWS',
  'ENG': 'SWS',
  'UK': 'SWS',
  
  // BSW = France (FR)
  'FR': 'BSW',
  
  // CSW = Spain (ES)
  'ES': 'CSW',
};

/**
 * Map country code to market tag
 * @param {string} countryCode - ISO country code (e.g., 'NL', 'DE')
 * @returns {string} Market tag (SWB, SWA, SWS, BSW, CSW)
 */
function mapCountryToMarket(countryCode) {
  if (!countryCode) {
    console.warn('⚠️ Country mapper: No country code provided, defaulting to SWB');
    return 'SWB';
  }

  const upperCode = countryCode.toUpperCase();
  const market = COUNTRY_TO_MARKET[upperCode];

  if (!market) {
    console.warn(`⚠️ Country mapper: Unknown country code "${countryCode}", defaulting to SWB`);
    return 'SWB';
  }

  return market;
}

/**
 * Map array of Shopify orders to add market tags
 * @param {Array} orders - Shopify orders
 * @returns {Array} Orders with market tags added
 */
function enrichOrdersWithMarketTags(orders) {
  return orders.map((order) => {
    const countryCode = order.shipping_address?.country_code || order.billing_address?.country_code;
    const market = mapCountryToMarket(countryCode);

    return {
      ...order,
      market_tag: market,
      tags: [market], // Ensure tags array has market tag
      source_country: countryCode,
    };
  });
}

/**
 * Get market from order
 * @param {object} order - Shopify order
 * @returns {string} Market tag
 */
function getMarketFromOrder(order) {
  const countryCode = order.shipping_address?.country_code || order.billing_address?.country_code;
  return mapCountryToMarket(countryCode);
}

module.exports = {
  mapCountryToMarket,
  enrichOrdersWithMarketTags,
  getMarketFromOrder,
  COUNTRY_TO_MARKET,
};
