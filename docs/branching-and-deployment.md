# Branching and deployment

How code moves from a laptop to production.

## The model in three rules

1. **`main` is the only long-lived branch.** Everything else is short-lived, merged by pull
   request, and deleted afterwards.
2. **Staging always runs the tip of `main`.** Disposable, always current.
3. **Production runs a tag, never `main`.** The tag is the approval gate.

```
 feat/*  ──PR──▶  main  ─────────────▶  staging.ezhalha.co   (tip of main)
                    │
                    └── tag v7.1.0 ──▶  app.ezhalha.co       (a commit you chose)
```

### Why a tag rather than a `staging` branch

A long-lived `staging` branch that merges into `main` breaks the first time you want to
promote only *part* of what is on staging. Cherry-picking the wanted commit duplicates it
under a new SHA, `staging` and `main` diverge permanently, and every later merge conflicts
on code that is logically identical. Merging `staging → main` also produces a merge commit
that was never tested as such, so the artifact you verified is not the artifact you ship.

With tags there is one history. Production simply sits further back along it.

---

## Everyday flow

```bash
git checkout main && git pull
git checkout -b feat/short-description
# … work …
git push -u origin feat/short-description
```

Open a PR into `main`. CI runs type check, build, the full test suite, and a docs-drift
check. Review, merge, delete the branch.

Staging picks the change up on its next deploy (below). Production is unaffected.

---

## Deploying to staging

Staging is a git checkout tracking `main`, so a deploy is a fast-forward.

```bash
ssh root@147.93.122.137 -p 22
cd /www/wwwroot/staging.ezhalha.co

git fetch origin
git checkout main
git reset --hard origin/main

npm install --no-audit --no-fund
npm run build

# Apply any new migrations. NEVER db:push against a server.
for f in migrations/*.sql; do
  /www/server/pgsql/bin/psql "$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)" \
    -v ON_ERROR_STOP=1 --single-transaction -f "$f"
done

pm2 reload ecosystem.staging.config.cjs --env staging
git rev-parse HEAD > DEPLOYED_REVISION

curl -s -H 'Host: staging.ezhalha.co' http://127.0.0.1/api/health
```

Migrations are additive and idempotent, so re-applying the whole directory is safe.

---

## Releasing to production

### 1. Verify on staging

Production only ever receives something that has run on staging. Check the areas that
carry money or bookings: a rate quote, a checkout, a payment, a label.

### 2. Tag the exact commit staging proved

```bash
git checkout main && git pull
git tag -a v7.1.0 -m "Mobile phase 0: bearer auth, CORS, generated API docs"
git push origin v7.1.0
```

Semver: patch for fixes, minor for features, major for breaking API changes. The tag is
permanent and never moves — that is what makes it a gate.

### 3. Back up the database

```bash
/www/server/pgsql/bin/pg_dump -Fc ezhalha > /root/backups/ezhalha-$(date +%F-%H%M).dump
```

The system `pg_dump` wrapper is broken; use that full path.

### 4. Apply schema changes *before* the new build

Migrations are additive and backward compatible, so the old build keeps running against
the new schema. This is what makes the deploy zero-downtime.

```bash
cd /www/wwwroot/app.ezhalha.co
git fetch --tags
/www/server/pgsql/bin/psql "$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)" \
  -v ON_ERROR_STOP=1 --single-transaction -f migrations/<new-migration>.sql
```

> **Never run `npm run db:push` against production.** The `session` table is created at
> runtime and is not a Drizzle entity, so push treats it as drift and offers to drop it.
> Additive SQL only.

### 5. Deploy the tag

```bash
cd /www/wwwroot/app.ezhalha.co
git fetch --tags
git checkout v7.1.0          # detached HEAD is correct here — prod tracks a tag, not a branch
npm install --no-audit --no-fund
npm run build
pm2 reload ecosystem.config.cjs --env production
```

> `pm2 reload ecosystem.config.cjs` **without** `--env production` sets
> `NODE_ENV=development` and would flip production into dev mode. Always pass the flag.

### 6. Verify

```bash
curl -s https://app.ezhalha.co/api/health
pm2 logs ezhalha --err --nostream --lines 50
```

Then exercise a real path — log in, open a shipment, load an invoice.

---

## Rolling back

Because production runs a tag, rollback is just the previous tag:

```bash
cd /www/wwwroot/app.ezhalha.co
git checkout v7.0.0
npm install --no-audit --no-fund && npm run build
pm2 reload ecosystem.config.cjs --env production
```

Schema changes are additive, so the older build tolerates the newer schema — which is
precisely why migrations must never drop or rename in the same release that ships the code
depending on the change. Split destructive changes across two releases: deploy code that no
longer uses the column, then remove the column in a later release.

---

## Hotfixes

When production needs a fix but `main` contains unreleased work:

```bash
git checkout -b fix/urgent v7.1.0     # branch from the deployed tag, not main
# … fix …
git tag -a v7.1.1 -m "Fix …"
git push origin fix/urgent v7.1.1
```

Deploy `v7.1.1`, then open a PR merging `fix/urgent` into `main` so the fix is not lost in
the next release.

---

## The mobile app

The mobile developer follows the same flow: short `feat/mobile-*` branches off `main`, PR,
review, merge. **No long-lived `mobile` branch.**

This is safe because `mobile/` never reaches production: `script/build.ts` bundles only
`server/index.ts` plus the Vite client, and the root `tsconfig` covers only `client/src`,
`shared`, and `server`. Unfinished mobile code on `main` is inert.

A long-lived branch would be actively worse — the Arabic/i18n work will touch `shared/`,
`server/`, and most of `client/`, so a branch living through M1 would spend a day a week
resolving conflicts.

The one real coupling is `shared/`, which she consumes and you change. Frequent small
merges surface that in hours rather than months.

---

## Environments at a glance

| | Production | Staging | Local |
|---|---|---|---|
| URL | `app.ezhalha.co` | `staging.ezhalha.co` | `localhost:5000` |
| Runs | a tag (`vX.Y.Z`) | tip of `main` | your working tree |
| pm2 app | `ezhalha` (cluster ×4, :5000) | `ezhalha-staging` (cluster ×2, :5001) | — |
| Database | `ezhalha` | `ezhalha_staging` | docker `ezhalha-db` |
| Carriers | live accounts | sandbox | sandbox |
| Payments | Tap live | Tap test | Tap test |
| Email | Postmark | catch-all only | none |
| Schedulers | on | off | off |

Staging and production secrets are deliberately different. In particular
`INTEGRATION_CONFIG_SECRET` must never be shared — it decrypts stored integration
credentials.
