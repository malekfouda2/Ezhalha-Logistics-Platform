# ezhalha - Enterprise Logistics Platform

## Overview

ezhalha is a production-ready enterprise logistics management platform designed for B2B shipping operations. The application provides dual portals - an Admin Portal for platform management and a Client Portal for customers to manage their shipments, invoices, and payments. The platform emphasizes security, scalability, and auditability with a modern, data-dense interface.

**Key Features:**
- Dual portal system (Admin and Client)
- Shipment tracking and management with status updates and cancellation
- Client application and onboarding workflow
- Invoice and payment processing with PDF generation
- Tiered client profiles (Regular, Mid-Level, VIP) with discount benefits
- Dynamic pricing rules with profile-based margins
- Comprehensive audit logging with admin viewing

**Security:**
- Bcrypt password hashing (10 salt rounds)
- RBAC tables prepared for future granular permissions
- Session-based authentication with secure cookies
- Audit trail for all admin/client actions

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
- `/api/auth/*` - Authentication endpoints
- `/api/admin/*` - Admin-only endpoints
- `/api/client/*` - Client-facing endpoints
- `/api/config/branding` - Branding configuration

### Data Layer
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL
- **Schema Location**: `shared/schema.ts` contains all table definitions and Zod validation schemas
- **Migrations**: Managed via Drizzle Kit (`drizzle-kit push`)

**Key Entities:**
- Users (admin/client roles)
- Client Accounts
- Client Applications (onboarding workflow)
- Shipments
- Invoices
- Payments
- Pricing Rules
- Audit Logs

### Authentication & Authorization
- Session-based authentication with cookies
- Role-based access control (RBAC) with `admin` and `client` user types
- Middleware functions: `requireAuth`, `requireAdmin`, `requireClient`
- Protected routes redirect based on user type

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