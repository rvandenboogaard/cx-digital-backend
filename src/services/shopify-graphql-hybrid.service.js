const axios = require('axios');
require('dotenv').config();

const config = {
  accessToken: process.env.SHOPIFY_API_PASSWORD, // Treat as access token
  shopName: process.env.SHOPIFY_SHOP_NAME,
};

async function getOrdersViaGraphQLHybrid(filters = {}) {
  const { dateFrom, dateTo } = filters;

  try {
    const graphqlUrl = `https://${config.shopName}/admin/api/2024-01/graphql.json`;
    
    // Clean date strings for GraphQL query
    const dateFromStr = dateFrom.split('T')[0];
    const dateToStr = dateTo.split('T')[0];
    
    const query = `{
      orders(first: 250, query: "created:>=${dateFromStr} created:<=${dateToStr}") {
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
    }`;

    console.log(`🔄 Shopify GraphQL Hybrid: Fetching orders`);

    const response = await axios.post(
      graphqlUrl,
      { query },
      {
        headers: {
          'X-Shopify-Access-Token': config.accessToken,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    if (response.data.errors) {
      console.error('GraphQL Errors:', response.data.errors);
      throw new Error(`GraphQL: ${response.data.errors[0]?.message}`);
    }

    const orders = response.data.data?.orders?.edges || [];
    console.log(`✅ Got ${orders.length} orders from GraphQL`);

    return orders.map((edge) => {
      const order = edge.node;
      return {
        shopify_order_id: order.id,
        order_date: order.createdAt,
        order_hour: truncateToHour(order.createdAt),
        customer_email: order.email || 'unknown',
        product_count: order.lineItems?.totalCount || 0,
        total_price: parseFloat(order.totalPriceSet?.shopMoney?.amount || 0),
        tags: ['SWB'], // Default tag
        source: 'shopify-graphql',
      };
    });
  } catch (error) {
    console.error(`❌ GraphQL Hybrid Error: ${error.message}`);
    throw error;
  }
}

function truncateToHour(isoDate) {
  const date = new Date(isoDate);
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}

module.exports = {
  getOrdersViaGraphQLHybrid,
};
