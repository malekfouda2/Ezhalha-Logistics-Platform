-- Admin-uploaded per-integration-app brand logos (Apps tab).
-- Idempotent; apply with psql on prod — never db:push.
CREATE TABLE IF NOT EXISTS integration_app_logos (
  app_key varchar PRIMARY KEY,
  logo text NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);
