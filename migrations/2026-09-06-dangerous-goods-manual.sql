-- Dangerous goods, manual ops-quoted flow.
--
-- Additive and idempotent; safe to re-run. Never apply with `drizzle-kit push` on a server.
--
-- Behaviour-neutral by construction. Every column below is nullable with no default, so an
-- existing row reads exactly as it did before. The flow is entered only by shipments created
-- with fulfillment_type = 'dg_manual', which nothing in the old code path ever writes.
--
-- Why these columns exist: a dangerous goods shipment is not priced by a carrier API. Carriage
-- is arranged with DHL or FedEx by email, so no price exists until an operator finishes that
-- conversation and types in what the carrier charged. The columns record that conversation.

-- What the carrier quoted operations, before Ezhalha's margin and VAT. Kept separate from
-- base_rate so the ops-entered figure survives any later re-pricing of the shipment.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS dg_carrier_cost_sar numeric(10, 2);

-- When operations handed the declaration to the carrier, and when the quote came back.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS dg_handover_at timestamp;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS dg_quoted_at timestamp;

-- A DG quote is a price the carrier held for a period, not an open-ended offer. On expiry the
-- shipment is FLAGGED for an operator — never auto-cancelled, because the booking it would be
-- cancelling lives in the carrier's system, not ours.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS dg_quote_expires_at timestamp;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS dg_quote_note text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS dg_quote_expiry_flagged_at timestamp;

-- The client may decline a quote outright. Recorded rather than inferred from 'cancelled', so
-- an operator can tell a declined quote from an operational cancellation.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS dg_declined_at timestamp;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS dg_decline_reason text;

-- The client re-confirms the declaration before paying. Operations may have corrected the
-- addresses, weights or commodity details after submission, so what the client signed at
-- submission is not necessarily what is about to fly.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS dg_client_confirmed_at timestamp;

-- The client's preferred collection date, captured at submission. The pickup is not booked
-- then — there is nothing to collect until the shipment is paid for and an AWB exists.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS dg_preferred_pickup_date text;

-- The ops queue asks for dangerous goods shipments awaiting action, which are a small
-- minority of the table. Partial index, matching idx_shipments_dangerous_goods_review.
CREATE INDEX IF NOT EXISTS idx_shipments_dg_manual_queue
  ON shipments (status)
  WHERE fulfillment_type = 'dg_manual';
