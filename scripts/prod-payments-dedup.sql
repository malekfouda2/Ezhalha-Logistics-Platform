-- Fix: duplicate payment rows from the Tap redirect/webhook race.
-- Run on production BEFORE (or with) deploying the idempotent createPayment + ux_payments_txn.
-- Never db:push. Safe to re-run.
--
-- 1) Inspect first (read-only): how many transaction_ids have duplicates.
--    SELECT transaction_id, COUNT(*) FROM payments
--    WHERE transaction_id IS NOT NULL GROUP BY transaction_id HAVING COUNT(*) > 1;

BEGIN;

-- 2) Collapse duplicates: keep the earliest row per transaction_id, delete the rest.
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

-- 3) Backstop: partial unique index so a racing second insert becomes a no-op.
--    CONCURRENTLY cannot run inside a transaction; run this statement on its own.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ux_payments_txn
  ON payments (transaction_id)
  WHERE transaction_id IS NOT NULL;
