
async function upsertOrder(order) {
  const {
    shopify_order_id, store_id, order_date, order_hour,
    product_count, source
  } = order;

  try {
    const query = `
      INSERT INTO orders (
        shopify_order_id, store_id, order_date, order_hour,
        product_count, source, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (shopify_order_id, store_id)
      DO UPDATE SET
        order_date = $3,
        product_count = $5,
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await pool.query(query, [
      shopify_order_id, store_id, order_date, order_hour,
      product_count, source
    ]);

    return result.rows[0];
  } catch (error) {
    console.error('❌ DB Error (upsertOrder):', error.message);
    throw error;
  }
}

async function getOrdersByStore(store_id, dateFrom, dateTo) {
  try {
    const query = `
      SELECT 
        store_id,
        DATE_TRUNC('hour', order_date) as order_hour,
        COUNT(*) as order_count,
        SUM(product_count) as total_products,
        AVG(product_count) as avg_products_per_order
      FROM orders
      WHERE store_id = $1
        AND order_date >= $2
        AND order_date <= $3
      GROUP BY store_id, DATE_TRUNC('hour', order_date)
      ORDER BY order_hour DESC;
    `;

    const result = await pool.query(query, [store_id, dateFrom, dateTo]);
    return result.rows;
  } catch (error) {
    console.error('❌ DB Error (getOrdersByStore):', error.message);
    throw error;
  }
}

module.exports = {
  testConnection,
  upsertOrder,
  getOrdersByStore,
  getDashboardSummary,
  pool
};
