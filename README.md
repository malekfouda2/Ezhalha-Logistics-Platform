# ezhalha - Enterprise Logistics Platform

## Overview

ezhalha is a production-ready enterprise logistics management platform for B2B shipping. It features dual portals: an Admin Portal for platform management and a Client Portal for customers to handle shipments, invoices, and payments. The platform prioritizes security, scalability, and auditability, offering a modern, data-rich interface. Key capabilities include comprehensive shipment management, client onboarding with tiered profiles and dynamic pricing, robust RBAC for both admins and clients, and extensive integration monitoring. It supports bilingual content (English and Arabic) and integrates with various external services for payments, shipping, and accounting.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query v5 (server state)
- **UI Components**: shadcn/ui with Radix UI primitives
- **Styling**: Tailwind CSS
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Vite
- **Design Pattern**: Dual-layout architecture (`AdminLayout` and `ClientLayout`) with fixed sidebar navigation and shared components. Navigation dynamically filters based on user permissions.
- **Key Features**: Public pages (login, application, policy viewer), Admin portal with dashboards, client management, pricing, audit logs, and RBAC. Client portal with dashboards, multi-step shipment creation, invoice/payment management, and team member management.

### Backend
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js (RESTful API)
- **Session Management**: Express-session with PostgreSQL session store (production)
- **Security**: Bcrypt password hashing, full RBAC, secure session-based authentication, Helmet security headers, rate limiting, brute-force protection, audit trails, HTML sanitization, and Zod validation for API inputs.
- **API Features**: Idempotency for POST endpoints, health checks, branding configuration.
- **Core Services**: Centralized logging (Winston), email notifications (Nodemailer), and idempotency record management.
- **Bilingual Support**: Admin portal allows editing client information with Arabic translations, syncing Arabic data to Zoho Books. RTL input is supported for Arabic fields.
- **Shipment Creation Flow**: A 7-step process covering shipment type selection, sender/recipient details, package details, rate discovery with margin application, payment (Moyasar integration), and confirmation. Supports Domestic, Inbound, and Outbound shipment types, including KSA-specific short addresses.
- **Policy Pages**: Dynamic policy pages managed via the admin dashboard, publicly accessible, with publish/draft functionality and HTML sanitization.

### Data Layer
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL
- **Schema**: Defined in `shared/schema.ts`, including 19 tables for users, client accounts, applications, pricing, shipments, invoices, payments, RBAC, logs, and policies.
- **Storage**: `IStorage` interface with `DatabaseStorage` implementation for all CRUD operations.

### Authentication & Authorization
- Session-based authentication with secure cookies.
- Role-based access control (RBAC) supporting `admin` and `client` user types.
- Middleware for authentication, admin/client specific access, primary contact verification, and granular client permissions.
- Default admin account is seeded on first run.

### Branding System
- Brand color: `#fe5200` (vibrant orange).
- Logo at `/assets/branding/logo.png`.
- Light/dark mode toggle with consistent theming via CSS custom properties.

## External Dependencies

### Database
- **PostgreSQL**: Primary database.

### Integrations
- **FedEx**: API adapter for address validation, rate quotes, shipment creation, tracking, and webhook handling.
- **Moyasar**: Payment gateway for payment creation, verification, and webhook handling (HMAC-SHA256). Supports redirect-based 3DS payments.
- **Zoho Books**: API service for customer sync, invoice creation, and bilingual field management.
- **Google Cloud Storage**: Object storage for file uploads (e.g., client application documents).
- **Stripe**: (Legacy) Integration maintained for backwards compatibility.

### Libraries
- **@tanstack/react-query**: Server state management.
- **@radix-ui/**: Accessible UI primitives.
- **react-hook-form**: Form state management.
- **zod**: Schema validation.
- **express**: HTTP server framework.
- **express-session**: Session management.
- **helmet**: Security headers.
- **express-rate-limit**: Request rate limiting.
- **bcrypt**: Password hashing.
- **sanitize-html**: HTML sanitization.
- **nodemailer**: Email sending.
- **winston**: Structured logging.
- **@google-cloud/storage**: Object storage client.