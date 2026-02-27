const express = require('express');
const router = express.Router();
const database = require('../services/database.service');

// GET /api/orders?store_id=NL&date_from=2026-02-26&date_to=2026-02-26&group_by=hour
router.get('/', async (req, res) => {
  try {
    const { store_id, date_from, date_to, group_by } = req.query;

    if (!store_id || !date_from || !date_to) {
      return res.status(400).json({
        error: 'Missing required parameters: store_id, date_from, date_to'
      });
    }

    const dateFrom = new Date(date_from).toISOString();
    const dateTo = new Date(date_to).toISOString();

    const orders = await database.getOrdersByStore(store_id, dateFrom, dateTo);

    res.json({
      success: true,
      data: {
        store_id,
        period: { from: dateFrom, to: dateTo },
        group_by: group_by || 'hour',
        orders: orders,
        summary: {
          total_orders: orders.reduce((sum, o) => sum + o.order_count, 0),
          total_products: orders.reduce((sum, o) => sum + o.total_products, 0),
          avg_products_per_order: (
            orders.reduce((sum, o) => sum + o.total_products, 0) /
            orders.reduce((sum, o) => sum + o.order_count, 0)
          ).toFixed(2)
        }
      }
    });

  } catch (error) {
    console.error('❌ Orders endpoint error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
