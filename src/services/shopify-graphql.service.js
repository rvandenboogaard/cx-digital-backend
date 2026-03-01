const axios = require('axios');
require('dotenv').config();

const config = {
  apiKey: process.env.SHOPIFY_API_KEY,
  apiPassword: process.env.SHOPIFY_API_PASSWORD,
  shopName: process.env.SHOPIFY_SHOP_NAME,
};

if (!config.apiKey || !config.apiPassword || !config.shopName) {
  console.warn('⚠️ Shopify credentials incomplete for GraphQL');
}

async function getOrdersViaGraphQL(filters = {}) {
  const { dateFrom, dateTo, tags = [] } = filters;

  try {
    const graphqlUrl = `https://${config.shopName}/admin/api/2024-01/graphql.json`;
    
    // GraphQL query - better network support on Vercel
    const query = `
      query {
        orders(first: 250, query: "created:>=${dateFrom} created:<=${dateTo}") {
          edges {
            node {
              id
              name
              email
              createdAt
              totalPriceSet {
                shopMoney {
                  amount
                }
              }
              lineItems(first: 250) {
                totalCount
              }
              tags
            }
          }
        }
      }
    `;

    console.log(`📊 Shopify GraphQL: Fetching orders from ${dateFrom} to ${dateTo}`);

    const response = await axios.post(
      graphqlUrl,
      { query },
      {
        headers: {
          'X-Shopify-Access-Token': config.apiPassword,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    if (response.data.errors) {
      throw new Error(`GraphQL Error: ${JSON.stringify(response.data.errors)}`);
    }

    const orders = response.data.data?.orders?.edges || [];

    return orders.map((edge) => {
      const order = edge.node;
      return {
        shopify_order_id: order.id,
        order_date: order.createdAt,
        order_hour: truncateToHour(order.createdAt),
        customer_email: order.email || 'unknown',
        product_count: order.lineItems?.totalCount || 0,
        total_price: parseFloat(order.totalPriceSet?.shopMoney?.amount || 0),
        tags: extractTags(order.tags),
        source: 'shopify',
      };
    });
  } catch (error) {
    console.error(`❌ Shopify GraphQL Error: ${error.message}`);
    throw error;
  }
}

function truncateToHour(isoDate) {
  const date = new Date(isoDate);
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}

function extractTags(orderTags) {
  const tags = [];
  if (!orderTags) return ['SWB']; // Default
  
  const marketTags = ['SWB', 'SWA', 'SWS', 'BSW', 'CSW'];
  orderTags.forEach(tag => {
    if (marketTags.includes(tag)) {
      tags.push(tag);
    }
  });

  return tags.length > 0 ? tags : ['SWB'];
}

module.exports = {
  getOrdersViaGraphQL,
  truncateToHour,
};
