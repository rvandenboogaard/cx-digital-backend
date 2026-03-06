const MARKET_MAP = {
  'smartwatchbanden.nl':    { tag: 'SWB', country: 'NL' },
  'smartwatcharmbaender.de':{ tag: 'SWA', country: 'DE' },
  'braceletsmartwatch.fr':  { tag: 'BSW', country: 'FR' },
  'coque-telephone.fr':     { tag: 'BSW', country: 'FR' },
  'huellen-shop.de':        { tag: 'SWA', country: 'DE' },
  'correasmartwatch.es':    { tag: 'CSW', country: 'ES' },
  'smartwatch-straps.co.uk':{ tag: 'SWS', country: 'GB' },
  'phone-factory.nl':       { tag: 'SWB', country: 'NL' },
  'xoxowildhearts.com':     { tag: 'SWB', country: 'NL' },
};

const markets = {};
Object.entries(MARKET_MAP).forEach(([domain, config]) => {
  const marketOrders = orders.filter(o => o.market_tag === config.tag);
  const marketConversations = conversations.filter(c =>
    c.tags && c.tags.some(t => t.toLowerCase().includes(config.tag.toLowerCase()))
  );
  markets[domain] = {
    orders: marketOrders.length,
    conversations: marketConversations.length,
    otc_ratio: marketOrders.length > 0
      ? ((marketConversations.length / marketOrders.length) * 100).toFixed(2)
      : 0,
    country: config.country,
  };
});
