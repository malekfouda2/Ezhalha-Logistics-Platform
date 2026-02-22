# Credit / Pay Later Feature

## Overview

The Credit / Pay Later feature allows approved client accounts to create shipments without immediate payment. Instead of paying at the time of shipment creation, a credit invoice is generated with **30-day payment terms**. The system automatically tracks due dates, sends email reminders, and provides management interfaces for both clients and administrators.

---

## How It Works

### For Clients

1. **Create a Shipment**: Complete the standard 7-step shipment creation flow (type, sender, recipient, packages, rate selection).
2. **Choose "Pay Later"**: At the payment step, select the "Credit / Pay Later" option instead of immediate payment.
3. **Shipment is Created**: The shipment is submitted to FedEx for processing and a credit invoice is automatically generated.
4. **30-Day Payment Window**: The client has 30 days from the invoice date to settle the payment.
5. **Email Notifications**: The client receives email reminders as the due date approaches (see Reminder Schedule below).
6. **View & Track**: The client can view all credit invoices, their status, and due dates from the **Credit / Billing** page in the client portal.

### For Administrators

1. **Monitor Credit Invoices**: View all credit invoices across all clients from the **Credit Invoices** page in the admin portal.
2. **View Full Details**: Click "View" on any invoice to see complete information including client details, shipment route, pricing breakdown, and sender/recipient addresses.
3. **Mark as Paid**: When payment is received, mark the invoice as paid to update the shipment payment status.
4. **Cancel Invoices**: Cancel an invoice if needed (e.g., shipment was cancelled).
5. **Filter & Search**: Filter invoices by status (Unpaid, Overdue, Paid, Cancelled).

---

## Invoice Statuses

| Status | Description |
|--------|-------------|
| **UNPAID** | Invoice has been created and payment is pending. This is the default status. |
| **OVERDUE** | The 30-day payment period has passed without payment. Automatically set by the system. |
| **PAID** | Payment has been received and confirmed by an administrator. |
| **CANCELLED** | Invoice has been cancelled by an administrator. |

---

## Email Reminder Schedule

The system sends up to **6 email reminders** on the following schedule:

| Reminder # | Timing | Description |
|------------|--------|-------------|
| 1 | 7 days before due date | First reminder - payment due soon |
| 2 | 1 day before due date | Urgent reminder - payment due tomorrow |
| 3 | On the due date | Final notice - payment due today |
| 4 | 3 days after due date | First overdue notice |
| 5 | 6 days after due date | Second overdue notice |
| 6 | 9 days after due date | Final overdue notice |

- Reminders are processed by an hourly background scheduler.
- Each reminder email is sent to the client's registered email address.
- Admin notification emails are also sent (if configured via `ADMIN_NOTIFICATION_EMAILS` or `ADMIN_EMAIL` environment variable).
- After 6 reminders, the system stops sending automated emails.

---

## Client Portal - Credit / Billing Page

**Route**: `/client/billing`

**Features**:
- Summary cards showing total outstanding amount, total credit invoices, and overdue count
- Tab-based filtering: All, Unpaid, Overdue, Paid, Cancelled
- Invoice table with columns: Shipment (tracking #), Route (sender city to recipient city), Amount (SAR), Status, Due Date, Time Left
- Detail dialog showing full invoice and shipment information
- "Days left" or "Days overdue" countdown for active invoices

**Required Permission**: `view_invoices`

---

## Admin Portal - Credit Invoices Page

**Route**: `/admin/credit-invoices`

**Features**:
- Summary cards: Total Invoices, Outstanding Amount, Unpaid count, Overdue count
- Status filter dropdown
- Invoice table with columns: Client (name, account #, email), Shipment (tracking #, service type), Route (sender to recipient with cities/countries), Amount, Status (with days remaining/overdue), Due Date (with issue date), Reminders (count and last sent date), Actions
- **View Detail Dialog** showing:
  - Invoice Info: Amount, issued date, due date, paid date, reminders sent, last/next reminder dates
  - Client Info: Name, account number, account type, company name, email, phone, country
  - Shipment Info: Tracking numbers, type, service, carrier, packages, weight, shipment status, payment method/status
  - Pricing: Base rate, margin, final price
  - Full sender and recipient addresses (name, street, city, postal code, country, phone)
- Mark as Paid and Cancel actions with confirmation dialogs

---

## API Endpoints

### Client Endpoints

| Method | Endpoint | Description | Required Permission |
|--------|----------|-------------|-------------------|
| POST | `/api/client/shipments/:id/pay-later` | Create a credit invoice for a shipment | `create_shipments` |
| GET | `/api/client/credit-invoices` | List client's credit invoices | `view_invoices` |
| GET | `/api/client/credit-invoices/:id` | Get a single credit invoice | `view_invoices` |

**Query Parameters for listing**:
- `status` (optional): Filter by status (UNPAID, OVERDUE, PAID, CANCELLED)

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/credit-invoices` | List all credit invoices (paginated) |
| GET | `/api/admin/credit-invoices/:id` | Get a single credit invoice |
| POST | `/api/admin/credit-invoices/:id/mark-paid` | Mark invoice as paid |
| POST | `/api/admin/credit-invoices/:id/cancel` | Cancel an invoice |

**Query Parameters for listing**:
- `page` (default: 1): Page number
- `limit` (default: 25): Items per page
- `status` (optional): Filter by status
- `clientId` (optional): Filter by client account ID
- `overdueOnly` (optional): Set to "true" to show only overdue invoices

---

## Database Schema

### credit_invoices

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR (UUID) | Primary key |
| client_account_id | VARCHAR | References the client account |
| shipment_id | VARCHAR | References the shipment |
| amount | DECIMAL(10,2) | Invoice amount |
| currency | TEXT | Currency code (default: SAR) |
| status | TEXT | UNPAID, OVERDUE, PAID, or CANCELLED |
| issued_at | TIMESTAMP | When the invoice was created |
| due_at | TIMESTAMP | Payment due date (30 days from issue) |
| paid_at | TIMESTAMP | When payment was received (null if unpaid) |
| reminders_sent | INTEGER | Number of reminders sent (max 6) |
| last_reminder_at | TIMESTAMP | When the last reminder was sent |
| next_reminder_at | TIMESTAMP | When the next reminder is scheduled |
| notes | TEXT | Optional notes |
| created_at | TIMESTAMP | Record creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |

### credit_notification_events

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR (UUID) | Primary key |
| client_account_id | VARCHAR | References the client account |
| credit_invoice_id | VARCHAR | References the credit invoice |
| type | TEXT | Event type (INVOICE_CREATED, REMINDER_EMAIL, OVERDUE_REMINDER) |
| sent_at | TIMESTAMP | When the notification was sent |
| meta | TEXT | JSON metadata (reminder number, days info) |
| created_at | TIMESTAMP | Record creation timestamp |

---

## Flow Diagram

```
Client creates shipment
        |
        v
Selects "Pay Later" at payment step
        |
        v
POST /api/client/shipments/:id/pay-later
        |
        +---> Credit invoice created (status: UNPAID, due: +30 days)
        +---> Shipment sent to FedEx for processing
        +---> Shipment status set to "credit_pending" then "created"
        +---> Email notification sent to client + admin
        +---> Audit log recorded
        |
        v
  Hourly Reminder Scheduler
        |
        +---> Checks for overdue invoices (marks status OVERDUE)
        +---> Sends reminders per schedule (7 days before, 1 day, due date, then every 3 days overdue)
        +---> Logs notification events
        |
        v
  Admin marks as PAID or CANCELLED
        |
        +---> Updates invoice status
        +---> Updates shipment payment status
        +---> Audit log recorded
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ADMIN_NOTIFICATION_EMAILS` | Comma-separated admin emails to receive credit invoice notifications |
| `ADMIN_EMAIL` | Fallback admin email if `ADMIN_NOTIFICATION_EMAILS` is not set |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | SMTP configuration for sending reminder emails |

---

## Security & Permissions

- **Client access**: Requires authenticated client user with appropriate permissions (`create_shipments` for creating, `view_invoices` for viewing).
- **Admin access**: Requires authenticated admin user.
- **Account isolation**: Clients can only view their own credit invoices.
- **Duplicate prevention**: Only one credit invoice can exist per shipment.
- **State validation**: Pay Later is only available for shipments in `payment_pending` status.
- **Audit trail**: All pay-later selections, mark-as-paid, and cancellation actions are logged in the audit log.
