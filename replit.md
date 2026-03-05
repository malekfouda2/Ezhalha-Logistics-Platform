# ezhalha - Enterprise Logistics Platform

## Overview

ezhalha is a production-ready enterprise logistics management platform for B2B shipping, featuring distinct Admin and Client portals. The platform streamlines logistics operations, offering comprehensive management for client accounts, shipments, invoicing, payments, and integrations for administrators, while providing clients with tools for shipment creation, invoice management, and sub-user administration. It integrates with major shipping carriers and financial services, supporting bilingual data entry (English/Arabic) with RTL capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript and Vite.
- **Routing**: Wouter for client-side navigation.
- **State Management**: TanStack React Query for server state; React context for global state.
- **UI Components**: shadcn/ui built on Radix UI primitives, styled with Tailwind CSS.
- **Form Handling**: React Hook Form with Zod for validation.
- **Layout**: Dual-layout architecture (`AdminLayout`, `ClientLayout`) with dynamic navigation filtering based on user permissions.

### Backend
- **Runtime**: Node.js with TypeScript (Express.js framework).
- **Security**: Helmet, bcrypt, express-rate-limit, HTML sanitization, Zod input validation.
- **API Features**: RESTful design, idempotency keys, health checks, branding configuration.
- **Logging**: Winston for structured logging with daily rotation.
- **Email**: Nodemailer for transactional emails.

### Data Layer
- **Database**: PostgreSQL.
- **ORM**: Drizzle ORM with drizzle-kit for migrations.
- **Schema**: Comprehensive schema covering users, shipments, invoices, payments, pricing, and audit logs.
- **Storage Pattern**: `IStorage` interface for database operations abstraction.

### Authentication & Authorization
- **Mechanism**: Session-based authentication with secure cookies.
- **User Types**: `admin` and `client`.
- **RBAC**: Database-backed roles and permissions.
- **Client Permissions**: Granular permissions for client users (e.g., `view_shipments`, `create_shipments`).

### Carrier Integration Architecture
- **Pattern**: Adapter pattern (`CarrierAdapter`) for integrating various carriers (e.g., FedEx).
- **Features**: Address/postal validation, service availability, rate discovery, shipment creation, international customs support, carrier error tracking and retry mechanisms.
- **Configuration**: Dynamic and environment-variable driven for flexibility and production hardening.

### Address Validation
- **File**: `server/validation/shippingAddress.ts` — shared server-side address validator.
- **Constants**: `POSTAL_CODE_EXEMPT_COUNTRIES` (AE, QA, BH, OM, etc.), `STATE_REQUIRED_COUNTRIES` (US, CA).
- **Gate**: `validateShippingAddresses()` called in all shipment endpoints (rates, confirm, pay-later, admin retry) before any FedEx API call.
- **Behavior**: Returns 400 with per-field error messages for missing/invalid fields. Postal code required for all non-exempt countries.

### FedEx Label Storage & Download
- **Schema**: `carrierLabelBase64` (text), `carrierLabelMimeType` (default "application/pdf"), `carrierLabelFormat` columns on `shipments` table.
- **Storage**: Label base64 data persisted on successful FedEx `createShipment` (confirm, pay-later, admin retry handlers).
- **Endpoints**: `GET /api/client/shipments/:id/label.pdf` (client auth + ownership), `GET /api/admin/shipments/:id/label.pdf` (admin auth) — decode base64 and stream PDF.
- **UI**: "Download Label (PDF)" button in both admin and client shipment detail sheets when carrier status is "created".
- **Pay-Later Error Handling**: Returns 502 with `carrierErrorCode`/`carrierErrorMessage` on FedEx failure (not silent 200).

### Credit Access Request Flow
- **Process**: Clients request credit/pay-later access, which admins review and approve/reject.
- **Control**: `creditEnabled` flag on client accounts and specific admin/client pages for management and requests.

### HS Code Suggestion Feature
- **Purpose**: Assists with Harmonized System (HS) code lookup for international shipments.
- **Mechanism**: Uses client history, FedEx Global Trade API, and category-based fallbacks for suggestions with confidence levels.

### Shipment Creation Flow
- **Process**: A 7-step multi-step flow covering shipment type, sender/recipient details, package/item specifics, rate discovery, payment, and confirmation.

### Email Templates
- **Management**: Admin-managed, database-stored email templates with `{{variable}}` placeholders.
- **Features**: HTML editor, live preview, active/inactive toggle, and reset-to-default options.

### System Logs (Bugs & Errors)
- **Page**: `/admin/system-logs` — Admin page for monitoring system errors and warnings.
- **Database Table**: `system_logs` — Persists errors from `logError()` calls with level, message, source, stack trace, metadata, endpoint, user, and IP.
- **Features**: Filterable by level (error/warn/info), source (FedEx/Zoho/carrier/auth/system/etc.), and resolution status. Click to view full stack trace and metadata. Admins can mark logs as resolved.
- **Auto-Capture**: All `logError()` calls automatically persist to database via Winston logger integration.

### Shipment Item Sheet
- **Pattern**: Item entry in shipment creation (step 4) uses a Sheet sidebar instead of inline forms.
- **Currency**: Each item has its own currency field (SAR default, supports 17 currencies).
- **Flow**: Summary list of items with Add/Edit/Delete → Sheet sidebar opens for full item form including HS code lookup.

## External Dependencies

### Database
- **PostgreSQL** — Primary data store and session storage.

### Payment Processing
- **Moyasar** — Primary payment gateway (Saudi Arabia focused).
- **Stripe** — Alternative payment gateway.

### Shipping
- **FedEx API** — Carrier integration for rates, labels, and tracking.

### Accounting
- **Zoho Books** — Invoice and customer synchronization.

### File Storage
- **Google Cloud Storage** — Object storage for file uploads.

### Email
- **SMTP (Nodemailer)** — Transactional email sending.