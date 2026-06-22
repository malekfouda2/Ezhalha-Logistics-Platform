# AGENTS.md

Repo guidance for AI coding agents working on ezhalha Logistics Platform.

## Scope

This file applies to entire repository.

## Project Summary

ezhalha is an enterprise B2B logistics platform with three portal surfaces:

- Admin portal for platform management, client onboarding, shipments, pricing, RBAC, policies, integrations, logs, financial operations, refunds, credit invoices, and operations oversight.
- Client portal for shipment creation, DDP requests, invoices, payments, credit/pay-later billing, settings, and team users.
- Operations portal for logistics staff handling DDP and express operational workflows, assignments, tasks, notes, notifications, special handling, attention flags, client messaging, and extra charges.

Core domain: shipping, carrier integrations, payment collection, credit invoices, auditability, account management, and bilingual English/Arabic business data.

## Tech Stack

- Runtime: Node.js, TypeScript, ESM.
- Frontend: React 18, Vite, Wouter, TanStack React Query v5.
- UI: shadcn/ui New York style, Radix primitives, Tailwind CSS, CSS variables, lucide-react icons.
- Backend: Express REST API, express-session, Passport local auth, Helmet, rate limiting.
- Database: PostgreSQL via Drizzle ORM. Schema lives in `shared/schema.ts`.
- Tests: Vitest with node environment, setup in `tests/setup.ts`.
- Build: Vite client build plus esbuild server bundle through `script/build.ts`.
- Package manager: npm. `package-lock.json` is present.

## Key Paths

- `client/src/App.tsx`: frontend route map and protected route logic.
- `client/src/pages/admin/*`: admin portal pages.
- `client/src/pages/client/*`: client portal pages.
- `client/src/pages/operations/*`: operations portal pages.
- `client/src/components/*`: shared components and portal layouts.
- `client/src/components/ui/*`: shadcn/Radix UI primitives.
- `client/src/lib/queryClient.ts`: API request helpers and React Query defaults.
- `client/src/lib/auth-context.tsx`: session auth client state.
- `client/src/lib/auth-routing.ts`: post-login routing by user type.
- `client/src/lib/admin-navigation.ts`: admin nav and permission mapping.
- `server/index.ts`: app startup, schedulers, route registration, Vite/static serving.
- `server/routes.ts`: Express middleware, auth, permissions, and API routes.
- `server/storage.ts`: `IStorage` contract and `DatabaseStorage` implementation.
- `server/db.ts`: Drizzle PostgreSQL pool.
- `server/services/*`: business services.
- `server/integrations/*`: FedEx, DHL, Aramex, Tap, Zoho, storage integration code.
- `server/validation/*`: server-side validation helpers.
- `shared/schema.ts`: Drizzle tables, enums, insert schemas, shared types, Zod schemas.
- `shared/countries.ts`, `shared/chargeable-weight.ts`, `shared/application-documents.ts`: shared domain helpers.
- `tests/*.test.ts`: focused unit/API/service tests.
- `docs/credit-pay-later-feature.md`: detailed credit/pay-later feature doc.
- `.env.example`: documented runtime configuration.

## Commands

- Install deps: `npm install`
- Dev server: `npm run dev`
- Type check app code: `npm run check`
- Build production bundle: `npm run build`
- Start production bundle: `npm start`
- Push Drizzle schema: `npm run db:push`
- Run tests: `npx vitest run`
- Run one test: `npx vitest run tests/<name>.test.ts`

Dev server serves API and Vite client together from `server/index.ts`; default port is `5000` unless `PORT` is set. In development, Vite middleware handles SPA fallback. In production, `serveStatic` serves `dist/public`, and `dist/index.cjs` is server entry.

## Environment

Required for normal DB-backed app work:

- `DATABASE_URL`
- `SESSION_SECRET` in production
- `INTEGRATION_CONFIG_SECRET` in production; keep stable because encrypted integration credentials depend on it

Common integration env:

- Shipping: `FEDEX_*`, `DHL_*`, `ARAMEX_*`
- Payments: `TAP_SECRET_KEY`, `TAP_PUBLIC_KEY`, optional `TAP_MERCHANT_ID`
- Accounting: `ZOHO_*`
- AI extraction: `GEMINI_API_KEY`, `GEMINI_INVOICE_EXTRACTION_MODEL`
- Email: `SMTP_*`, `ADMIN_EMAIL`
- Storage: `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`, `DEFAULT_OBJECT_STORAGE_BUCKET_ID`
- Logging: `LOG_DIR`, `LOG_LEVEL`

`server/load-env.ts` loads local `.env` unless `NODE_ENV=test`. Tests needing env must set vars explicitly or mock dependencies.

## Architecture Notes

- API routes live mostly in one large `server/routes.ts`; preserve existing middleware and permission patterns instead of adding a separate router style unless doing a deliberate refactor.
- Auth is session-based. `req.session.userId` identifies user; `ensureAuthenticatedUser`, `requireAuth`, `requireAdminPermission`, `requireClient`, and operations permission middleware enforce access.
- User types currently include `admin`, `client`, and `operations`.
- Admin permissions are string permissions like `shipments:read`, `pricing-rules:update`, and `operations:read`.
- Client permissions use `ClientPermission` constants from `shared/schema.ts`.
- Operations roles and permissions are bootstrapped in `server/routes.ts`; operations domain logic is in `server/services/operations.ts`.
- Database access should usually go through `storage` methods. Use direct `db` queries in services when that is already local pattern or storage does not expose needed shape.
- Shared schema types should be imported from `@shared/schema`; client imports use aliases from `vite.config.ts` and `tsconfig.json`.
- POST-like mutations often use audit logging, idempotency, or permission checks. Preserve those behaviors when editing shipment/payment/accounting flows.

## Domain Notes

- Shipment flow supports domestic, inbound, outbound, DDP/manual, express carrier shipments, package extraction, commercial invoices, HS lookup, ETD documents, labels, and tracking.
- Carrier abstraction registers FedEx, DHL, and Aramex in `server/integrations/carriers.ts`.
- Integration accounts can be managed through admin apps and encrypted with `INTEGRATION_CONFIG_SECRET`.
- Tap is current payment integration. Stripe references are legacy/backwards compatibility if present.
- Credit/pay-later creates `credit_invoices` with 30-day terms and reminder scheduler; see `docs/credit-pay-later-feature.md`.
- Background schedulers start after HTTP server listens: credit reminders, abandoned shipment recovery, express tracking refresh. Disable with `DISABLE_CREDIT_REMINDER_SCHEDULER`, `DISABLE_ABANDONED_RECOVERY_SCHEDULER`, or `DISABLE_EXPRESS_TRACKING_REFRESH_SCHEDULER`.
- Default seed data creates admin/client demo users only when DB has no admin user; do not rely on seeded credentials for production.

## Frontend Conventions

- Use existing layouts: `AdminLayout`, `ClientLayout`, `OperationsLayout`.
- Use Wouter routes in `client/src/App.tsx`.
- Use React Query with helpers from `client/src/lib/queryClient.ts`; requests should include credentials for session auth.
- Use existing shadcn/ui primitives from `client/src/components/ui`.
- Use `lucide-react` icons where available.
- Keep UI dense and operational. This is a logistics/workflow product, not a marketing site.
- Respect brand orange `#fe5200` and CSS custom properties in `client/src/index.css`.
- For admin navigation, update `ADMIN_ROUTE_PERMISSIONS` and `ADMIN_NAV_ITEMS` together when adding/removing admin pages.
- For new protected pages, ensure route-level permission checks match server-side permission checks.

## Backend Conventions

- Validate inputs with Zod or existing validation helpers.
- Return JSON errors consistently, usually `{ error: "..." }` or `{ message: "..." }` depending on existing local pattern.
- Preserve audit logs for sensitive changes: auth, account/profile changes, pricing, payments, credit invoices, shipment status, refund decisions, and integration changes.
- Do not log secrets, payment card data, or integration credentials.
- Keep carrier-specific details inside integration adapters or shipment builder services.
- Keep financial calculations in service/shared helpers instead of duplicating formulas in route handlers.
- When adding database columns/tables, update `shared/schema.ts`, storage/service code, and relevant tests.
- Use `npm run db:push` for local schema sync when needed.

## Testing Guidance

- Add or update focused Vitest tests under `tests/` for business logic, routes, auth/permissions, integrations, and shared helpers.
- Existing `tests/setup.ts` mocks logger and email service. Keep tests deterministic and avoid real external API calls.
- Prefer service/unit tests for calculations and integration request building; use Supertest-style API tests when route auth/permissions or serialization matters.
- `npm run check` excludes `**/*.test.ts`; run Vitest for tests.

## Git And Workspace Rules

- Worktree may be dirty. Never revert or overwrite user changes unless explicitly asked.
- Current repo often contains generated logs/uploads; avoid touching `logs/`, `uploads/`, and `tmp/` unless task specifically needs them.
- Before editing, inspect relevant files and local patterns.
- Keep changes scoped to task.
- Use `rg`/`rg --files` for search.
- Use `apply_patch` for manual file edits.
- Do not commit unless user asks.

## High-Risk Areas

- Payment flows: Tap charge creation, saved cards, redirect/webhook handling, invoice/payment status.
- Shipment creation: rates, checkout, carrier booking, labels, commercial invoices, DDP/manual shipments.
- Auth/RBAC: session handling, admin/client/operations permission gates, primary contact checks.
- Integration credential encryption and account binding.
- Financial/accounting calculations and Zoho sync.
- Background schedulers and any code that can send emails or call carrier APIs.

## Useful Checks Before Finishing Work

- Run `npm run check` for TypeScript changes.
- Run targeted `npx vitest run tests/<name>.test.ts` for touched behavior.
- Run `npm run build` when changing Vite config, app startup, routing, or build output.
- For UI changes, start `npm run dev` and verify affected route in browser when feasible.
- For DB/schema changes, confirm `npm run db:push` behavior against intended database.

