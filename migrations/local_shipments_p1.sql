-- Sales Channels & Local Shipments — Phase 1 (idempotent; safe to re-run).
-- NEVER run `db:push` on prod (it drops the runtime session table). Apply this file
-- with psql instead. See docs/sales-channels-plan.md §11.

-- shipments: discriminator uses the existing fulfillment_type column ("local"); add the
-- optional order link for P2 fulfillment.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS order_id varchar;

-- Local carrier markup tiers (per carrier + weight band). base_rate_sar is the optional
-- rate-card base cost used when a carrier has no live rate API.
CREATE TABLE IF NOT EXISTS local_carrier_pricing_tiers (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_code text NOT NULL,
  min_weight_kg numeric(10,3) NOT NULL DEFAULT 0,
  max_weight_kg numeric(10,3),
  base_rate_sar numeric(12,2),
  markup_type text NOT NULL DEFAULT 'percent',
  markup_value numeric(12,2) NOT NULL DEFAULT 0,
  min_charge numeric(12,2),
  client_profile text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- Sales channels (connected stores) — P2, created now so the schema is complete.
CREATE TABLE IF NOT EXISTS sales_channels (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id varchar NOT NULL,
  platform text NOT NULL,
  name text NOT NULL,
  store_url text,
  status text NOT NULL DEFAULT 'disconnected',
  credentials_encrypted text,
  webhook_secret text,
  sync_settings text,
  carrier_mode text NOT NULL DEFAULT 'manual',
  default_carrier_rule_id varchar,
  last_synced_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- Imported store orders.
CREATE TABLE IF NOT EXISTS orders (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id varchar NOT NULL,
  sales_channel_id varchar NOT NULL,
  external_order_id text NOT NULL,
  external_order_number text,
  status text NOT NULL DEFAULT 'new',
  customer text,
  ship_to text,
  items text,
  package_weight_kg numeric(10,3),
  package_dims text,
  package_pieces integer NOT NULL DEFAULT 1,
  currency text NOT NULL DEFAULT 'SAR',
  order_total numeric(12,2),
  carrier_mode text NOT NULL DEFAULT 'manual',
  assigned_carrier_code text,
  assignment_rule_id varchar,
  shipment_id varchar,
  synced_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS orders_channel_external_unique
  ON orders (sales_channel_id, external_order_id);

-- Carrier auto-assignment rules (opt-in) — P3.
CREATE TABLE IF NOT EXISTS carrier_assignment_rules (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id varchar NOT NULL,
  name text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  conditions text,
  strategy text NOT NULL DEFAULT 'specific_carrier',
  carrier_code text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
