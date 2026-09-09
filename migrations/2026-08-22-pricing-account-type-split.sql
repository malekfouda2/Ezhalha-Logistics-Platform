-- Split every pricing profile into Company and Individual rates.
-- Additive and idempotent; safe to re-run. Never apply with `drizzle-kit push` on a server.
--
-- Behaviour-neutral by construction: both account types are backfilled from the values the
-- profile already charged, so the 354 live individual accounts keep the exact rate they had
-- until an admin deliberately changes one side.

-- 1. Per-account-type default margins on the profile.
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS company_margin_percentage numeric(5,2);
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS company_ddp_margin_percentage numeric(5,2);
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS individual_margin_percentage numeric(5,2);
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS individual_ddp_margin_percentage numeric(5,2);

UPDATE pricing_rules
   SET company_margin_percentage        = COALESCE(company_margin_percentage, margin_percentage),
       company_ddp_margin_percentage    = COALESCE(company_ddp_margin_percentage, ddp_margin_percentage),
       individual_margin_percentage     = COALESCE(individual_margin_percentage, margin_percentage),
       individual_ddp_margin_percentage = COALESCE(individual_ddp_margin_percentage, ddp_margin_percentage)
 WHERE company_margin_percentage IS NULL
    OR company_ddp_margin_percentage IS NULL
    OR individual_margin_percentage IS NULL
    OR individual_ddp_margin_percentage IS NULL;

-- 2. Tiers belong to exactly one account type. Existing rows become the company set.
ALTER TABLE pricing_tiers
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'company';
ALTER TABLE ddp_pricing_tiers
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'company';

CREATE INDEX IF NOT EXISTS idx_pricing_tiers_profile_account
  ON pricing_tiers (profile_id, account_type);
CREATE INDEX IF NOT EXISTS idx_ddp_pricing_tiers_profile_account
  ON ddp_pricing_tiers (profile_id, account_type);

-- 3. Mirror the company tiers into an individual set, so both sides start identical and an
--    individual account keeps hitting the same tier it always did. The NOT EXISTS guard is
--    what makes this safe to re-run: it copies only profiles that have no individual tiers yet,
--    so a second run cannot duplicate a set an admin has since edited.
INSERT INTO pricing_tiers (profile_id, account_type, min_amount, margin_percentage)
SELECT t.profile_id, 'individual', t.min_amount, t.margin_percentage
  FROM pricing_tiers t
 WHERE t.account_type = 'company'
   AND NOT EXISTS (
     SELECT 1 FROM pricing_tiers existing
      WHERE existing.profile_id = t.profile_id
        AND existing.account_type = 'individual'
   );

INSERT INTO ddp_pricing_tiers (profile_id, account_type, billing_unit, min_amount, margin_percentage)
SELECT t.profile_id, 'individual', t.billing_unit, t.min_amount, t.margin_percentage
  FROM ddp_pricing_tiers t
 WHERE t.account_type = 'company'
   AND NOT EXISTS (
     SELECT 1 FROM ddp_pricing_tiers existing
      WHERE existing.profile_id = t.profile_id
        AND existing.account_type = 'individual'
   );
