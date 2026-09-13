-- Email settings: how each email behaves, and whether it actually arrived.
--
-- Two additive tables. `email_template_settings` carries the operational side of a template —
-- enabled, retry policy, and (for the few scheduler-driven emails) the schedule — separately
-- from `email_templates`, which owns the wording. `email_deliveries` records every attempt, so
-- a failed send stops being a log line nobody can act on.
--
-- Both are new; nothing existing reads or writes them, and the code falls back to the current
-- hardcoded defaults when a settings row is absent. Safe to apply before the new build ships.

CREATE TABLE IF NOT EXISTS email_template_settings (
  id                    varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  template_slug         text NOT NULL UNIQUE,
  enabled               boolean NOT NULL DEFAULT true,
  max_attempts          integer NOT NULL DEFAULT 3,
  retry_backoff_seconds integer NOT NULL DEFAULT 300,
  schedule_enabled      boolean,
  interval_minutes      integer,
  send_hour_utc         integer,
  config                text,
  updated_by_user_id    varchar,
  created_at            timestamp NOT NULL DEFAULT now(),
  updated_at            timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_deliveries (
  id              varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  template_slug   text NOT NULL,
  recipient       text NOT NULL,
  subject         text NOT NULL,
  status          text NOT NULL DEFAULT 'pending',
  attempts        integer NOT NULL DEFAULT 0,
  max_attempts    integer NOT NULL DEFAULT 3,
  last_error      text,
  last_attempt_at timestamp,
  next_attempt_at timestamp,
  sent_at         timestamp,
  provider        text,
  message_id      text,
  variables       text,
  entity_type     text,
  entity_id       varchar,
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now()
);

-- The retry worker's only query: everything still owed an attempt, oldest first.
CREATE INDEX IF NOT EXISTS ix_email_deliveries_retry
  ON email_deliveries (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

-- The admin page lists by template and by recency.
CREATE INDEX IF NOT EXISTS ix_email_deliveries_slug_created
  ON email_deliveries (template_slug, created_at DESC);
