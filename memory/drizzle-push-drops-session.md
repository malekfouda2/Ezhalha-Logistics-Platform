---
name: drizzle-push-drops-session
description: Never run `drizzle-kit push` blindly on prod — it tries to DROP the session table
metadata:
  type: feedback
---

`npm run db:push` / `drizzle-kit push` is UNSAFE to run unattended against the Ezhalha prod DB.

**Why:** the `session` table (express-session / connect-pg-simple) is NOT in `shared/schema.ts`, so push treats it as drift and generates `DROP TABLE "session" CASCADE` — plus `DROP CONSTRAINT roles_name_unique` and `DROP INDEX integration_accounts_default_scope_unique`. It also asks interactive "created or renamed from session?" prompts where a wrong answer renames/loses data. On 2026-06-22 a blind v6.0 deploy crash-looped prod (missing `full_name` column) and the push attempt to fix it would have dropped `session`.

**How to apply:** migrate prod with an ADDITIVE-only SQL script, never raw push. Workflow that worked:
1. `pg_dump` backup first (binary lives at `/www/server/pgsql/bin/pg_dump`; system `pg_dump`/`psql` wrappers are broken — use that path).
2. Run `drizzle-kit push --verbose --strict` only to PRINT the SQL plan (it stops at the confirm prompt), capture it.
3. Strip every `DROP`/`RENAME`/`DISABLE ROW LEVEL`/default-change line; keep only `CREATE TABLE` / `ADD COLUMN` / `CREATE INDEX`, made `IF NOT EXISTS`.
4. Re-derive the full index list from `shared/schema.ts` (the captured push log truncated and lost trailing indexes).
5. Apply with `psql -v ON_ERROR_STOP=1 --single-transaction -f migrate.sql`.
6. Additive schema is backward-compatible, so apply it while the OLD build still runs (no downtime), THEN build + `pm2 reload ... --env production`.

v6.0 schema (departments, user_invitations, operation_profiles, shipment_* operations tables, tasks/* tables, notifications, plus users.full_name/last_login_at and roles dept columns) was migrated this way on 2026-06-22. See [[prod-deploy-topology]].
