# ezhalha API Documentation

Base URL: `https://your-domain.com/api`

## Authentication

All API requests (except public endpoints) require session-based authentication. Login first to establish a session.

### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "your_username",
  "password": "your_password"
}
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "username": "client1",
    "email": "client@example.com",
    "userType": "client",
    "clientAccountId": "uuid"
  }
}
```

### Logout
```http
POST /api/auth/logout
```

### Get Current User
```http
GET /api/auth/me
```

---

## Public Endpoints

### Branding Configuration
```http
GET /api/config/branding
```

**Response:**
```json
{
  "appName": "ezhalha",
  "primaryColor": "#fe5200",
  "logoUrl": "/assets/branding/logo.png"
}
```

### Submit Application
```http
POST /api/applications
Content-Type: application/json
Idempotency-Key: unique-request-id (optional)

{
  "name": "John Doe",
  "email": "john@company.com",
  "phone": "+1234567890",
  "country": "Saudi Arabia",
  "companyName": "Company Inc"
}
```

### Health Check
```http
GET /api/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-11T12:00:00.000Z",
  "version": "1.0.0",
  "service": "ezhalha"
}
```

---

## Client Endpoints

All client endpoints require authentication with a client user account.

### Dashboard Stats
```http
GET /api/client/stats
```

**Response:**
```json
{
  "totalShipments": 10,
  "shipmentsInTransit": 3,
  "shipmentsDelivered": 6,
  "pendingInvoices": 2,
  "totalSpent": 1500.00,
  "accountProfile": "mid_level"
}
```

### Account Information
```http
GET /api/client/account
```

### Update Account
```http
PATCH /api/client/account
Content-Type: application/json

{
  "name": "Updated Name",
  "phone": "+9876543210"
}
```

### Shipments

#### List Shipments
```http
GET /api/client/shipments
```

#### Create Shipment
```http
POST /api/client/shipments
Content-Type: application/json
Idempotency-Key: unique-request-id (optional)

{
  "senderName": "Sender Inc",
  "senderAddress": "123 Sender St",
  "senderCity": "Riyadh",
  "senderCountry": "Saudi Arabia",
  "senderPhone": "+966123456789",
  "recipientName": "Recipient LLC",
  "recipientAddress": "456 Recipient Ave",
  "recipientCity": "Dubai",
  "recipientCountry": "UAE",
  "recipientPhone": "+971987654321",
  "weight": "5.5",
  "dimensions": "30x20x15",
  "description": "Electronic equipment",
  "serviceType": "express"
}
```

**Response:**
```json
{
  "id": "uuid",
  "trackingNumber": "EZH-20260111-XXXX",
  "status": "processing",
  "finalPrice": "45.50",
  "createdAt": "2026-01-11T12:00:00.000Z"
}
```

#### Get Shipment Details
```http
GET /api/client/shipments/:id
```

#### Cancel Shipment
```http
POST /api/client/shipments/:id/cancel
```

### Invoices

#### List Invoices
```http
GET /api/client/invoices
```

#### Download Invoice PDF
```http
GET /api/client/invoices/:id/download
```

### Payments

#### List Payments
```http
GET /api/client/payments
```

---

## Shipment Creation Flow

The shipment creation follows a multi-step flow with integrated Moyasar payment processing.

### Step 1: Rate Discovery
Get shipping quotes from carriers with final prices (margins applied server-side).

```http
POST /api/client/shipments/rates
Content-Type: application/json

{
  "senderName": "Sender Inc",
  "senderAddress": "123 Sender St",
  "senderCity": "Riyadh",
  "senderPostalCode": "12345",
  "senderCountry": "SA",
  "senderPhone": "+966123456789",
  "recipientName": "Recipient LLC",
  "recipientAddress": "456 Recipient Ave",
  "recipientCity": "Dubai",
  "recipientPostalCode": "54321",
  "recipientCountry": "AE",
  "recipientPhone": "+971987654321",
  "weight": "5.5",
  "weightUnit": "KG",
  "length": "30",
  "width": "20",
  "height": "15",
  "dimensionUnit": "CM",
  "packageType": "YOUR_PACKAGING",
  "description": "Electronic equipment"
}
```

**Response:**
```json
{
  "quotes": [
    {
      "id": "uuid",
      "carrier": "FedEx",
      "serviceType": "FEDEX_INTERNATIONAL_PRIORITY",
      "serviceName": "FedEx International Priority",
      "finalPrice": "125.50",
      "currency": "SAR",
      "estimatedDays": 3,
      "expiresAt": "2026-01-11T12:30:00.000Z"
    }
  ]
}
```

**Note:** Quotes expire after 30 minutes. Base carrier rates are never exposed to clients.

### Step 2: Checkout
Create a payment intent with the selected quote.

```http
POST /api/client/shipments/checkout
Content-Type: application/json
Idempotency-Key: unique-request-id (optional)

{
  "quoteId": "uuid"
}
```

**Response (Moyasar configured):**
```json
{
  "shipmentId": "uuid",
  "paymentIntentId": "mpy_abc123",
  "transactionUrl": "https://api.moyasar.com/v1/payments/mpy_abc123/form",
  "amount": 12550,
  "currency": "SAR"
}
```

**Response (Demo mode):**
```json
{
  "shipmentId": "uuid",
  "paymentIntentId": "mpy_mock_abc123",
  "transactionUrl": null,
  "amount": 12550,
  "currency": "SAR",
  "demoMode": true
}
```

### Step 3: Payment
For production: User is redirected to Moyasar's secure payment page.
For demo mode: Payment can be confirmed directly.

### Step 4: Confirmation
After payment, confirm the shipment to create the carrier booking.

```http
POST /api/client/shipments/confirm
Content-Type: application/json

{
  "shipmentId": "uuid",
  "paymentIntentId": "mpy_abc123"
}
```

**Note:** If `paymentIntentId` is omitted, the server uses the stored payment ID from the shipment record.

**Response:**
```json
{
  "shipment": {
    "id": "uuid",
    "trackingNumber": "EZH-20260111-XXXX",
    "carrierTrackingNumber": "FEDEX123456789",
    "status": "created",
    "paymentStatus": "paid",
    "labelUrl": "https://..."
  }
}
```

---

## Moyasar Payment Endpoints

### Payment Callback
Handles redirect after user completes payment on Moyasar's page.

```http
GET /api/payments/moyasar/callback?id=mpy_abc123&status=paid
```

This endpoint:
1. Verifies payment status with Moyasar API (never trusts URL parameters)
2. Redirects user to appropriate page based on verified status

**Redirect Destinations:**
- Success: `/client/create-shipment?shipmentId=uuid&paymentStatus=success`
- Failed: `/client/create-shipment?shipmentId=uuid&paymentStatus=failed&message=...`
- Pending: `/client/create-shipment?shipmentId=uuid&paymentStatus=pending`

### Moyasar Webhook
Receives server-to-server payment notifications from Moyasar.

```http
POST /api/webhooks/moyasar
X-Moyasar-Signature: <hmac-sha256-signature>
Content-Type: application/json

{
  "id": "mpy_abc123",
  "type": "payment_paid",
  "data": {
    "id": "mpy_abc123",
    "status": "paid",
    "amount": 12550,
    "currency": "SAR"
  }
}
```

**Response:**
```json
{
  "received": true,
  "eventId": "uuid"
}
```

**Security:** Webhook signature is validated using HMAC-SHA256 with `MOYASAR_WEBHOOK_SECRET`. In development, signature validation is skipped if the secret is not configured.

---

## Admin Endpoints

All admin endpoints require authentication with an admin user account.

### Dashboard Stats
```http
GET /api/admin/stats
```

**Response:**
```json
{
  "totalClients": 50,
  "activeClients": 45,
  "pendingApplications": 5,
  "totalShipments": 500,
  "shipmentsInTransit": 25,
  "shipmentsDelivered": 450,
  "totalRevenue": 75000.00,
  "monthlyRevenue": 15000.00
}
```

### Applications

#### List All Applications
```http
GET /api/admin/applications
```

#### List Pending Applications
```http
GET /api/admin/applications/pending
```

#### Review Application
```http
POST /api/admin/applications/:id/review
Content-Type: application/json

{
  "action": "approve",
  "profile": "regular",
  "notes": "Verified business documents"
}
```

Or reject:
```json
{
  "action": "reject",
  "notes": "Incomplete documentation"
}
```

### Clients

#### List All Clients
```http
GET /api/admin/clients
```

#### Create Client
```http
POST /api/admin/clients
Content-Type: application/json

{
  "name": "New Client",
  "email": "newclient@example.com",
  "phone": "+1234567890",
  "country": "Saudi Arabia",
  "companyName": "New Client Inc",
  "profile": "regular"
}
```

#### Get Client Details
```http
GET /api/admin/clients/:id
```

#### Update Client
```http
PATCH /api/admin/clients/:id
Content-Type: application/json

{
  "profile": "vip",
  "isActive": true
}
```

#### Activate/Deactivate Client
```http
POST /api/admin/clients/:id/activate
POST /api/admin/clients/:id/deactivate
```

### Shipments (Admin)

#### List All Shipments
```http
GET /api/admin/shipments
```

#### Update Shipment Status
```http
PATCH /api/admin/shipments/:id
Content-Type: application/json

{
  "status": "in_transit"
}
```

### Pricing Rules

#### List Pricing Rules
```http
GET /api/admin/pricing-rules
```

#### Update Pricing Rule
```http
PATCH /api/admin/pricing-rules/:id
Content-Type: application/json

{
  "marginPercentage": "25.00"
}
```

### Audit Logs

#### List Audit Logs
```http
GET /api/admin/audit-logs
```

**Response:**
```json
[
  {
    "id": "uuid",
    "userId": "uuid",
    "action": "approve_application",
    "entityType": "client_application",
    "entityId": "uuid",
    "details": "Approved application for client@example.com",
    "ipAddress": "192.168.1.1",
    "createdAt": "2026-01-11T12:00:00.000Z"
  }
]
```

---

## Webhook Endpoints

### FedEx Webhooks
```http
POST /api/webhooks/fedex
X-FedEx-Signature: <hmac-signature>
Content-Type: application/json

{
  "eventType": "SHIPMENT_DELIVERED",
  "trackingNumber": "FEDEX123456",
  "timestamp": "2026-01-11T12:00:00.000Z"
}
```

### Moyasar Webhooks
```http
POST /api/webhooks/moyasar
X-Moyasar-Signature: <hmac-sha256-signature>
Content-Type: application/json

{
  "id": "evt_abc123",
  "type": "payment_paid",
  "data": {
    "id": "mpy_abc123",
    "status": "paid",
    "amount": 12550,
    "currency": "SAR",
    "description": "Shipment payment"
  }
}
```

**Signature Validation:** The webhook handler validates the `X-Moyasar-Signature` header using HMAC-SHA256 with the `MOYASAR_WEBHOOK_SECRET` environment variable.

### Stripe Webhooks (Legacy)
Kept for backwards compatibility with existing integrations.

```http
POST /api/webhooks/stripe
Stripe-Signature: t=timestamp,v1=signature
Content-Type: application/json

{
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_xxx",
      "amount": 5000
    }
  }
}
```

---

## Idempotency

For POST requests that create resources, you can include an `Idempotency-Key` header to prevent duplicate operations:

```http
POST /api/client/shipments
Idempotency-Key: unique-request-id-123
Content-Type: application/json
```

If the same idempotency key is used within 24 hours, the cached response will be returned instead of creating a duplicate resource.

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message description"
}
```

Common HTTP status codes:
- `400` - Bad Request (validation error)
- `401` - Unauthorized (not logged in)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

---

## Rate Limiting

- General endpoints: 100 requests per 15 minutes
- Authentication endpoints: 5 requests per 15 minutes

Rate limit headers are included in responses:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

---

## Environment Variables

### Required
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Secret for session encryption |

### Payment Gateway (Moyasar)
| Variable | Description |
|----------|-------------|
| `MOYASAR_SECRET_KEY` | Moyasar API secret key (required for production) |
| `MOYASAR_PUBLISHABLE_KEY` | Moyasar publishable key (for frontend display) |
| `MOYASAR_WEBHOOK_SECRET` | Webhook signature secret (required for production) |

**Note:** If Moyasar keys are not configured, the system runs in demo mode with mock payments.

### Email (SMTP)
| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP server port (default: 587) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASSWORD` | SMTP password |
| `SMTP_FROM` | From email address |

### Carrier Integrations
| Variable | Description |
|----------|-------------|
| `FEDEX_API_KEY` | FedEx API key |
| `FEDEX_SECRET_KEY` | FedEx secret key |
| `FEDEX_ACCOUNT_NUMBER` | FedEx account number |
| `FEDEX_WEBHOOK_SECRET` | FedEx webhook signature secret |

### Invoice Sync
| Variable | Description |
|----------|-------------|
| `ZOHO_CLIENT_ID` | Zoho Books OAuth client ID |
| `ZOHO_CLIENT_SECRET` | Zoho Books OAuth client secret |
| `ZOHO_REFRESH_TOKEN` | Zoho Books OAuth refresh token |
| `ZOHO_ORGANIZATION_ID` | Zoho Books organization ID |

### Legacy (Backwards Compatibility)
| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature secret |
