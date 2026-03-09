/**
 * Tag Mapper Service
 * Maps Dixa tags/labels to C1-C2 categorization
 * C1 = Category (Delivery, Returns, Product, Payment, Account)
 * C2 = Specific issue (Where is my order?, How to return?, Size fit?, etc.)
 */

// Tag mapping configuration
const TAG_MAPPING = {
  // DELIVERY & SHIPPING (C1: Delivery)
  'shipping': { c1: 'Delivery', c2: 'Shipping issue' },
  'delivery': { c1: 'Delivery', c2: 'Delivery delay' },
  'where is my order': { c1: 'Delivery', c2: 'Where is my order?' },
  'track': { c1: 'Delivery', c2: 'Order tracking' },
  'delayed': { c1: 'Delivery', c2: 'Delayed delivery' },
  'lost': { c1: 'Delivery', c2: 'Package lost' },
  
  // RETURNS (C1: Returns)
  'returns': { c1: 'Returns', c2: 'How to return?' },
  'return': { c1: 'Returns', c2: 'How to return?' },
  'rma': { c1: 'Returns', c2: 'Return authorization' },
  'exchange': { c1: 'Returns', c2: 'Product exchange' },
  'refund': { c1: 'Returns', c2: 'Refund status' },
  'return label': { c1: 'Returns', c2: 'Return label request' },
  
  // PRODUCT ISSUES (C1: Product)
  'defective': { c1: 'Product', c2: 'Defective product' },
  'damaged': { c1: 'Product', c2: 'Damaged product' },
  'quality': { c1: 'Product', c2: 'Quality issue' },
  'wrong item': { c1: 'Product', c2: 'Wrong item received' },
  'size': { c1: 'Product', c2: 'Size/fit question' },
  'fit': { c1: 'Product', c2: 'Size/fit question' },
  'compatibility': { c1: 'Product', c2: 'Product compatibility' },
  'feature': { c1: 'Product', c2: 'Feature question' },
  
  // PAYMENT (C1: Payment)
  'payment': { c1: 'Payment', c2: 'Payment failed' },
  'billing': { c1: 'Payment', c2: 'Billing issue' },
  'invoice': { c1: 'Payment', c2: 'Invoice request' },
  'charge': { c1: 'Payment', c2: 'Unexpected charge' },
  'card': { c1: 'Payment', c2: 'Card declined' },
  'subscription': { c1: 'Payment', c2: 'Subscription issue' },
  
  // ACCOUNT (C1: Account)
  'login': { c1: 'Account', c2: 'Login issues' },
  'password': { c1: 'Account', c2: 'Password reset' },
  'account': { c1: 'Account', c2: 'Account issue' },
  'profile': { c1: 'Account', c2: 'Profile update' },
  'registration': { c1: 'Account', c2: 'Registration issue' },
  
  // PROMO & DISCOUNTS (C1: Discount)
  'coupon': { c1: 'Discount', c2: 'Coupon code' },
  'discount': { c1: 'Discount', c2: 'Discount not applied' },
  'promo': { c1: 'Discount', c2: 'Promo code issue' },
  'loyalty': { c1: 'Discount', c2: 'Loyalty points' },
  
  // GENERAL
  'review': { c1: 'Other', c2: 'Product review' },
  'feedback': { c1: 'Other', c2: 'Customer feedback' },
  'other': { c1: 'Other', c2: 'Other' },
};

// Pre-build lookup structures for O(1) direct matches and faster partial matching
const TAG_MAP_DIRECT = new Map(Object.entries(TAG_MAPPING).map(([k, v]) => [k, v]));
const TAG_MAP_KEYS = Object.keys(TAG_MAPPING); // sorted by insertion order = priority

/**
 * Map Dixa tags to C1-C2 categories
 * @param {array} dixaTags - Array of tags from Dixa labels
 * @returns {object} { c1: category, c2: subcategory, tags: originalTags }
 */
function mapTagsToC1C2(dixaTags = []) {
  if (!dixaTags || dixaTags.length === 0) {
    return {
      c1: 'Unknown',
      c2: 'Untagged conversation',
      tags: [],
      confidence: 0
    };
  }

  // Find first matching tag (priority order)
  for (const tag of dixaTags) {
    const lowerTag = tag.toLowerCase().trim();

    // O(1) direct match via Map
    const direct = TAG_MAP_DIRECT.get(lowerTag);
    if (direct) {
      return {
        c1: direct.c1,
        c2: direct.c2,
        tags: dixaTags,
        confidence: 100,
        matched_tag: tag
      };
    }

    // Partial match (contains) — single loop over keys
    for (const mapKey of TAG_MAP_KEYS) {
      if (lowerTag.includes(mapKey) || mapKey.includes(lowerTag)) {
        const mapValue = TAG_MAP_DIRECT.get(mapKey);
        return {
          c1: mapValue.c1,
          c2: mapValue.c2,
          tags: dixaTags,
          confidence: 80,
          matched_tag: tag
        };
      }
    }
  }

  // No match found
  return {
    c1: 'Other',
    c2: `${dixaTags.join(', ')}`,
    tags: dixaTags,
    confidence: 0
  };
}

/**
 * Get C1-C2 statistics from conversations
 * @param {array} conversations - Array of conversation objects with tags
 * @returns {object} C1-C2 breakdown
 */
function getC1C2Stats(conversations = []) {
  const stats = {
    by_c1: {},
    by_c2: {},
    total: conversations.length,
    tagged: 0,
    untagged: 0
  };

  conversations.forEach(conv => {
    const tags = conv.tags || [];
    const categorized = mapTagsToC1C2(tags);

    // Count by C1
    if (!stats.by_c1[categorized.c1]) {
      stats.by_c1[categorized.c1] = { count: 0, percentage: 0 };
    }
    stats.by_c1[categorized.c1].count++;

    // Count by C2
    if (!stats.by_c2[categorized.c2]) {
      stats.by_c2[categorized.c2] = { count: 0, percentage: 0, c1: categorized.c1 };
    }
    stats.by_c2[categorized.c2].count++;

    // Count tagged vs untagged
    if (categorized.confidence > 0) {
      stats.tagged++;
    } else {
      stats.untagged++;
    }
  });

  // Calculate percentages
  Object.keys(stats.by_c1).forEach(c1 => {
    stats.by_c1[c1].percentage = ((stats.by_c1[c1].count / stats.total) * 100).toFixed(1);
  });

  Object.keys(stats.by_c2).forEach(c2 => {
    stats.by_c2[c2].percentage = ((stats.by_c2[c2].count / stats.total) * 100).toFixed(1);
  });

  return stats;
}

module.exports = {
  mapTagsToC1C2,
  getC1C2Stats,
  TAG_MAPPING
};
