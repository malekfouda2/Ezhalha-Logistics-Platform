-- FedEx Express returns a station code alongside the pickup confirmation ("SXJA") and requires it
-- back to cancel that pickup. We were discarding it, so a booked FedEx pickup could not be
-- cancelled through the API at all. Store it next to the confirmation number.
--
-- Additive and idempotent. Safe to apply while the old build is still serving.

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS pickup_location_code text;
