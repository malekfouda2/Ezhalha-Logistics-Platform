-- Keep the tracking number of every piece, not just the master.
--
-- A multi-piece shipment travels as separate barcoded boxes, each with its own carrier tracking
-- number; the master only aggregates them. We stored the master alone, so an individual box could
-- not be traced — and when EZH043868517 (25 pieces) lost its per-piece labels there was nothing
-- left to rebuild them from. Carriers return these numbers once, in the shipment-create response,
-- and offer no way to fetch them afterwards: FedEx answers 404 to every retrieval attempt for an
-- existing waybill.
--
-- JSON array of strings in carrier order, matching how packages_data and items_data are stored.
--
-- Additive, idempotent, and behaviour-neutral for every existing row: absent means "this shipment
-- predates the column", which reads the same as the master-only behaviour it replaces.

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS carrier_piece_tracking_numbers text;
