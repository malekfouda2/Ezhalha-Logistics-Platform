# ezhalha - Enterprise Logistics Platform

## Overview

ezhalha is a production-ready enterprise logistics management platform for B2B shipping. It provides two separate portals:

- **Admin Portal**: Full platform management including client accounts, applications, pricing rules, shipments, invoices, payments, audit logs, RBAC, integration monitoring, and policy page management.
- **Client Portal**: Customer-facing interface for creating shipments (multi-step flow), viewing invoices/payments, managing sub-users with granular permissions, and account settings.

The platform integrates with FedEx for shipping rates/labels, Zoho Books for invoice synchronization, Stripe and Moyasar for payment processing, and Google Cloud Storage for file uploads. It supports bilingual data entry (English/Arabic) with RTL support for Arabic fields.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, built with Vite
- **Routing**: Wouter (lightweight client-side router)
- **State Management**: TanStack React Query v5 for server state; React context for auth and theme
- **UI Components**: shadcn/ui (New York style) with Radix UI primitives, styled with Tailwind CSS
- **Form Handling**: React Hook Form with Zod validation (schemas shared between client and server via `@shared/schema`)
- **Layout Pattern**: Dual-layout architecture — `AdminLayout` (fixed left sidebar, w-64) and `ClientLayout` (top navigation bar). Navigation items are dynamically filtered based on user type and permissions.
- **Path Aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`, `@assets/` maps to `attached_assets/`
- **Entry Point**: `client/src/main.tsx` → `client/src/App.tsx`

### Backend
- **Runtime**: Node.js with TypeScript (tsx for development, esbuild for production builds)
- **Framework**: Express.js with RESTful API design
- **Entry Point**: `server/index.ts` → routes registered in `server/routes.ts`
- **Session Management**: express-session with connect-pg-simple for PostgreSQL session store
- **Security**: Helmet for HTTP headers, bcrypt for password hashing, express-rate-limit with brute-force protection on auth endpoints, HTML sanitization (sanitize-html) for policy content, Zod validation on all inputs
- **API Features**: Idempotency keys for POST endpoints (stored in DB with TTL), health checks, branding configuration endpoint
- **Logging**: Winston with daily-rotate-file transport — separate files for combined logs (14 days), error logs (30 days), and audit logs (90 days) in `./logs/`
- **Email**: Nodemailer for transactional emails (account credentials, application notifications) configured via SMTP environment variables
- **Build Output**: `dist/index.cjs` (server) and `dist/public/` (client static files)

### Data Layer
- **Database**: PostgreSQL (required — `DATABASE_URL` environment variable)
- **ORM**: Drizzle ORM with drizzle-kit for migrations
- **Schema**: Defined in `shared/schema.ts` — approximately 19+ tables covering users, client accounts, client applications, shipments, shipment rate quotes, invoices, payments, pricing rules, pricing tiers, audit logs, roles, permissions, user roles, role permissions, integration logs, webhook events, client user permissions, policies, and idempotency records
- **Storage Pattern**: `IStorage` interface implemented by `DatabaseStorage` class in `server/storage.ts`, providing a clean abstraction over all database operations
- **Migrations**: Run via `npm run db:push` (drizzle-kit push)

### Authentication & Authorization
- Session-based auth with secure cookies (no JWT — switched from original spec to sessions)
- Two user types: `admin` and `client`
- RBAC with database-backed roles and permissions tables
- Client-level granular permissions: `view_shipments`, `create_shipments`, `view_invoices`, `view_payments`, `make_payments`, `manage_users`
- Primary contact concept for client accounts (has full access)
- Middleware functions: `requireAuth`, `requireAdmin`, `requireClient`, `requirePrimaryContact`, `requireClientPermission`
- Default admin account seeded on first run (username: `admin`, password: `admin123`)

### Carrier Integration Architecture
- **Adapter Pattern**: `CarrierAdapter` interface with implementations per carrier (FedEx first)
- **Flow**: Controller → ShipmentsService → CarrierService (router) → CarrierAdapter → FedEx API
- **FedEx**: Address validation, postal code validation, service availability, rate discovery, transit times, shipment creation
- **Configuration**: All credentials via environment variables (`FEDEX_CLIENT_ID`, `FEDEX_CLIENT_SECRET`, `FEDEX_ACCOUNT_NUMBER`, etc.)

### Shipment Creation Flow
A 7-step multi-step process:
1. Shipment type selection (domestic/inbound/outbound)
2. Sender details
3. Recipient details
4. Package details (weight, dimensions)
5. Rate discovery with admin margin application
6. Payment (Moyasar integration)
7. Confirmation

### Key Commands
- `npm run dev` — Start development server with hot reload
- `npm run build` — Build for production (client + server)
- `npm start` — Run production build
- `npm run db:push` — Push schema changes to database
- `npm run check` — TypeScript type checking

### Testing
- **Framework**: Vitest with supertest for API testing
- **Test Files**: `tests/` directory with separate files for auth, admin API, client API, security, storage, and schema tests
- **Setup**: `tests/setup.ts` mocks logger and email services
- **Run**: Standard vitest configuration in `vitest.config.ts`

## External Dependencies

### Database
- **PostgreSQL** — Primary data store, required. Connection via `DATABASE_URL` environment variable. Also used for session storage.

### Payment Processing
- **Moyasar** — Primary payment gateway (Saudi Arabia focused). Env vars: `MOYASAR_SECRET_KEY`, `MOYASAR_PUBLISHABLE_KEY`. Uses HTTP Basic Auth.
- **Stripe** — Alternative payment gateway. Env vars: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`.

### Shipping
- **FedEx API** — Carrier integration for rates, labels, tracking. Env vars: `FEDEX_CLIENT_ID`/`FEDEX_API_KEY`, `FEDEX_CLIENT_SECRET`/`FEDEX_SECRET_KEY`, `FEDEX_ACCOUNT_NUMBER`, `FEDEX_WEBHOOK_SECRET`, `FEDEX_BASE_URL`.

### Accounting
- **Zoho Books** — Invoice and customer synchronization with bilingual (Arabic) support. Env vars: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ORGANIZATION_ID`.

### File Storage
- **Google Cloud Storage** — Object storage for file uploads (documents, attachments). Uses `@google-cloud/storage`. Configured via `PUBLIC_OBJECT_SEARCH_PATHS` and `PRIVATE_OBJECT_DIR` environment variables. Presigned URL upload flow.

### Email
- **SMTP (Nodemailer)** — Transactional emails. Env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

### Deployment
- **Target**: Linux server (aaPanel) with PM2 for process management
- **PM2 Config**: `ecosystem.config.js` — cluster mode, max instances, log rotation, graceful shutdown
- All sensitive configuration via environment variables only