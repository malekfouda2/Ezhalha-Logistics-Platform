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

### Stripe Webhooks
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
