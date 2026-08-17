-- Phase 0 / Workstream A: bearer-token auth for native clients.
-- Idempotent, additive, backward-compatible. Never db:push.
--
-- Backward compatible on purpose: the running build ignores both of these, so this can be
-- applied while the OLD bundle is still serving, then the new build deployed with no
-- downtime.
--
-- Apply with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
--     -f migrations/2026-08-17-mobile-token-auth.sql

-- Rotating refresh tokens for native clients. Only the sha256 hash is stored, so a
-- database read cannot mint sessions.
CREATE TABLE IF NOT EXISTS mobile_refresh_tokens (
  id             varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        varchar NOT NULL,
  token_hash     text NOT NULL,
  family_id      varchar NOT NULL,
  device_id      text NOT NULL,
  device_name    text,
  platform       text NOT NULL DEFAULT 'unknown',
  app_version    text,
  expires_at     timestamp NOT NULL,
  last_used_at   timestamp,
  revoked_at     timestamp,
  revoked_reason text,
  created_at     timestamp NOT NULL DEFAULT now()
);

-- One row per token. The unique index is what makes hash lookup safe to treat as identity.
CREATE UNIQUE INDEX IF NOT EXISTS ux_mobile_refresh_token_hash
  ON mobile_refresh_tokens (token_hash);

-- Device list for a user, and family-wide revocation on reuse detection.
CREATE INDEX IF NOT EXISTS ix_mobile_refresh_user   ON mobile_refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS ix_mobile_refresh_family ON mobile_refresh_tokens (family_id);

-- Access tokens are stateless. Bumping this column invalidates every live token for the
-- user at once, which is how deactivation and password change take effect immediately
-- instead of waiting out the 15-minute TTL.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;

-- Verify:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'users' AND column_name = 'token_version';
--   SELECT indexname FROM pg_indexes WHERE tablename = 'mobile_refresh_tokens';
