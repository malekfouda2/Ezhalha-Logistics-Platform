-- Dangerous goods: declaration storage, per-client access, and the ops review gate.
-- Additive and idempotent; safe to re-run. Never apply with `drizzle-kit push` on a server.
--
-- Behaviour-neutral by construction: every new column defaults to "no dangerous goods", and
-- the feature is additionally gated per client account (dangerous_goods_enabled, default
-- false) and per carrier integration account (the *_DG_ENABLED setting, default off). An
-- existing shipment is untouched and no client gains the option until an admin grants it.

-- 1. The declaration on the shipment.
--    `has_dangerous_goods` is the queryable flag; the declaration itself is JSON, matching
--    the existing packages_data / items_data / trade_documents_data convention.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS has_dangerous_goods boolean NOT NULL DEFAULT false;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS dangerous_goods_status text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS dangerous_goods_regulation text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS dangerous_goods_data text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS dangerous_goods_documents_data text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS dangerous_goods_carrier_codes text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS dangerous_goods_reviewed_by_user_id varchar;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS dangerous_goods_reviewed_at timestamp;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS dangerous_goods_rejection_reason text;

-- Partial index: the ops review queue only ever asks for dangerous shipments, and they are a
-- small minority of the table.
CREATE INDEX IF NOT EXISTS idx_shipments_dangerous_goods_review
  ON shipments (dangerous_goods_status)
  WHERE has_dangerous_goods;

-- 2. Per-client access, mirroring sales_features_enabled.
ALTER TABLE client_accounts
  ADD COLUMN IF NOT EXISTS dangerous_goods_enabled boolean NOT NULL DEFAULT false;

-- 3. Access requests, mirroring sales_feature_access_requests plus the evidence documents an
--    admin has to see before approving (DG training certificate, safety data sheets).
CREATE TABLE IF NOT EXISTS dangerous_goods_access_requests (
  id                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id   varchar NOT NULL,
  requested_by_user_id varchar NOT NULL,
  status              text NOT NULL DEFAULT 'pending',
  reason              text,
  document_paths      text[],
  admin_notes         text,
  reviewed_by_user_id varchar,
  reviewed_at         timestamp,
  created_at          timestamp NOT NULL DEFAULT now(),
  updated_at          timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dg_access_requests_client
  ON dangerous_goods_access_requests (client_account_id, status);
