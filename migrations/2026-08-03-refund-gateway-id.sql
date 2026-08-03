-- Auto-refund on still-booked cancellation: store the Tap refund id on the refund request.
-- Idempotent, additive. Never db:push.
ALTER TABLE shipment_refund_requests ADD COLUMN IF NOT EXISTS gateway_refund_id text;
