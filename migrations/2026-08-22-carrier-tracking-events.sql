-- Verbatim carrier scan history. Additive and idempotent; safe to re-run.
-- Never apply with `drizzle-kit push` on a server: push offers to DROP the session table.

CREATE TABLE IF NOT EXISTS shipment_carrier_tracking_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id varchar NOT NULL,
  carrier_code text NOT NULL,
  event_key text NOT NULL,
  event_code text,
  description text NOT NULL,
  occurred_at timestamptz NOT NULL,
  carrier_local_time text,
  carrier_utc_offset text,
  location text,
  exception_code text,
  exception_description text,
  signed_by text,
  remarks text,
  raw text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_carrier_tracking_events_shipment
  ON shipment_carrier_tracking_events (shipment_id, occurred_at);

-- Backs the idempotent upsert: every 10-minute poll re-sends the whole scan history.
CREATE UNIQUE INDEX IF NOT EXISTS ux_carrier_tracking_events_key
  ON shipment_carrier_tracking_events (shipment_id, event_key);
