-- Guest mode: carry a guest-built shipment across registration.
--
-- A guest builds a shipment with no account. Individuals are auto-approved and pick it straight
-- back up from their browser, but a company waits days for document review — long enough for
-- localStorage to be cleared or for them to come back on another device. The draft is therefore
-- held server-side, on the application itself.
--
-- Deliberately NOT a `shipments` row: `shipments.client_account_id` is NOT NULL and no account
-- exists yet, and the admin Abandoned queue has no age threshold, so an unpaid shipment row
-- would appear there the moment it was written.
--
-- Additive and idempotent; behaviour-neutral for every existing application.

ALTER TABLE client_applications
  ADD COLUMN IF NOT EXISTS shipment_draft text;
