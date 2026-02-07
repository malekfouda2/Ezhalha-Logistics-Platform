# ezhalha - Enterprise Logistics Platform

## Overview

ezhalha is a production-ready enterprise logistics management platform designed for B2B shipping operations. The application provides dual portals - an Admin Portal for platform management and a Client Portal for customers to manage their shipments, invoices, and payments. The platform emphasizes security, scalability, and auditability with a modern, data-dense interface.

**Key Features:**
- Dual portal system (Admin and Client)
- Shipment tracking and management with status updates and cancellation
- Client application and onboarding workflow (supports Company and Individual account types)
- Invoice and payment processing with PDF generation
- Tiered client profiles (Regular, Mid-Level, VIP) with discount benefits
- Dynamic tiered pricing rules with profile-based margins (multiple tiers per profile based on shipment value)
- Comprehensive audit logging with admin viewing
- RBAC management (roles, permissions, user-role assignments)
- Client-level RBAC (team member management with granular permissions)
- Integration monitoring dashboard (FedEx, Moyasar, Zoho)
- Webhook event tracking and status

**Client User Management:**
- Primary contacts can create and manage team members
- Granular permissions: view_shipments, create_shipments, view_invoices, view_payments, make_payments, manage_users
- Primary contacts automatically have all permissions
- Navigation dynamically filtered based on user permissions
- Permission enforcement on all client API endpoints

**Security:**
- Bcrypt password hashing (10 salt rounds)
- Full RBAC implementation with roles, permissions, user-roles, role-permissions
- Session-based authentication with secure cookies (sameSite: lax for CSRF protection)
- PostgreSQL session store in production (connect-pg-simple), MemoryStore in development
- Helmet security headers with Content Security Policy
- Rate limiting: 100 req/15min general, 5 req/15min for auth endpoints
- Brute-force protection: 5 max login attempts, 15min lockout per IP/username
- Forced password change on first login (mustChangePassword flag)
- Audit trail for all admin/client actions

**Bilingual Support (Arabic as Secondary Language):**
- Admin can edit client information with Arabic translations
- Arabic fields stored in client_accounts: nameAr, companyNameAr, nationalAddress fields with Ar suffix
- Admin edit client page at /admin/clients/:id/edit with two tabs:
  - Primary Language (English): All standard client fields
  - Secondary Language (Arabic): Arabic versions for Zoho Books
- Arabic data synced to Zoho Books via custom_fields
- Right-to-left (RTL) input direction for Arabic text fields

**Webhooks & Integrations:**
- FedEx webhook handler with HMAC signature validation
- Moyasar payment gateway with redirect-based payment flow
- Moyasar webhook handler for payment status updates
- Stripe webhook handler (legacy, kept for backwards compatibility)
- Zoho Books customer sync with bilingual support (English + Arabic custom fields)

**Shipment Creation Flow (7 Steps):**
1. Shipment Type: Client selects direction (domestic/inbound/outbound) and carrier (FedEx, more coming)
2. Sender Details: Enter pickup address with optional short address (Arabic) for KSA shipments
3. Recipient Details: Enter delivery address with optional short address (Arabic) for KSA shipments
4. Package Details: Specify weight, dimensions, number of packages, and package type
5. Rate Discovery: Get quotes from selected carrier with final prices (margins applied server-side)
6. Payment: Client is redirected to Moyasar's secure payment page (or demo mode simulation)
7. Confirmation: Server verifies payment and creates carrier shipment

**Shipment Types:**
- Domestic: Shipping within Saudi Arabia (KSA to KSA)
- Inbound: Shipping into Saudi Arabia from abroad
- Outbound: Shipping from Saudi Arabia to abroad

**Short Address Field:**
- Required for KSA addresses (displayed when sender or recipient is in KSA)
- Location code format (e.g. RCTB4359)

**Default Shipping Address:**
- Clients provide a default shipping address during account application
- Address includes: contact name, phone, country, city, postal code, address lines, and short address (for KSA)
- Auto-population based on shipment type:
  - Inbound: Recipient is pre-filled with client's default shipping address
  - Outbound: Sender is pre-filled with client's default shipping address
  - Domestic: Both addresses pre-filled with client's address (country locked to SA)
- Addresses can be edited during shipment creation
- Visual indicator shows when addresses are pre-filled from account

- Quote expiration: 30 minutes from creation, enforced server-side
- Clients never see base carrier rates, only final prices with margin
- Demo mode: Works without Moyasar configuration for development/testing

**Moyasar Integration:**
- API Base URL: https://api.moyasar.com/v1
- Authentication: HTTP Basic Auth (secret key as username, empty password)
- Payment flow: Redirect-based with 3DS support
- Callback URL: /api/payments/moyasar/callback
- Webhook URL: /api/webhooks/moyasar
- Webhook signature validation: HMAC-SHA256
- Environment variables: MOYASAR_SECRET_KEY, MOYASAR_PUBLISHABLE_KEY, MOYASAR_WEBHOOK_SECRET
- Demo mode: Works without Moyasar configuration (uses mock payments with mpy_mock_ prefix)
- Security: Payment status always verified server-side via Moyasar API (never trusts client-side status)

**Logging & Monitoring:**
- Winston logger with daily rotating file transports
- Application logs: ./logs/combined-YYYY-MM-DD.log (14 days retention)
- Error logs: ./logs/error-YYYY-MM-DD.log (30 days retention)
- Audit logs: ./logs/audit-YYYY-MM-DD.log (90 days retention)
- All audit actions logged to both database and files

**Email Notifications:**
- Credentials email on client approval (with temporary password)
- Application received confirmation
- Rejection notifications with reason
- Graceful degradation when SMTP unconfigured

**API Features:**
- Idempotency support for POST endpoints (database-backed, works with PM2 cluster)
- 24-hour TTL for idempotency records
- Use Idempotency-Key header for duplicate prevention

**Deployment:**
- PM2 ecosystem config with cluster mode
- Nginx config with SSL and rate limiting
- Health check endpoint at /api/health
- .env.example with all required variables
- Log directories auto-created at startup

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS with CSS custom properties for theming
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Vite

**Design Pattern**: The frontend uses a dual-layout architecture:
- `AdminLayout`: Fixed sidebar navigation (w-64) for admin users
- `ClientLayout`: Horizontal header navigation for client users

Both layouts share common components like `StatCard`, `StatusBadge`, and `ProfileBadge`.

### Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js (not NestJS as originally specified)
- **API Style**: RESTful endpoints under `/api/*`
- **Session Management**: Express-session with MemoryStore (development) or PostgreSQL session store (production)

**Route Structure:**
- `/api/auth/*` - Authentication endpoints (login, logout, check, change-password)
- `/api/admin/*` - Admin-only endpoints
  - Clients: GET/POST /clients, GET/PATCH /clients/:id, GET /clients/:id/users
  - Applications: GET /applications, PATCH /applications/:id
  - Shipments: GET/POST /shipments, PATCH /shipments/:id/status
  - Invoices: GET /invoices, POST /invoices/:id/generate-pdf
  - Payments: GET /payments (with filtering)
  - Pricing: GET/POST/PATCH/DELETE /pricing-rules
  - Audit: GET /audit-logs
  - Integrations: GET /integration-logs, GET /webhook-events
  - RBAC: GET/POST /roles, GET/POST /permissions, POST/DELETE user-role assignments
- `/api/client/*` - Client-facing endpoints
  - Account: GET/PATCH /account
  - Shipments: GET /shipments, GET /shipments/:id, POST /shipments (legacy)
  - New Shipment Flow:
    - POST /shipments/rates - Rate discovery (returns quotes with final prices, no base rates shown)
    - POST /shipments/checkout - Create payment intent with selected quote
    - POST /shipments/confirm - Create carrier shipment after payment
  - Invoices: GET /invoices, GET /invoices/:id/pdf
  - Payments: GET/POST /payments
- `/api/shipments/*` - Carrier integration endpoints
  - POST /validate-address - FedEx address validation
  - POST /validate-postal-code - FedEx postal code validation
  - POST /check-service - FedEx service availability check
  - POST /rates - Get shipping rates
  - GET /:id/track - Track shipment via carrier API
- `/api/config/branding` - Branding configuration
- `/api/payments/moyasar/callback` - Moyasar payment callback handler
- `/api/webhooks/*` - External webhook handlers (FedEx, Moyasar, Stripe legacy, Zoho)

### Data Layer
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL
- **Schema Location**: `shared/schema.ts` contains all table definitions and Zod validation schemas
- **Migrations**: Managed via Drizzle Kit (`drizzle-kit push`)

**Key Entities:**
- Users (admin/client roles, with updatedAt tracking)
- Client Accounts (with soft deletes via deletedAt)
- Client Applications (onboarding workflow)
- Shipments (with carrier info, tracking numbers, payment status)
- Shipment Rate Quotes (for rate discovery, with expiration)
- Invoices (with Zoho sync IDs)
- Payments (with Moyasar payment IDs, Stripe legacy support)
- Pricing Rules (profile-based margins)
- Audit Logs (database + file logging)
- Integration Logs (API call tracking)
- Webhook Events (external webhook processing)
- RBAC: Roles, Permissions, UserRoles, RolePermissions
- Client User Permissions (granular access control for client team members)

### Authentication & Authorization
- Session-based authentication with cookies
- Role-based access control (RBAC) with `admin` and `client` user types
- Middleware functions: `requireAuth`, `requireAdmin`, `requireClient`, `requirePrimaryContact`, `requireClientPermission`
- Protected routes redirect based on user type
- Client routes filtered by permission

### Branding System
- Brand color: `#fe5200` (vibrant orange)
- Logo stored at: `/assets/branding/logo.png`
- Theme toggle between light and dark modes
- CSS custom properties for consistent theming

## External Dependencies

### Database
- **PostgreSQL**: Primary database via `DATABASE_URL` environment variable
- **Drizzle ORM**: Database queries and schema management
- **connect-pg-simple**: PostgreSQL session storage for production

### Frontend Libraries
- **@tanstack/react-query**: Server state management and caching
- **@radix-ui/***: Accessible UI primitives (dialog, dropdown, tooltip, etc.)
- **react-hook-form**: Form state management
- **zod**: Schema validation (shared between frontend and backend via `drizzle-zod`)
- **date-fns**: Date formatting utilities
- **lucide-react**: Icon library
- **embla-carousel-react**: Carousel component
- **recharts**: Charting library (via shadcn/ui chart component)

### Backend Libraries
- **express**: HTTP server framework
- **express-session**: Session management
- **memorystore**: In-memory session store for development

### Build Tools
- **Vite**: Frontend build and development server
- **esbuild**: Backend bundling for production
- **tsx**: TypeScript execution for development

### Development Integrations
- **@replit/vite-plugin-runtime-error-modal**: Error overlay for development
- **@replit/vite-plugin-cartographer**: Replit-specific development tooling