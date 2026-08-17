# Staging environment

Staging exists so the mobile app (and any risky change) can be exercised against a real
API without booking real carrier consignments, charging real cards, or emailing real
customers. Until it exists, mobile development is blocked on production, which is not an
option.

## Status: PROVISIONED and running (2026-08-17)

Built on the production host with full isolation. Production was verified healthy before,
during, and after every step.

| | |
|---|---|
| Host | `147.93.122.137`, path `/www/wwwroot/staging.ezhalha.co` |
| Process | pm2 app **`ezhalha-staging`**, cluster ×2, port **5001**, `pm2 save`d |
| Database | `ezhalha_staging` owned by role `ezhalha_staging`, connection limit 20, **66 tables** |
| Secrets | `SESSION_SECRET`, `INTEGRATION_CONFIG_SECRET`, `MOBILE_JWT_SECRET`, DB password — all freshly generated, all verified **different from production** |
| nginx | `node_ezhalha_staging.conf` → `127.0.0.1:5001`, `X-Forwarded-Proto` set, `noindex` header |
| Schedulers | credit reminder, abandoned recovery, express tracking — **all disabled** |
| Mail / Zoho | intentionally unconfigured, so staging cannot email customers or touch real accounting |

**Verified working:** bearer login for client / sub-user / operations / admin, guarded
routes, refresh rotation with family revocation, JSON 404s, and FedEx + Tap + Gemini
sandbox credentials authenticating *from the staging host*.

### One thing left, and it needs you

`staging.ezhalha.co` **does not resolve** (NXDOMAIN). Until that DNS record exists the
environment is only reachable on the box itself, because UFW allows 80/22 but not 5001.

```
A    staging.ezhalha.co    →    147.93.122.137
```

Once it propagates:

```bash
certbot --nginx -d staging.ezhalha.co     # then add the SSL block to the vhost
```

The nginx vhost is already in place and already has the `/.well-known/` challenge location,
so the certificate step should be uneventful.

---

The rest of this document is the original runbook, kept for rebuilds and for the parts not
yet done.

---

## Your decisions

| Decision | Options | Recommendation |
|---|---|---|
| Where it runs | Same host as production (`147.93.122.137`) / a separate VPS | **Same host to start.** Free, fast, and the box is at 13% disk and 19% memory. Move it off if staging load ever competes with prod. |
| Hostname | `staging.ezhalha.co` / a port on the prod host | `staging.ezhalha.co` behind nginx with its own TLS cert. App stores and Expo both want HTTPS. |
| Database | Same server, separate DB / separate server | Same Postgres instance, **separate database** (`ezhalha_staging`) and **separate role**. |
| Seed data | Empty / anonymised copy of production | **Anonymised copy.** Realistic pricing rules and clients make testing meaningful; raw production PII on a dev-accessible box does not. |

### The risk of co-hosting, stated plainly

Same host means a staging bug that exhausts memory, fills the disk with logs, or saturates
the Postgres connection pool can degrade production. Mitigations are in the steps below —
`max_memory_restart`, a separate DB role with its own connection budget, and separate log
files. If you would rather not carry that risk at all, put staging on its own small VPS;
everything below works unchanged apart from the paths.

---

## 1. Database

```bash
# On the prod host. The psql/pg_dump wrappers are broken — use the full paths.
PSQL=/www/server/pgsql/bin/psql

sudo -u postgres $PSQL <<'SQL'
CREATE ROLE ezhalha_staging LOGIN PASSWORD 'CHANGE_ME_STRONG_RANDOM';
CREATE DATABASE ezhalha_staging OWNER ezhalha_staging;
-- Keep staging from starving production of connections.
ALTER ROLE ezhalha_staging CONNECTION LIMIT 20;
SQL
```

Apply the schema. **Never `npm run db:push` against a server** — it wants to `DROP TABLE
session`. Use the additive migrations:

```bash
cd /www/wwwroot/staging.ezhalha.co
for f in migrations/*.sql; do
  $PSQL "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f "$f"
done
```

For a first-time empty database you need the full baseline schema, not just the deltas.
Generate it once from a synced local database:

```bash
# locally, against a database that matches shared/schema.ts
pg_dump --schema-only --no-owner --no-acl "$DATABASE_URL" > /tmp/baseline.sql
```

Then load `baseline.sql` into `ezhalha_staging` before the migration loop.

### Anonymised production copy (optional, recommended)

```bash
/www/server/pgsql/bin/pg_dump -Fc ezhalha > /tmp/prod.dump
/www/server/pgsql/bin/pg_restore -d ezhalha_staging /tmp/prod.dump
```

Then scrub, **before anyone gets access**:

```sql
UPDATE users SET
  email = 'user+' || id || '@staging.invalid',
  phone = NULL,
  password = '$2b$10$REPLACE_WITH_A_KNOWN_TEST_HASH',
  token_version = token_version + 1;

UPDATE client_accounts SET
  email = 'client+' || id || '@staging.invalid',
  phone = NULL,
  shipping_contact_phone = NULL;

-- Saved cards and gateway references must never leave production.
TRUNCATE tap_saved_cards;
UPDATE payments SET transaction_id = 'staging-' || id WHERE transaction_id IS NOT NULL;

-- Integration credentials are encrypted with the prod INTEGRATION_CONFIG_SECRET and are
-- meaningless (and must stay unusable) here.
TRUNCATE integration_accounts;
```

> The `token_version` bump is what stops any access token minted against production data
> from being replayed at staging.

---

## 2. Application

```bash
git clone <repo> /www/wwwroot/staging.ezhalha.co
cd /www/wwwroot/staging.ezhalha.co
npm install --no-audit --no-fund
cp .env.staging.example .env      # then fill it in — see below
npm run build
pm2 start ecosystem.staging.config.cjs --env staging
pm2 save
```

Runs as `ezhalha-staging` on port **5001**, two cluster instances, logging to
`logs/pm2-staging-*.log`.

> Never run `pm2 reload ecosystem.config.cjs` without `--env production` — its default
> `env` block sets `NODE_ENV=development` and would flip **production** to dev.

---

## 3. Environment variables

`INTEGRATION_CONFIG_SECRET` **must differ from production's.** Sharing it would let a
staging box decrypt production integration credentials.

| Variable | Staging value |
|---|---|
| `DATABASE_URL` | `postgresql://ezhalha_staging:…@localhost:5432/ezhalha_staging` |
| `SESSION_SECRET` | fresh random, not prod's |
| `INTEGRATION_CONFIG_SECRET` | **fresh random, not prod's** |
| `MOBILE_JWT_SECRET` | fresh random, not prod's |
| `APP_URL` | `https://staging.ezhalha.co` |
| `CORS_ALLOWED_ORIGINS` | Expo origins (already set in the pm2 config) |
| `FEDEX_*` | copy from local `.env` — already sandbox, verified working |
| `TAP_SECRET_KEY` / `TAP_PUBLIC_KEY` | copy from local `.env` — already `sk_test_` / `pk_test_`, verified working |
| `GEMINI_API_KEY` | copy from local `.env` |
| `DHL_*` | **needs new credentials** — the current ones are dead (see below) |
| `ARAMEX_*` | **not configured anywhere** — needs a test account |
| `ZOHO_*` | leave unset — do not sync staging invoices into real accounting |
| `SMTP_*` / `POSTMARK_SERVER_TOKEN` | see mail, below |
| `GEMINI_API_KEY` | can share prod's; it is read-only inference |

### Mail must not reach customers

Postmark's free tier is capped at 100 messages/month and staging will burn it. Point
staging at a catch-all instead — Mailtrap, Mailpit, or a Postmark **sandbox** token. Do not
reuse the production Postmark token.

### Where credentials actually come from

**`.env` is the fallback, not the source of truth.** At startup
`loadDefaultIntegrationAccountsIntoEnv()` (`server/services/integration-apps.ts:602`) reads
the `integration_accounts` table and **overwrites** the matching env vars for every account
that is active, default, and has no `countryCode`. Env values only survive where no such
row exists.

Two consequences for staging:

1. Seeding `.env` is enough to bootstrap, but anything entered later through the admin
   **Apps** page silently wins over it. When a carrier behaves unexpectedly, check the Apps
   page before you check `.env`.
2. If you restore an anonymised production dump, `TRUNCATE integration_accounts` (already in
   the scrub script above) is **mandatory**. Those rows are encrypted with production's
   `INTEGRATION_CONFIG_SECRET`; with staging's different secret they fail to decrypt and are
   silently skipped, which looks exactly like "the credentials are wrong."

### Credential status — probed 2026-08-17

The local `.env` already holds working sandbox credentials for most integrations. Verified
by hitting each provider's auth endpoint directly:

| Integration | Endpoint in `.env` | Status |
|---|---|---|
| FedEx | `apis-sandbox.fedex.com` | ✅ OAuth 200, token issued (scope `CXS-TP`) |
| FedEx documents | `documentapitest.prod.fedex.com/sandbox` | ✅ sandbox host |
| Tap | `sk_test_…` / `pk_test_…` | ✅ key accepted (400 on sentinel charge, not 401) |
| Gemini | live key | ✅ fine — read-only inference, safe to share with prod |
| **DHL** | `express.api.dhl.com/mydhlapi/test` | ❌ **401 Invalid Credentials** |
| **Aramex** | — | ❌ **no `ARAMEX_*` keys at all** |

Copy the FedEx, Tap and Gemini blocks straight from the local `.env` into staging's. Two gaps
remain:

- [ ] **DHL credentials are dead.** The same key/secret returns `401 Invalid Credentials`
      against **both** the test base and the production base, so this is not a
      wrong-environment mistake — the credentials themselves are invalid. This matches the
      standing "DHL integration broken" issue in production. Get a fresh MyDHL API
      key/secret from DHL; nothing DHL-related can be tested on staging until then.
- [ ] **Aramex has no credentials anywhere.** The adapter exists
      (`server/integrations/aramex.ts`) and `validateAramexEnvOnStartup()` runs at boot, but
      no `ARAMEX_*` values are configured. Obtain a test account, or accept that Aramex is
      untestable on staging.
- [ ] **A catch-all mail inbox** (Mailtrap / Mailpit / Postmark sandbox token).

> **FedEx Track needs its own credentials — this is expected, not a misconfiguration.**
> `POST /track/v1/trackingnumbers` returns **403** with the sandbox Ship/Rate credentials.
> FedEx's "Basic Integrated Visibility" (formerly Track API) must live in a **separate
> project**; it cannot share the Ship/Rate project. The adapter already handles this:
> `FedExAdapter.trackShipment` (`server/integrations/fedex.ts:1964`) resolves
> `FEDEX_TRACK_CLIENT_ID` / `FEDEX_TRACK_CLIENT_SECRET` / `FEDEX_TRACK_BASE_URL`
> (or the `…_API_KEY` / `…_SECRET_KEY` aliases) from the bound Apps account first, then from
> `process.env`, and falls back to the Ship/Rate key when unset — which is what produces the
> 403.
>
> So tracking is testable on staging **as soon as** a Basic Integrated Visibility sandbox
> project exists and its key/secret are set as `FEDEX_TRACK_*`. No code change needed.
> Those variables are currently absent from both `.env` and `.env.example`.

---

## 4. nginx and TLS

```nginx
server {
    server_name staging.ezhalha.co;

    location / {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        'upgrade';
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

The app sets `trust proxy`, so `X-Forwarded-For` is what per-IP rate limiting keys on —
without it every request buckets to the proxy's own address.

Issue a cert (`certbot --nginx -d staging.ezhalha.co`), then confirm the DNS A record
points at `147.93.122.137`.

### Keep staging out of search results

```nginx
add_header X-Robots-Tag "noindex, nofollow" always;
```

Consider HTTP basic auth in front of the whole vhost too. It costs nothing and keeps a
half-built environment off the public internet; the mobile app can send the basic-auth
header alongside its bearer token.

---

## 5. Test accounts

Create one active account per user type and hand the credentials to the mobile developer:

| Type | Purpose |
|---|---|
| `client` primary contact | full client-portal surface, can pay |
| `client` sub-user | permission-gated surface, **not** primary contact |
| `operations` | ops queues, tasks, assignments |
| `admin` | admin surface |

The client account needs a credit limit and at least one saved address, or most of the
shipment flow is unreachable.

---

## 6. Verify

```bash
curl -s https://staging.ezhalha.co/api/health
# {"status":"healthy",...}

# Bearer auth end to end
curl -s -X POST https://staging.ezhalha.co/api/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"username":"<test client>","password":"<pw>","deviceId":"runbook-check","platform":"ios"}'

# The access token from that response should authenticate an existing route:
curl -s https://staging.ezhalha.co/api/auth/me -H "Authorization: Bearer <accessToken>"
```

Then confirm the isolation that makes this environment worth having:

- [ ] `/api/health` responds over HTTPS
- [ ] Bearer login returns a token pair and **no** `Set-Cookie` header
- [ ] Cookie login still works (web app unaffected)
- [ ] A rate quote hits the carrier **sandbox**, not production carrier accounts
- [ ] A test payment appears in the Tap **test** dashboard
- [ ] Outbound mail lands in the catch-all, not a real inbox
- [ ] `pm2 list` shows `ezhalha` and `ezhalha-staging` both online
- [ ] Production still responds on `https://app.ezhalha.co`

---

## Known issue to fix while you are in here

`ecosystem.config.cjs` has the **production database password committed to git** in its
`env_production` block. Staging deliberately does not repeat that pattern — it reads
everything from `.env`. Worth moving production to the same approach and rotating that
password, separately from this work.
