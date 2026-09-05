-- Stop two concurrent payment finalisations from booking the same shipment twice.
-- Additive and idempotent; safe to re-run. Never apply with `drizzle-kit push` on a server.
--
-- The Tap webhook and the client's browser redirect both finalise payment. Five times since
-- 31 July they arrived within the same second, both read carrier_tracking_number as NULL, both
-- passed the "already booked?" guard, and the carrier issued two waybills for one shipment
-- (EZH093042934, EZH343080675, EZH756078067, EZH910728831, EZH503313541 — FedEx and DHL alike,
-- so it was never carrier-specific). Billing was unaffected: the payment idempotency added
-- earlier held, and every one of those shipments was charged exactly once.
--
-- A conditional UPDATE on this column is atomic across all four pm2 workers, which is what the
-- previous read-then-check could never be.

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_booking_claimed_at timestamp;

-- Shipments already booked can never be claimed again, so backfilling is unnecessary: the
-- claim condition also requires carrier_tracking_number IS NULL.
