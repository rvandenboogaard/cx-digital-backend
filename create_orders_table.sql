-- Create orders table for Shopify order tracking
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id VARCHAR(50) NOT NULL,
  store_id VARCHAR(10) NOT NULL,
  order_date TIMESTAMP NOT NULL,
  order_hour TIMESTAMP NOT NULL,
  product_count INTEGER NOT NULL,
  source VARCHAR(20) DEFAULT 'shopify',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(shopify_order_id, store_id),
  INDEX idx_store_date (store_id, order_date),
  INDEX idx_order_hour (order_hour)
);

-- Create index for hourly aggregation
CREATE INDEX IF NOT EXISTS idx_orders_hour_store 
ON orders(order_hour, store_id);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON orders TO authenticated;
