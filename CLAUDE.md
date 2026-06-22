# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A more detailed agent guide already lives in [AGENTS.md](AGENTS.md) — read it for full conventions on portals, RBAC, schedulers, high-risk areas, and testing. This file captures the essentials needed to get productive quickly.

## Commands

- Install: `npm install`
- Dev (API + Vite client on one port, default `5000`): `npm run dev`
- Type check (excludes `**/*.test.ts`): `npm run check`
- Production build (Vite client + esbuild server bundle via [script/build.ts](script/build.ts)): `npm run build`
- Start production bundle (`dist/index.cjs`): `npm start`
- Push Drizzle schema to DB: `npm run db:push`
- Run all tests: `npx vitest run`
- Run one test file: `npx vitest run tests/<name>.test.ts`

Vitest config: [vitest.config.ts](vitest.config.ts); test setup at [tests/setup.ts](tests/setup.ts) (mocks logger + email — keep tests deterministic, no real external calls).

## Architecture

Monorepo-style layout sharing a single `package.json`:

- `client/` — React 18 + Vite SPA. Wouter routing, TanStack React Query v5, shadcn/ui (Radix + Tailwind). Three portal layouts: `AdminLayout`, `ClientLayout`, `OperationsLayout`. Top-level route map and protected-route logic live in [client/src/App.tsx](client/src/App.tsx).
- `server/` — Express REST API in TypeScript/ESM. Startup, schedulers, and Vite/static serving in [server/index.ts](server/index.ts); the bulk of routes, middleware, auth, and permission gates live in one large [server/routes.ts](server/routes.ts) — preserve that structure rather than introducing a separate router style.
- `shared/` — Drizzle tables, enums, insert/Zod schemas, and shared domain helpers. Single source of truth is [shared/schema.ts](shared/schema.ts); import as `@shared/...` (aliases in [tsconfig.json](tsconfig.json) and [vite.config.ts](vite.config.ts)).
- `tests/` — Vitest unit/API tests, often Supertest-style for routes.

### Three user types, three permission models
- `admin` — string permissions like `shipments:read`, `pricing-rules:update`. Admin nav + route gates: keep `ADMIN_ROUTE_PERMISSIONS` and `ADMIN_NAV_ITEMS` in [client/src/lib/admin-navigation.ts](client/src/lib/admin-navigation.ts) in sync when adding/removing admin pages, and mirror them with server-side checks.
- `client` — uses `ClientPermission` constants from [shared/schema.ts](shared/schema.ts); primary-contact checks apply for some actions.
- `operations` — roles/permissions bootstrapped in [server/routes.ts](server/routes.ts); domain logic in [server/services/operations.ts](server/services/operations.ts).

Auth is session-based (`req.session.userId`). Middleware: `ensureAuthenticatedUser`, `requireAuth`, `requireAdminPermission`, `requireClient`, plus operations middleware.

### Data access
All DB access flows through Drizzle ([server/db.ts](server/db.ts)). Prefer the `IStorage` interface / `DatabaseStorage` in [server/storage.ts](server/storage.ts); use direct `db` queries only when a service already does so or storage doesn't expose the needed shape.

### Integrations
Carrier adapters (FedEx, DHL, Aramex) register via `server/integrations/carriers.ts`. Tap is the current payment integration (Stripe references are legacy). Zoho Books handles customer/invoice sync with bilingual fields. Integration account credentials are encrypted with `INTEGRATION_CONFIG_SECRET` — keep that secret stable across deploys or existing credentials become unreadable.

### Background schedulers
Start after the HTTP server listens: credit reminders, abandoned shipment recovery, express tracking refresh. Disable individually with `DISABLE_CREDIT_REMINDER_SCHEDULER`, `DISABLE_ABANDONED_RECOVERY_SCHEDULER`, `DISABLE_EXPRESS_TRACKING_REFRESH_SCHEDULER`.

## Environment

[server/load-env.ts](server/load-env.ts) loads `.env` unless `NODE_ENV=test`. Tests requiring env must set vars explicitly or mock. Required for normal DB-backed work: `DATABASE_URL`; in production also `SESSION_SECRET` and `INTEGRATION_CONFIG_SECRET`. See [AGENTS.md](AGENTS.md#environment) and `.env.example` for the full integration matrix (FedEx/DHL/Aramex/Tap/Zoho/Gemini/SMTP/object-storage).

## High-risk areas (touch carefully)

Payments (Tap charges, saved cards, webhooks), shipment creation (rates → checkout → carrier booking → labels → commercial invoices, including DDP/manual flows), auth/RBAC gates, integration credential encryption, financial/Zoho calculations, and anything in the scheduler/email path. Preserve audit logging and idempotency on sensitive POSTs.

## Frontend conventions

Dense, operational UI — not a marketing site. Brand orange `#fe5200`; theme via CSS custom properties in [client/src/index.css](client/src/index.css). Use existing shadcn/ui primitives in `client/src/components/ui/`, `lucide-react` for icons, and the request helpers in [client/src/lib/queryClient.ts](client/src/lib/queryClient.ts) (must include credentials for session auth). Arabic/English bilingual data is supported with RTL inputs in admin client editing.

## Workspace notes

- Worktree is often dirty (active development). Never revert or overwrite user changes unless asked.
- `logs/`, `uploads/`, `tmp/` are generated — avoid touching unless the task requires it.
- Do not commit unless the user explicitly asks.
