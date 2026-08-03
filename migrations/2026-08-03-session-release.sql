-- Release migration for the 2026-08-03 deploy.
-- Fully idempotent (IF NOT EXISTS everywhere) — safe to run more than once and safe
-- regardless of which prior migrations prod already has. Additive only; NO drops.
-- Apply on prod via the app's pg + .env DATABASE_URL. NEVER db:push.
-- Generated from the known-good local dev schema (pg_dump + information_schema).

BEGIN;

-- ============================================================
-- 1. New columns on existing tables
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS sales_features_enabled boolean DEFAULT false NOT NULL;
ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS preferred_currency text DEFAULT 'SAR'::text NOT NULL;

ALTER TABLE ddp_pricing_lanes ADD COLUMN IF NOT EXISTS domestic_rate_per_kg numeric(12,2);
ALTER TABLE ddp_pricing_lanes ADD COLUMN IF NOT EXISTS air_supplier_cost_per_kg numeric(12,2);
ALTER TABLE ddp_pricing_lanes ADD COLUMN IF NOT EXISTS sea_supplier_cost_per_cbm numeric(12,2);
ALTER TABLE ddp_pricing_lanes ADD COLUMN IF NOT EXISTS domestic_supplier_cost_per_kg numeric(12,2);
ALTER TABLE ddp_pricing_lanes ADD COLUMN IF NOT EXISTS air_enabled boolean DEFAULT true NOT NULL;

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS ddp_supplier_cost_sar numeric(12,2);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS quote_discount_sar numeric(12,2);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS quote_extra_charge_sar numeric(12,2);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS is_quote boolean DEFAULT false NOT NULL;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS pickup_requested boolean DEFAULT false;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS fx_rate numeric(12,6);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS pickup_ready_time text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS pickup_close_time text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS pickup_location text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS pickup_instructions text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS pickup_confirmation_number text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS pickup_status text DEFAULT 'not_requested'::text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS pickup_error text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS sender_company text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS recipient_company text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS pickup_date text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS provider_carrier_code text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_assignment_note text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS quote_created_by_user_id varchar;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS quote_note text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS order_id varchar;

-- ============================================================
-- 2. New tables (PK/UNIQUE inline so CREATE ... IF NOT EXISTS is atomic)
-- ============================================================
CREATE TABLE IF NOT EXISTS carrier_assignment_rules (
    id varchar DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    client_account_id varchar NOT NULL,
    name text NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    conditions text,
    strategy text DEFAULT 'specific_carrier'::text NOT NULL,
    carrier_code text,
    created_at timestamp DEFAULT now() NOT NULL,
    updated_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS email_login_otps (
    id varchar DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    email text NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    consumed_at timestamp,
    created_at timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS email_login_otps_email_idx ON email_login_otps USING btree (email);

CREATE TABLE IF NOT EXISTS integration_app_logos (
    app_key varchar NOT NULL PRIMARY KEY,
    logo text NOT NULL,
    updated_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS local_carrier_pricing_tiers (
    id varchar DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    carrier_code text NOT NULL,
    min_weight_kg numeric(10,3) DEFAULT 0 NOT NULL,
    max_weight_kg numeric(10,3),
    base_rate_sar numeric(12,2),
    markup_type text DEFAULT 'percent'::text NOT NULL,
    markup_value numeric(12,2) DEFAULT 0 NOT NULL,
    min_charge numeric(12,2),
    client_profile text,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp DEFAULT now() NOT NULL,
    updated_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
    id varchar DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    client_account_id varchar NOT NULL,
    sales_channel_id varchar NOT NULL,
    external_order_id text NOT NULL,
    external_order_number text,
    status text DEFAULT 'new'::text NOT NULL,
    customer text,
    ship_to text,
    items text,
    package_weight_kg numeric(10,3),
    package_dims text,
    package_pieces integer DEFAULT 1 NOT NULL,
    currency text DEFAULT 'SAR'::text NOT NULL,
    order_total numeric(12,2),
    carrier_mode text DEFAULT 'manual'::text NOT NULL,
    assigned_carrier_code text,
    assignment_rule_id varchar,
    shipment_id varchar,
    synced_at timestamp,
    created_at timestamp DEFAULT now() NOT NULL,
    updated_at timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS orders_channel_external_unique ON orders USING btree (sales_channel_id, external_order_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id varchar DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id varchar NOT NULL,
    token_hash text NOT NULL,
    purpose text DEFAULT 'reset'::text NOT NULL,
    expires_at timestamp NOT NULL,
    consumed_at timestamp,
    created_at timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS prt_token_hash_idx ON password_reset_tokens USING btree (token_hash);

CREATE TABLE IF NOT EXISTS sales_channels (
    id varchar DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    client_account_id varchar NOT NULL,
    platform text NOT NULL,
    name text NOT NULL,
    store_url text,
    status text DEFAULT 'disconnected'::text NOT NULL,
    credentials_encrypted text,
    webhook_secret text,
    sync_settings text,
    carrier_mode text DEFAULT 'manual'::text NOT NULL,
    default_carrier_rule_id varchar,
    last_synced_at timestamp,
    created_at timestamp DEFAULT now() NOT NULL,
    updated_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS sales_feature_access_requests (
    id varchar DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    client_account_id varchar NOT NULL,
    requested_by_user_id varchar NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reason text,
    admin_notes text,
    reviewed_by_user_id varchar,
    reviewed_at timestamp,
    created_at timestamp DEFAULT now() NOT NULL,
    updated_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS virtual_carriers (
    id varchar DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    provider text NOT NULL,
    note_template text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp DEFAULT now() NOT NULL,
    updated_at timestamp DEFAULT now() NOT NULL,
    logo text
);

-- ============================================================
-- 3. Payments duplicate-row fix (Tap redirect/webhook race)
--    Collapse existing dups (keep earliest per transaction_id) then unique-index.
-- ============================================================
DELETE FROM payments p
USING (
  SELECT transaction_id,
         (array_agg(id ORDER BY created_at ASC, id ASC))[1] AS keep_id
  FROM payments
  WHERE transaction_id IS NOT NULL
  GROUP BY transaction_id
  HAVING COUNT(*) > 1
) d
WHERE p.transaction_id = d.transaction_id
  AND p.id <> d.keep_id;

COMMIT;

-- Unique index outside the txn (kept simple; table is small enough to build inline).
CREATE UNIQUE INDEX IF NOT EXISTS ux_payments_txn
  ON payments (transaction_id) WHERE transaction_id IS NOT NULL;
