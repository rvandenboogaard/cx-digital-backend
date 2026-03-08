-- CX Digital OTC Dashboard - Database Schema
-- Vercel Postgres (Neon)

-- Orders table: dagelijks gesynchroniseerd vanuit Shopify
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  shopify_order_id BIGINT NOT NULL,
  order_date DATE NOT NULL,
  order_hour TIMESTAMP NOT NULL,
  customer_email VARCHAR(255),
  product_count INTEGER DEFAULT 0,
  total_price NUMERIC(10,2) DEFAULT 0,
  country_code VARCHAR(5),
  market_tag VARCHAR(10),
  source VARCHAR(30) DEFAULT 'shopify-rest',
  synced_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(shopify_order_id)
);

CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_market ON orders(market_tag);
CREATE INDEX IF NOT EXISTS idx_orders_date_market ON orders(order_date, market_tag);

-- Conversations table: dagelijks gesynchroniseerd vanuit Dixa Exports API
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  dixa_conversation_id VARCHAR(100) NOT NULL,
  conversation_date DATE NOT NULL,
  conversation_hour TIMESTAMP,
  customer_email VARCHAR(255),
  message_count INTEGER DEFAULT 1,
  status VARCHAR(30),
  reopened BOOLEAN DEFAULT FALSE,
  queue_name VARCHAR(255),
  tags TEXT[], -- PostgreSQL array
  assigned_at BIGINT, -- Unix ms
  created_at BIGINT, -- Unix ms
  closed_at BIGINT, -- Unix ms
  initial_channel VARCHAR(50), -- email, widgetchat, contactform, etc.
  exports_handling_duration NUMERIC, -- seconds
  exports_first_response_time NUMERIC, -- seconds
  total_duration BIGINT, -- ms
  market_tag VARCHAR(10),
  source VARCHAR(30) DEFAULT 'dixa_exports',
  synced_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(dixa_conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_date ON conversations(conversation_date);
CREATE INDEX IF NOT EXISTS idx_conv_market ON conversations(market_tag);
CREATE INDEX IF NOT EXISTS idx_conv_date_market ON conversations(conversation_date, market_tag);
CREATE INDEX IF NOT EXISTS idx_conv_queue ON conversations(queue_name);
CREATE INDEX IF NOT EXISTS idx_conv_status ON conversations(status);

-- Sync log: bijhouden welke dagen al gesynchroniseerd zijn
CREATE TABLE IF NOT EXISTS sync_log (
  id SERIAL PRIMARY KEY,
  sync_date DATE NOT NULL,
  source VARCHAR(20) NOT NULL, -- 'shopify' of 'dixa'
  records_synced INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'completed', -- 'completed', 'failed'
  error_message TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_log_unique ON sync_log(sync_date, source);
