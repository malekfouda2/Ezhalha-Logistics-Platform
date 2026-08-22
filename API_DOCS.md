# ezhalha API Documentation

> **Generated file — do not edit by hand.**
> Produced by `script/generate-openapi.ts` (`npm run openapi`) directly from the Express
> route table, so it cannot drift from the code. To add detail to an endpoint, edit
> `DETAILED_OPERATIONS` in that script and regenerate.
> Machine-readable equivalent: [`docs/openapi.json`](docs/openapi.json).

Covers **306 routes**.

## Contents

- [Base URLs](#base-urls)
- [Authentication](#authentication)
- [Errors](#errors)
- [Conventions](#conventions)
- [The shipment flow](#the-shipment-flow)
- [Endpoints](#endpoints)
- [Schemas](#schemas)

## Base URLs

| Environment | URL |
| --- | --- |
| Staging | `https://staging.ezhalha.co` |
| Production | `https://app.ezhalha.co` |
| Local | `http://localhost:5000` |

## Authentication

Two mechanisms reach the same routes.

**Cookie session — the web SPA.** `POST /api/auth/login` sets an httpOnly,
`sameSite=lax` session cookie.

**Bearer token — native clients.** `POST /api/auth/token` returns a 15-minute access
token plus a rotating refresh token. Send `Authorization: Bearer <accessToken>`. A
bearer request never creates a server session row.

```http
POST /api/auth/token
Content-Type: application/json

{
  "username": "someone@example.com",
  "password": "…",
  "deviceId": "stable-per-install-id",
  "platform": "ios",
  "appVersion": "1.0.0"
}
```

`username` accepts a username, an email, or a phone number. Passwordless login is
`POST /api/auth/otp/request` then `POST /api/auth/token/otp`.

**Refresh rotation.** `POST /api/auth/refresh` returns a new pair and invalidates the one
presented. Replaying an already-rotated token is treated as a leaked chain and revokes
the entire token family. **Clients must single-flight the refresh call** — concurrent
refreshes will sign the user out.

| Code | Meaning | Client action |
| --- | --- | --- |
| `token_expired` | access token past its exp | refresh and replay |
| `token_invalid` | malformed or bad signature | refresh, then re-login |
| `token_revoked` | password changed or account deactivated | re-login |
| `refresh_expired` | refresh token older than 60 days | re-login |
| `refresh_reused` | replay detected, family revoked | re-login |
| `refresh_invalid` | unknown token | re-login |

## Errors

Errors return JSON, sometimes with a machine-readable `code`:

```json
{ "error": "Access token expired", "code": "token_expired" }
```

Some older handlers return `{ "message": … }` instead of `{ "error": … }`. Read
`error ?? message` until that is normalised.

An unknown `/api/*` path returns `404 { "code": "not_found" }` — never the SPA's HTML.

## Conventions

**Money is a string.** Every decimal column serialises as a string (`"1234.56"`), not a
number. Do not parse and re-format it; render for display and send the original value
back. SAR is the accounting truth — non-SAR is a display layer with an FX rate snapshot.

**Idempotency.** Endpoints marked *Accepts `Idempotency-Key`* de-duplicate on that header.
Reuse the same key when retrying a payment or booking.

**Request bodies cap at 1MB.** Never base64 a file into JSON; use the signed-URL upload
flow (`POST /api/uploads/request-url`). Oversized bodies return
`413 { "code": "payload_too_large" }`.

**Authenticated files.** Label and invoice PDFs are streamed behind the auth guard, so a
plain URL open will 401 on a native client. Fetch with the Authorization header and write
to a file first.

**Rate limits.** Auth endpoints are limited per targeted account, with a coarse per-IP
ceiling across `/api/auth`. Other endpoints are limited per authenticated user.

**Permissions.** `client` users are gated by `ClientPermission` values; some actions
additionally require the account's **primary contact**. `admin` users are gated by
`resource:action` strings. Both are listed per endpoint below.

## The shipment flow

Express shipments are a four-step flow. Each step is a separate call and the shipment is
not booked with the carrier until the last one.

```
1. POST /api/client/shipments/rates      → rate options, each with a quoteId
2. POST /api/client/shipments/checkout   → pending shipment from a quoteId
3. POST /api/client/shipments/pay        → charge via Tap   (or …/pay-later for credit)
4. POST /api/client/shipments/confirm    → book, label, tracking number
```

Domestic shipments use `/api/client/local/rates` and `/api/client/local/checkout`;
Door-to-Door Freight uses `/api/client/ddp/rates` and `/api/client/ddp/checkout`.

## Endpoints

### Authentication

15 routes.

| Method | Path | Description | Requirements |
| --- | --- | --- | --- |
| `POST` | `/api/auth/change-password` | — | Guard `requireAuth` |
| `GET` | `/api/auth/devices` | List the signed-in devices for the current user | Guard `requireAuth` |
| `DELETE` | `/api/auth/devices/:id` | Sign out one device | Guard `requireAuth` |
| `POST` | `/api/auth/forgot-password` | Email a password-reset link | Rate limit `otpLimiter` |
| `POST` | `/api/auth/login` | Cookie-session login (web app) | Rate limit `authLimiter` |
| `POST` | `/api/auth/logout` | — | — |
| `GET` | `/api/auth/me` | Current authenticated user | — |
| `POST` | `/api/auth/otp/request` | Send a 6-digit email login code | Rate limit `otpLimiter` |
| `POST` | `/api/auth/otp/verify` | — | Rate limit `otpLimiter` |
| `POST` | `/api/auth/refresh` | Rotate a refresh token | Rate limit `otpLimiter` |
| `POST` | `/api/auth/reset-password` | Set a new password using an emailed token | Rate limit `otpLimiter` |
| `GET` | `/api/auth/reset-password/:token` | Check whether a reset token is still usable | — |
| `POST` | `/api/auth/revoke` | Revoke a refresh token (mobile sign-out) | — |
| `POST` | `/api/auth/token` | Exchange credentials for an access + refresh token pair | Rate limit `authLimiter` |
| `POST` | `/api/auth/token/otp` | Exchange a verified email login code for a token pair | Rate limit `otpLimiter` |

#### Authentication — details

##### `DELETE /api/auth/devices/:id`

Sign out one device

Revokes the whole token family for that device.

Requirements: Guard `requireAuth`

Source: `server/routes.ts:8496`

##### `POST /api/auth/forgot-password`

Email a password-reset link

Sends `{APP_BASE_URL}/reset-password?token=<token>` to the address, if an active user has it. **Always responds 200 `{ success: true }`, even for an address with no account** — the response deliberately reveals nothing about who is registered, so it cannot confirm success. The token exists only in that email.

Note for native clients: `APP_BASE_URL` points at the web app, so the emailed link opens a browser. Handling it in-app requires universal links / app links plus a server-side change to the email — it does not work out of the box.

Request body — `ForgotPasswordRequest`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `email` | string (email) | yes | Address to send the reset link to. No token is returned in the response. |

Requirements: Rate limit `otpLimiter`

Source: `server/routes.ts:8516`

##### `POST /api/auth/login`

Cookie-session login (web app)

Used by the web SPA. Native clients should use POST /api/auth/token instead.

Requirements: Rate limit `authLimiter`

Source: `server/routes.ts:8056`

##### `POST /api/auth/otp/request`

Send a 6-digit email login code

Always returns success — never reveals whether the address exists.

Requirements: Rate limit `otpLimiter`

Source: `server/routes.ts:8127`

##### `POST /api/auth/refresh`

Rotate a refresh token

Returns a new pair and invalidates the presented refresh token. Presenting an already-rotated token is treated as a leaked chain: the entire token family is revoked and the response carries code `refresh_reused`. Clients must single-flight this call — concurrent refreshes will sign the user out.

Request body — `RefreshRequest`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `refreshToken` | string | yes | min length 20 |

Requirements: Rate limit `otpLimiter`

Source: `server/routes.ts:8391`

##### `POST /api/auth/reset-password`

Set a new password using an emailed token

Consumes the token — a second call with the same one fails. On success **every issued bearer and refresh token for that user is revoked**, so other devices get 401 on their next call; native clients must route to login rather than attempting a refresh.

Wrong, expired and already-used tokens all return the same 400 message on purpose, so the response cannot be used to probe which tokens exist.

Request body — `ResetPasswordRequest`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `token` | [`PasswordResetToken`](#schemas) | yes |  |
| `password` | string (password) | yes | min length 8; The new password. Minimum 8 characters. |

Requirements: Rate limit `otpLimiter`

Source: `server/routes.ts:8546`

##### `GET /api/auth/reset-password/:token`

Check whether a reset token is still usable

Lets the reset screen show "this link has expired" before the user types a password. Consumes nothing and never errors on a bad token — an unknown token simply returns `valid: false`. Use `mode` to choose between "Set your password" (onboard) and "Reset your password" (reset).

Source: `server/routes.ts:8535`

##### `POST /api/auth/revoke`

Revoke a refresh token (mobile sign-out)

Deliberately unauthenticated so a client whose access token already expired can still sign out. Always returns success, even for an unknown token.

Request body — `RefreshRequest`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `refreshToken` | string | yes | min length 20 |

Source: `server/routes.ts:8455`

##### `POST /api/auth/token`

Exchange credentials for an access + refresh token pair

Native-client login. `username` accepts a username, an email address, or a phone number. Sets no cookie. Rate limited to 5 failed attempts per 15 minutes per IP.

Request body — `TokenRequest`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `deviceId` | string | yes | max length 200; Stable per-install id |
| `deviceName` | string | no | max length 200 |
| `platform` | enum: `ios`, `android`, `unknown` | no | default `unknown` |
| `appVersion` | string | no | max length 50 |
| `username` | string | yes | Username, email, or phone number |
| `password` | string (password) | yes |  |

Requirements: Rate limit `authLimiter`

Source: `server/routes.ts:8269`

##### `POST /api/auth/token/otp`

Exchange a verified email login code for a token pair

Passwordless equivalent of POST /api/auth/token. Codes come from /api/auth/otp/request.

Request body — `OtpTokenRequest`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `deviceId` | string | yes | max length 200; Stable per-install id |
| `deviceName` | string | no | max length 200 |
| `platform` | enum: `ios`, `android`, `unknown` | no | default `unknown` |
| `appVersion` | string | no | max length 50 |
| `email` | string (email) | yes |  |
| `code` | string | yes | pattern `^\d{6}$` |

Requirements: Rate limit `otpLimiter`

Source: `server/routes.ts:8331`

### Client portal

68 routes.

| Method | Path | Description | Requirements |
| --- | --- | --- | --- |
| `GET` | `/api/client/abandoned-recovery/offers` | Recovery offers on abandoned shipments | Guard `requireClient`<br>Permission `ClientPermission.VIEW_SHIPMENTS` |
| `GET` | `/api/client/account` | The signed-in user's client account | Guard `requireClient` |
| `PATCH` | `/api/client/account` | Update the client account profile | Guard `requireClient`<br>**Primary contact only** |
| `GET` | `/api/client/address-book` | Saved sender and recipient addresses | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `GET` | `/api/client/carrier-rules` | Automatic carrier-assignment rules | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `POST` | `/api/client/carrier-rules` | Create a carrier-assignment rule | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `DELETE` | `/api/client/carrier-rules/:id` | Delete a carrier-assignment rule | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `PATCH` | `/api/client/carrier-rules/:id` | Update a carrier-assignment rule | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `GET` | `/api/client/credit-access` | Credit status and available balance | Guard `requireClient` |
| `POST` | `/api/client/credit-access/request` | Request credit access | Guard `requireClient`<br>**Primary contact only** |
| `GET` | `/api/client/credit-invoices` | Credit (pay-later) invoices, 30-day terms | Guard `requireClient`<br>Permission `ClientPermission.VIEW_INVOICES` |
| `GET` | `/api/client/credit-invoices/:id` | One credit invoice | Guard `requireClient`<br>Permission `ClientPermission.VIEW_INVOICES` |
| `POST` | `/api/client/ddp/checkout` | Create a pending DDP shipment from a quote | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `GET` | `/api/client/ddp/lanes` | Available Door-to-Door Freight lanes | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `POST` | `/api/client/ddp/rates` | Quote a DDP (Door-to-Door Freight) shipment | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `GET` | `/api/client/extra-fees` | Extra charges raised against the account | Guard `requireClient`<br>Permission `ClientPermission.VIEW_PAYMENTS` |
| `GET` | `/api/client/fx-rate` | Display currency and the SAR conversion rate for this account | — |
| `POST` | `/api/client/hs-code/confirm` | Confirm the HS code chosen for an item | Guard `requireClient` |
| `GET` | `/api/client/invoices` | Invoices | Guard `requireClient`<br>Permission `ClientPermission.VIEW_INVOICES` |
| `GET` | `/api/client/invoices/:id/pdf` | Invoice (PDF) | Guard `requireClient`<br>Permission `ClientPermission.VIEW_INVOICES`<br>Returns `text/html` |
| `POST` | `/api/client/local/checkout` | Create a pending domestic shipment | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS`<br>Accepts `Idempotency-Key` |
| `POST` | `/api/client/local/rates` | Quote a domestic shipment via local carriers | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `GET` | `/api/client/my-permissions` | Effective ClientPermission list for the caller | Guard `requireClient` |
| `GET` | `/api/client/orders` | Storefront orders awaiting fulfilment | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `GET` | `/api/client/orders/:id` | One storefront order | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `POST` | `/api/client/orders/:id/fulfill` | Fulfil an order as a shipment | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `GET` | `/api/client/orders/:id/rates` | Rate options for fulfilling an order | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `GET` | `/api/client/payments` | Payment history | Guard `requireClient`<br>Permission `ClientPermission.VIEW_PAYMENTS` |
| `POST` | `/api/client/payments/create-charge` | Charge an outstanding invoice | Guard `requireClient`<br>Permission `ClientPermission.MAKE_PAYMENTS` |
| `POST` | `/api/client/payments/create-intent` | Create a payment intent for an invoice | Guard `requireClient`<br>Permission `ClientPermission.MAKE_PAYMENTS` |
| `GET` | `/api/client/payments/tap/config` | Public Tap config for the checkout SDK | Guard `requireClient` |
| `GET` | `/api/client/payments/tap/saved-cards` | Saved cards | Guard `requireClient` |
| `DELETE` | `/api/client/payments/tap/saved-cards/:id` | Delete a saved card | Guard `requireClient` |
| `POST` | `/api/client/payments/tap/saved-cards/:id/default` | Make a saved card the default | Guard `requireClient` |
| `POST` | `/api/client/quick-quote` | Indicative price without creating a quote | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `GET` | `/api/client/quotations/:id` | An admin-prepared quotation | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `PATCH` | `/api/client/quotations/:id` | Amend a quotation before accepting it | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `POST` | `/api/client/quotations/:id/accept-terms` | Accept a quotation's terms | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `GET` | `/api/client/sales-channels` | Connected storefronts | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `POST` | `/api/client/sales-channels` | Connect a storefront | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `DELETE` | `/api/client/sales-channels/:id` | Disconnect a storefront | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `PATCH` | `/api/client/sales-channels/:id` | Update a storefront connection | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `POST` | `/api/client/sales-channels/:id/sync` | Pull orders from the storefront now | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `GET` | `/api/client/sales-features` | Sales-feature entitlement status | Guard `requireClient` |
| `POST` | `/api/client/sales-features/request` | Request sales features | Guard `requireClient`<br>**Primary contact only** |
| `GET` | `/api/client/shipments` | List shipments | Guard `requireClient`<br>Permission `ClientPermission.VIEW_SHIPMENTS` |
| `POST` | `/api/client/shipments` | Create a shipment directly (legacy flat form) | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS`<br>Accepts `Idempotency-Key` |
| `GET` | `/api/client/shipments/:id` | One shipment, with items, documents and tracking | Guard `requireClient`<br>Permission `ClientPermission.VIEW_SHIPMENTS` |
| `PATCH` | `/api/client/shipments/:id` | Edit a shipment that has not been paid yet | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `POST` | `/api/client/shipments/:id/cancel` | Cancel a shipment | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `GET` | `/api/client/shipments/:id/checkout-summary` | Priced summary of a pending shipment before payment | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `GET` | `/api/client/shipments/:id/commercial-invoice.html` | Commercial invoice (HTML) | Guard `requireClient`<br>Returns `text/html` |
| `GET` | `/api/client/shipments/:id/commercial-invoice.pdf` | Commercial invoice (PDF) | Guard `requireClient`<br>Returns `application/pdf` |
| `GET` | `/api/client/shipments/:id/label.pdf` | Shipping label (PDF) | Guard `requireClient`<br>Returns `application/pdf` |
| `POST` | `/api/client/shipments/:id/pay-later` | Place a shipment on credit terms instead of charging a card | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `GET` | `/api/client/shipments/:id/track` | Carrier tracking checkpoints | Guard `requireClient` |
| `POST` | `/api/client/shipments/checkout` | Step 2 — turn a quote into a pending shipment | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS`<br>Accepts `Idempotency-Key` |
| `POST` | `/api/client/shipments/confirm` | Step 4 — book with the carrier after payment settles | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS`<br>Accepts `Idempotency-Key` |
| `POST` | `/api/client/shipments/extract-invoice-items` | Extract commercial-invoice line items from an uploaded invoice | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `POST` | `/api/client/shipments/extract-package-details` | Extract package dimensions and weight from an uploaded document | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `POST` | `/api/client/shipments/pay` | Step 3 — pay for a pending shipment | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `POST` | `/api/client/shipments/rates` | Step 1 — quote carrier rates | Guard `requireClient`<br>Permission `ClientPermission.CREATE_SHIPMENTS` |
| `GET` | `/api/client/shipments/recent` | Most recent shipments, for the dashboard | Guard `requireClient`<br>Permission `ClientPermission.VIEW_SHIPMENTS` |
| `GET` | `/api/client/stats` | Dashboard counters for the account | Guard `requireClient` |
| `GET` | `/api/client/users` | Users on the account | Guard `requireClient`<br>**Primary contact only** |
| `POST` | `/api/client/users` | Invite a user to the account | Guard `requireClient`<br>**Primary contact only** |
| `DELETE` | `/api/client/users/:userId` | Remove a user from the account | Guard `requireClient`<br>**Primary contact only** |
| `PATCH` | `/api/client/users/:userId/permissions` | Set a user's permissions | Guard `requireClient`<br>**Primary contact only** |

#### Client portal — details

##### `PATCH /api/client/account`

Update the client account profile

Primary contact only. Bilingual (EN/AR) fields are accepted.

Requirements: Guard `requireClient` · **Primary contact only**

Source: `server/routes.ts:15606`

##### `GET /api/client/fx-rate`

Display currency and the SAR conversion rate for this account

Returns SAR for non-client sessions. Money is stored in SAR; this is the display layer. Never convert on the client — send what the API returns.

Source: `server/routes.ts:15569`

##### `POST /api/client/orders/:id/fulfill`

Fulfil an order as a shipment

409 means the order was already fulfilled.

Requirements: Guard `requireClient` · Permission `ClientPermission.CREATE_SHIPMENTS`

Source: `server/routes.ts:18101`

##### `POST /api/client/quick-quote`

Indicative price without creating a quote

Read-only estimate for a price-check screen. Produces no `quoteId`.

Request body — `QuickQuoteRequest`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `origin` | object | yes |  |
| `destination` | object | yes |  |
| `weightKg` | number | yes | > 0 |
| `length` | number | no | >= 0 |
| `width` | number | no | >= 0 |
| `height` | number | no | >= 0 |
| `pieces` | integer | no | default `1`; > 0 |

Requirements: Guard `requireClient` · Permission `ClientPermission.CREATE_SHIPMENTS`

Source: `server/routes.ts:16563`

##### `POST /api/client/shipments`

Create a shipment directly (legacy flat form)

The simple non-carrier path. The express flow is rates → checkout → pay → confirm.

Request body — `LegacyShipmentRequest`:

> Flat legacy create form. Prefer the rates → checkout → pay → confirm flow.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `senderName` | string | yes | min length 2 |
| `senderAddress` | string | yes | min length 5 |
| `senderCity` | string | yes | min length 2 |
| `senderCountry` | string | yes | min length 2 |
| `senderPhone` | string | yes | min length 8 |
| `recipientName` | string | yes | min length 2 |
| `recipientAddress` | string | yes | min length 5 |
| `recipientCity` | string | yes | min length 2 |
| `recipientCountry` | string | yes | min length 2 |
| `recipientPhone` | string | yes | min length 8 |
| `weight` | string | yes | Decimal as a string |
| `dimensions` | string | no |  |
| `packageType` | string | yes | min length 1 |

Requirements: Guard `requireClient` · Permission `ClientPermission.CREATE_SHIPMENTS` · Accepts `Idempotency-Key`

Source: `server/routes.ts:18762`

##### `POST /api/client/shipments/:id/cancel`

Cancel a shipment

A still-booked cancellation auto-issues a Tap refund and cancels any carrier pickup. DHL exposes no cancel API, so the carrier-side cancel is a no-op there.

Requirements: Guard `requireClient` · Permission `ClientPermission.CREATE_SHIPMENTS`

Source: `server/routes.ts:18842`

##### `GET /api/client/shipments/:id/label.pdf`

Shipping label (PDF)

Binary behind the auth guard. Native clients must fetch this with the Authorization header and write it to a file — a plain URL open will 401.

Requirements: Guard `requireClient` · Returns `application/pdf`

Source: `server/routes.ts:18948`

##### `POST /api/client/shipments/:id/pay-later`

Place a shipment on credit terms instead of charging a card

Requires an approved credit limit with sufficient available balance.

Requirements: Guard `requireClient` · Permission `ClientPermission.CREATE_SHIPMENTS`

Source: `server/routes.ts:19145`

##### `POST /api/client/shipments/checkout`

Step 2 — turn a quote into a pending shipment

Consumes a `quoteId` from step 1 and creates the shipment in a pending state. Commercial-invoice items and a pickup preference may be attached here.

Request body — `CheckoutRequest`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `quoteId` | string (uuid) | yes | From POST /api/client/shipments/rates |
| `items` | array of [`ShipmentItem`](#schemas) | no |  |
| `tradeDocuments` | array of object | no | max 5 item(s) |
| `pickup` | [`Pickup`](#schemas) | no |  |

Requirements: Guard `requireClient` · Permission `ClientPermission.CREATE_SHIPMENTS` · Accepts `Idempotency-Key`

Source: `server/routes.ts:18223`

##### `POST /api/client/shipments/confirm`

Step 4 — book with the carrier after payment settles

Produces the label, tracking number and commercial invoice.

Request body — `ConfirmRequest`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `shipmentId` | string (uuid) | yes |  |
| `paymentIntentId` | string | no |  |

Requirements: Guard `requireClient` · Permission `ClientPermission.CREATE_SHIPMENTS` · Accepts `Idempotency-Key`

Source: `server/routes.ts:18654`

##### `POST /api/client/shipments/extract-invoice-items`

Extract commercial-invoice line items from an uploaded invoice

AI extraction (Gemini). Upload the file through the signed-URL flow first and pass its reference. Returns items shaped for the `items` array on checkout.

Requirements: Guard `requireClient` · Permission `ClientPermission.CREATE_SHIPMENTS`

Source: `server/routes.ts:16333`

##### `POST /api/client/shipments/extract-package-details`

Extract package dimensions and weight from an uploaded document

AI extraction (Gemini). Same upload-first pattern as invoice extraction.

Requirements: Guard `requireClient` · Permission `ClientPermission.CREATE_SHIPMENTS`

Source: `server/routes.ts:16401`

##### `POST /api/client/shipments/pay`

Step 3 — pay for a pending shipment

Charges through Tap. `tapTokenId` comes from the Tap SDK; omit it to charge the account's default saved card. Browser clients are redirected; native clients must use the mobile payment path (Workstream D) rather than following the redirect.

Request body — `ShipmentPaymentRequest`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `shipmentId` | string (uuid) | yes |  |
| `tapTokenId` | string | no | From the Tap SDK. Omit to use the default saved card. |
| `saveCardForFuture` | boolean | no |  |
| `returnPath` | string | no | max length 200; Must start with /client/ |

Requirements: Guard `requireClient` · Permission `ClientPermission.CREATE_SHIPMENTS`

Source: `server/routes.ts:18540`

##### `POST /api/client/shipments/rates`

Step 1 — quote carrier rates

Returns rate options, each with a `quoteId` that step 2 consumes. Quotes expire. A 502 means the carrier API failed, not that the request was invalid.

Request body — `ShipmentRateRequest`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `shipmentType` | enum: `domestic`, `inbound`, `outbound` | yes |  |
| `isDdp` | boolean | no | default `false` |
| `carrier` | string | no |  |
| `serviceType` | string | no |  |
| `shipper` | [`Address`](#schemas) | yes |  |
| `recipient` | [`Address`](#schemas) | yes |  |
| `packages` | array of [`Package`](#schemas) | yes | min 1 item(s) |
| `weightUnit` | enum: `LB`, `KG` | no | default `KG` |
| `dimensionUnit` | enum: `IN`, `CM` | no | default `CM` |
| `packageType` | string | no | default `YOUR_PACKAGING` |
| `currency` | string | no | default `SAR` |
| `shipDate` | string | no |  |
| `items` | array of [`ShipmentItem`](#schemas) | no |  |
| `tradeDocuments` | array of object | no | max 5 item(s) |

Requirements: Guard `requireClient` · Permission `ClientPermission.CREATE_SHIPMENTS`

Source: `server/routes.ts:17228`

### Operations portal

26 routes.

| Method | Path | Description | Requirements |
| --- | --- | --- | --- |
| `GET` | `/api/operations/me/access` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `GET` | `/api/operations/shipments` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `GET` | `/api/operations/shipments/:id` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `POST` | `/api/operations/shipments/:id/attention/resolve` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `POST` | `/api/operations/shipments/:id/charges/custom` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `POST` | `/api/operations/shipments/:id/charges/extra-weight` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `POST` | `/api/operations/shipments/:id/charges/extra-weight/preview` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `POST` | `/api/operations/shipments/:id/client-message` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `PATCH` | `/api/operations/shipments/:id/eta` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `POST` | `/api/operations/shipments/:id/expenses` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `DELETE` | `/api/operations/shipments/:id/expenses/:expenseId` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `PATCH` | `/api/operations/shipments/:id/last-mile` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `POST` | `/api/operations/shipments/:id/notes` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `POST` | `/api/operations/shipments/:id/pickup` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `PATCH` | `/api/operations/shipments/:id/plan` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `POST` | `/api/operations/shipments/:id/reassign` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `POST` | `/api/operations/shipments/:id/special-handling` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `POST` | `/api/operations/shipments/:id/special-handling/resolve` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `PATCH` | `/api/operations/shipments/:id/status` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `POST` | `/api/operations/shipments/:id/tasks/:taskId/complete` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `PATCH` | `/api/operations/shipments/:id/tasks/:taskId/metadata` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `POST` | `/api/operations/shipments/:id/tracking-numbers` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `DELETE` | `/api/operations/shipments/:id/tracking-numbers/:tnId` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `PATCH` | `/api/operations/shipments/:id/tracking-numbers/:tnId` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `GET` | `/api/operations/summary` | — | Guard `requireOperationsPermission`<br>Permission `operations` |
| `GET` | `/api/operations/users` | — | Guard `requireOperationsPermission`<br>Permission `operations` |

### Admin portal

154 routes.

| Method | Path | Description | Requirements |
| --- | --- | --- | --- |
| `GET` | `/api/admin/account-managers` | — | Guard `requireAdminPermission`<br>Permission `account-managers:read` |
| `POST` | `/api/admin/account-managers` | — | Guard `requireAdminPermission`<br>Permission `account-managers:create` |
| `PUT` | `/api/admin/account-managers/:userId/clients` | — | Guard `requireAdminPermission`<br>Permission `account-managers:assign` |
| `GET` | `/api/admin/account-managers/change-requests` | — | Guard `requireAdminPermission`<br>Permission `account-manager-requests:read` |
| `POST` | `/api/admin/account-managers/change-requests/:id/approve` | — | Guard `requireAdminPermission`<br>Permission `account-manager-requests:approve` |
| `POST` | `/api/admin/account-managers/change-requests/:id/reject` | — | Guard `requireAdminPermission`<br>Permission `account-manager-requests:reject` |
| `GET` | `/api/admin/applications` | — | Guard `requireAdminPermission`<br>Permission `applications:read` |
| `POST` | `/api/admin/applications/:id/review` | — | Guard `requireAdmin` |
| `GET` | `/api/admin/applications/pending` | — | Guard `requireAdminPermission`<br>Permission `applications:read` |
| `GET` | `/api/admin/apps` | — | Guard `requireAdminPermission`<br>Permission `integrations:read` |
| `DELETE` | `/api/admin/apps/:appKey/logo` | — | Guard `requireAdminPermission`<br>Permission `integrations:configure` |
| `PUT` | `/api/admin/apps/:appKey/logo` | — | Guard `requireAdminPermission`<br>Permission `integrations:configure` |
| `POST` | `/api/admin/apps/accounts` | — | Guard `requireAdminPermission`<br>Permission `integrations:configure` |
| `DELETE` | `/api/admin/apps/accounts/:id` | — | Guard `requireAdminPermission`<br>Permission `integrations:configure` |
| `PATCH` | `/api/admin/apps/accounts/:id` | — | Guard `requireAdminPermission`<br>Permission `integrations:configure` |
| `POST` | `/api/admin/apps/accounts/:id/test` | — | Guard `requireAdminPermission`<br>Permission `integrations:configure` |
| `GET` | `/api/admin/audit-logs` | — | Guard `requireAdminPermission`<br>Permission `audit-logs:read` |
| `GET` | `/api/admin/audit-logs/stats` | — | Guard `requireAdminPermission`<br>Permission `audit-logs:read` |
| `GET` | `/api/admin/carrier-payout-batches` | — | Guard `requireAdminPermission`<br>Permission `payments:read` |
| `POST` | `/api/admin/carrier-payout-batches` | — | Guard `requireAdminPermission`<br>Permission `payments:create` |
| `POST` | `/api/admin/carrier-payout-batches/:id/mark-paid` | — | Guard `requireAdminPermission`<br>Permission `payments:create` |
| `GET` | `/api/admin/client-profile-options` | — | Guard `requireAdminPermission`<br>Permission `clients:read` |
| `GET` | `/api/admin/clients` | — | Guard `requireAdminPermission`<br>Permission `clients:read` |
| `POST` | `/api/admin/clients` | — | Guard `requireAdminPermission`<br>Permission `clients:create` |
| `DELETE` | `/api/admin/clients/:id` | — | Guard `requireAdminPermission`<br>Permission `clients:delete` |
| `GET` | `/api/admin/clients/:id` | — | Guard `requireAdminPermission`<br>Permission `clients:read` |
| `PATCH` | `/api/admin/clients/:id` | — | Guard `requireAdminPermission`<br>Permission `clients:update` |
| `GET` | `/api/admin/clients/:id/credit` | — | Guard `requireAdminPermission`<br>Permission `clients:read` |
| `PATCH` | `/api/admin/clients/:id/credit-limit` | — | Guard `requireAdminPermission`<br>Permission `clients:update` |
| `PATCH` | `/api/admin/clients/:id/profile` | — | Guard `requireAdminPermission`<br>Permission `clients:update` |
| `PATCH` | `/api/admin/clients/:id/sales-features` | — | Guard `requireAdminPermission`<br>Permission `clients:update` |
| `PATCH` | `/api/admin/clients/:id/status` | — | Guard `requireAdminPermission`<br>Permission `clients:activate` |
| `GET` | `/api/admin/credit-invoices` | — | Guard `requireAdminPermission`<br>Permission `credit-invoices:read` |
| `GET` | `/api/admin/credit-invoices/:id` | — | Guard `requireAdminPermission`<br>Permission `credit-invoices:read` |
| `POST` | `/api/admin/credit-invoices/:id/cancel` | — | Guard `requireAdminPermission`<br>Permission `credit-invoices:cancel` |
| `POST` | `/api/admin/credit-invoices/:id/mark-paid` | — | Guard `requireAdminPermission`<br>Permission `credit-invoices:update` |
| `GET` | `/api/admin/credit-requests` | — | Guard `requireAdminPermission`<br>Permission `credit-requests:read` |
| `POST` | `/api/admin/credit-requests/:id/approve` | — | Guard `requireAdminPermission`<br>Permission `credit-requests:approve` |
| `POST` | `/api/admin/credit-requests/:id/reject` | — | Guard `requireAdminPermission`<br>Permission `credit-requests:reject` |
| `POST` | `/api/admin/credit-requests/:id/revoke` | — | Guard `requireAdminPermission`<br>Permission `credit-requests:revoke` |
| `GET` | `/api/admin/ddp-pricing` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:read` |
| `POST` | `/api/admin/ddp-pricing` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:create` |
| `DELETE` | `/api/admin/ddp-pricing/:id` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:delete` |
| `PATCH` | `/api/admin/ddp-pricing/:id` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:update` |
| `POST` | `/api/admin/ddp/shipments/:id/charges` | — | Guard `requireAdminPermission`<br>Permission `shipments:update` |
| `GET` | `/api/admin/departments` | — | Guard `requireAdminPermission`<br>Permission `roles:read` |
| `POST` | `/api/admin/departments` | — | Guard `requireAdminPermission`<br>Permission `roles:create` |
| `PATCH` | `/api/admin/departments/:id` | — | Guard `requireAdminPermission`<br>Permission `roles:update` |
| `GET` | `/api/admin/email-templates` | — | Guard `requireAdminPermission`<br>Permission `email-templates:read` |
| `GET` | `/api/admin/email-templates/:id` | — | Guard `requireAdminPermission`<br>Permission `email-templates:read` |
| `PUT` | `/api/admin/email-templates/:id` | — | Guard `requireAdminPermission`<br>Permission `email-templates:update` |
| `POST` | `/api/admin/email-templates/:id/preview` | — | Guard `requireAdminPermission`<br>Permission `email-templates:read` |
| `POST` | `/api/admin/email-templates/:id/reset` | — | Guard `requireAdminPermission`<br>Permission `email-templates:update` |
| `GET` | `/api/admin/financial-statements` | — | Guard `requireAdminPermission`<br>Permission `payments:read` |
| `POST` | `/api/admin/financial-statements/shipments/:id/cancel-carrier-payment` | — | Guard `requireAdminPermission`<br>Permission `payments:create` |
| `PATCH` | `/api/admin/financial-statements/shipments/:id/extra-fees` | — | Guard `requireAdminPermission`<br>Permission `shipments:update` |
| `POST` | `/api/admin/financial-statements/shipments/:id/mark-carrier-paid` | — | Guard `requireAdminPermission`<br>Permission `payments:create` |
| `POST` | `/api/admin/financial-statements/shipments/:id/mark-paid` | — | Guard `requireAdminPermission`<br>Permission `payments:create` |
| `GET` | `/api/admin/integration-logs` | — | Guard `requireAdminPermission`<br>Permission `integrations:read` |
| `GET` | `/api/admin/invitations` | — | Guard `requireAdminPermission`<br>Permission `users:read` |
| `POST` | `/api/admin/invitations` | — | Guard `requireAdminPermission`<br>Permission `users:create` |
| `POST` | `/api/admin/invitations/:id/resend` | — | Guard `requireAdminPermission`<br>Permission `users:update` |
| `POST` | `/api/admin/invitations/:id/revoke` | — | Guard `requireAdminPermission`<br>Permission `users:update` |
| `GET` | `/api/admin/invoices` | — | Guard `requireAdminPermission`<br>Permission `invoices:read` |
| `GET` | `/api/admin/invoices/:id` | — | Guard `requireAdminPermission`<br>Permission `invoices:read` |
| `GET` | `/api/admin/invoices/:id/pdf` | — | Guard `requireAdminPermission`<br>Permission `invoices:download` |
| `GET` | `/api/admin/local-pricing` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:read` |
| `POST` | `/api/admin/local-pricing` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:create` |
| `DELETE` | `/api/admin/local-pricing/:id` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:delete` |
| `PATCH` | `/api/admin/local-pricing/:id` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:update` |
| `GET` | `/api/admin/me/access` | — | — |
| `GET` | `/api/admin/payments` | — | Guard `requireAdminPermission`<br>Permission `payments:read` |
| `GET` | `/api/admin/permissions` | — | Guard `requireAdminPermission`<br>Permission `permissions:read` |
| `POST` | `/api/admin/permissions` | — | Guard `requireAdminPermission`<br>Permission `permissions:create` |
| `DELETE` | `/api/admin/permissions/:id` | — | Guard `requireAdminPermission`<br>Permission `permissions:delete` |
| `GET` | `/api/admin/policies` | — | Guard `requireAdminPermission`<br>Permission `policies:read` |
| `POST` | `/api/admin/policies` | — | Guard `requireAdminPermission`<br>Permission `policies:create` |
| `DELETE` | `/api/admin/policies/:id` | — | Guard `requireAdminPermission`<br>Permission `policies:delete` |
| `GET` | `/api/admin/policies/:id` | — | Guard `requireAdminPermission`<br>Permission `policies:read` |
| `PATCH` | `/api/admin/policies/:id` | — | Guard `requireAdminPermission`<br>Permission `policies:update` |
| `GET` | `/api/admin/policies/:id/versions` | — | Guard `requireAdminPermission`<br>Permission `policies:read` |
| `GET` | `/api/admin/policies/:id/versions/:versionId` | — | Guard `requireAdminPermission`<br>Permission `policies:read` |
| `GET` | `/api/admin/pricing` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:read` |
| `POST` | `/api/admin/pricing` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:create` |
| `DELETE` | `/api/admin/pricing/:id` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:delete` |
| `PATCH` | `/api/admin/pricing/:id` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:update` |
| `GET` | `/api/admin/pricing/:id/ddp-tiers` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:read` |
| `POST` | `/api/admin/pricing/:id/ddp-tiers` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:update` |
| `GET` | `/api/admin/pricing/:id/tiers` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:read` |
| `POST` | `/api/admin/pricing/:id/tiers` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:update` |
| `DELETE` | `/api/admin/pricing/ddp-tiers/:tierId` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:update` |
| `PATCH` | `/api/admin/pricing/ddp-tiers/:tierId` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:update` |
| `POST` | `/api/admin/pricing/preview` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:read` |
| `DELETE` | `/api/admin/pricing/tiers/:tierId` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:update` |
| `PATCH` | `/api/admin/pricing/tiers/:tierId` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:update` |
| `POST` | `/api/admin/quotations` | — | Guard `requireAdminPermission`<br>Permission `shipments:create` |
| `GET` | `/api/admin/quotations/client/:clientAccountId` | — | Guard `requireAdminPermission`<br>Permission `shipments:create` |
| `GET` | `/api/admin/quotations/client/:clientAccountId/address-book` | — | Guard `requireAdminPermission`<br>Permission `shipments:create` |
| `GET` | `/api/admin/quotations/ddp-lanes` | — | Guard `requireAdminPermission`<br>Permission `shipments:create` |
| `POST` | `/api/admin/quotations/ddp-rates` | — | Guard `requireAdminPermission`<br>Permission `shipments:create` |
| `POST` | `/api/admin/quotations/extract-invoice-items` | — | Guard `requireAdminPermission`<br>Permission `shipments:create` |
| `POST` | `/api/admin/quotations/extract-package-details` | — | Guard `requireAdminPermission`<br>Permission `shipments:create` |
| `POST` | `/api/admin/quotations/preview` | — | Guard `requireAdminPermission`<br>Permission `shipments:create` |
| `POST` | `/api/admin/quotations/rates` | — | Guard `requireAdminPermission`<br>Permission `shipments:create` |
| `GET` | `/api/admin/refund-requests` | — | Guard `requireAdminPermission`<br>Permission `refund-requests:read` |
| `POST` | `/api/admin/refund-requests/:id/approve-account-manager` | — | Guard `requireAdminPermission`<br>Permission `refund-requests:approve-account-manager` |
| `POST` | `/api/admin/refund-requests/:id/approve-finance` | — | Guard `requireAdminPermission`<br>Permission `refund-requests:approve-finance` |
| `GET` | `/api/admin/roles` | — | Guard `requireAdminPermission`<br>Permission `roles:read` |
| `POST` | `/api/admin/roles` | — | Guard `requireAdminPermission`<br>Permission `roles:create` |
| `DELETE` | `/api/admin/roles/:id` | — | Guard `requireAdminPermission`<br>Permission `roles:delete` |
| `GET` | `/api/admin/roles/:id` | — | Guard `requireAdminPermission`<br>Permission `roles:read` |
| `PATCH` | `/api/admin/roles/:id` | — | Guard `requireAdminPermission`<br>Permission `roles:update` |
| `DELETE` | `/api/admin/roles/:roleId/permissions/:permissionId` | — | Guard `requireAdminPermission`<br>Permission `permissions:assign` |
| `POST` | `/api/admin/roles/:roleId/permissions/:permissionId` | — | Guard `requireAdminPermission`<br>Permission `permissions:assign` |
| `GET` | `/api/admin/sales-feature-requests` | — | Guard `requireAdminPermission`<br>Permission `sales-feature-requests:read` |
| `POST` | `/api/admin/sales-feature-requests/:id/approve` | — | Guard `requireAdminPermission`<br>Permission `sales-feature-requests:approve` |
| `POST` | `/api/admin/sales-feature-requests/:id/reject` | — | Guard `requireAdminPermission`<br>Permission `sales-feature-requests:reject` |
| `POST` | `/api/admin/sales-feature-requests/:id/revoke` | — | Guard `requireAdminPermission`<br>Permission `sales-feature-requests:revoke` |
| `GET` | `/api/admin/settings/web-app` | — | Guard `requireAdminPermission`<br>Permission `settings:read` |
| `PATCH` | `/api/admin/settings/web-app` | — | Guard `requireAdminPermission`<br>Permission `settings:update` |
| `GET` | `/api/admin/shipments` | — | Guard `requireAdminPermission`<br>Permission `shipments:read` |
| `PATCH` | `/api/admin/shipments/:id` | — | Guard `requireAdminPermission`<br>Permission `shipments:update` |
| `POST` | `/api/admin/shipments/:id/abandoned-recovery/discount` | — | Guard `requireAdminPermission`<br>Permission `shipments:update` |
| `POST` | `/api/admin/shipments/:id/abandoned-recovery/dismiss` | — | Guard `requireAdminPermission`<br>Permission `shipments:update` |
| `POST` | `/api/admin/shipments/:id/abandoned-recovery/reminder` | — | Guard `requireAdminPermission`<br>Permission `shipments:update` |
| `POST` | `/api/admin/shipments/:id/cancel` | — | Guard `requireAdminPermission`<br>Permission `shipments:cancel` |
| `GET` | `/api/admin/shipments/:id/commercial-invoice.html` | — | Guard `requireAdminPermission`<br>Permission `shipments:read`<br>Returns `text/html` |
| `GET` | `/api/admin/shipments/:id/commercial-invoice.pdf` | — | Guard `requireAdminPermission`<br>Permission `shipments:read`<br>Returns `application/pdf` |
| `GET` | `/api/admin/shipments/:id/details` | — | Guard `requireAdminPermission`<br>Permission `shipments:read` |
| `GET` | `/api/admin/shipments/:id/label.pdf` | — | Guard `requireAdminPermission`<br>Permission `shipments:read`<br>Returns `application/pdf` |
| `POST` | `/api/admin/shipments/:id/retry-carrier` | — | Guard `requireAdminPermission`<br>Permission `shipments:update` |
| `PATCH` | `/api/admin/shipments/:id/status` | — | Guard `requireAdminPermission`<br>Permission `shipments:update` |
| `GET` | `/api/admin/shipments/recent` | — | Guard `requireAdminPermission`<br>Permission `shipments:read` |
| `POST` | `/api/admin/shipping/rates` | — | Guard `requireAdminPermission`<br>Permission `shipments:read` |
| `GET` | `/api/admin/stats` | — | Guard `requireAdminPermission`<br>Permission `dashboard:read` |
| `GET` | `/api/admin/system-logs` | — | Guard `requireAdminPermission`<br>Permission `system-logs:read` |
| `PATCH` | `/api/admin/system-logs/:id/resolve` | — | Guard `requireAdminPermission`<br>Permission `system-logs:resolve` |
| `GET` | `/api/admin/system-logs/stats` | — | Guard `requireAdminPermission`<br>Permission `system-logs:read` |
| `GET` | `/api/admin/users` | — | Guard `requireAdminPermission`<br>Permission `users:read` |
| `POST` | `/api/admin/users` | — | Guard `requireAdminPermission`<br>Permission `users:create` |
| `DELETE` | `/api/admin/users/:id` | — | Guard `requireAdminPermission`<br>Permission `users:delete` |
| `PATCH` | `/api/admin/users/:id` | — | Guard `requireAdminPermission`<br>Permission `users:update` |
| `GET` | `/api/admin/users/:id/detail` | — | Guard `requireAdminPermission`<br>Permission `users:read` |
| `PATCH` | `/api/admin/users/:id/status` | — | Guard `requireAdminPermission`<br>Permission `users:update` |
| `GET` | `/api/admin/users/:userId/roles` | — | Guard `requireAdminPermission`<br>Permission `roles:read` |
| `DELETE` | `/api/admin/users/:userId/roles/:roleId` | — | Guard `requireAdminPermission`<br>Permission `roles:assign` |
| `POST` | `/api/admin/users/:userId/roles/:roleId` | — | Guard `requireAdminPermission`<br>Permission `roles:assign` |
| `GET` | `/api/admin/virtual-carriers` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:read` |
| `POST` | `/api/admin/virtual-carriers` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:create` |
| `DELETE` | `/api/admin/virtual-carriers/:id` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:delete` |
| `PATCH` | `/api/admin/virtual-carriers/:id` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:update` |
| `DELETE` | `/api/admin/virtual-carriers/:id/logo` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:update` |
| `PUT` | `/api/admin/virtual-carriers/:id/logo` | — | Guard `requireAdminPermission`<br>Permission `pricing-rules:update` |
| `GET` | `/api/admin/webhook-events` | — | Guard `requireAdminPermission`<br>Permission `webhooks:read` |

### Webhooks

4 routes.

| Method | Path | Description | Requirements |
| --- | --- | --- | --- |
| `POST` | `/api/webhooks/fedex` | — | — |
| `POST` | `/api/webhooks/sales-channel/:platform` | — | — |
| `GET` | `/api/webhooks/status` | — | Guard `requireAdminPermission`<br>Permission `webhooks:read` |
| `POST` | `/api/webhooks/tap` | — | — |

### Shared and public

39 routes.

| Method | Path | Description | Requirements |
| --- | --- | --- | --- |
| `POST` | `/api/applications` | — | Accepts `Idempotency-Key` |
| `GET` | `/api/carrier-logos` | — | Guard `requireAuth` |
| `GET` | `/api/config/branding` | — | — |
| `GET` | `/api/fedex/service-options` | — | Guard `requireAuth`<br>Rate limit `fedexApiLimiter` |
| `POST` | `/api/fedex/validate-address` | — | Guard `requireAuth`<br>Rate limit `fedexApiLimiter` |
| `GET` | `/api/fedex/validate-postal` | — | Guard `requireAuth`<br>Rate limit `fedexApiLimiter` |
| `GET` | `/api/geo/postal-suggest` | — | Guard `requireAuth` |
| `GET` | `/api/health` | Liveness probe | — |
| `GET` | `/api/hs-lookup` | — | Guard `requireAuth`<br>Rate limit `hsLookupLimiter` |
| `GET` | `/api/notifications` | — | Guard `requireAuth` |
| `POST` | `/api/notifications/:id/read` | — | Guard `requireAuth` |
| `POST` | `/api/notifications/read-all` | — | Guard `requireAuth` |
| `GET` | `/api/notifications/unread-count` | — | Guard `requireAuth` |
| `GET` | `/api/payments/tap/redirect` | — | — |
| `GET` | `/api/policies` | — | — |
| `GET` | `/api/policies/:slug` | — | — |
| `GET` | `/api/policies/:slug/versions` | — | — |
| `GET` | `/api/policies/:slug/versions/:versionId` | — | — |
| `GET` | `/api/profile-badges` | — | Guard `requireAuth` |
| `POST` | `/api/public/applications/extract-company-details` | — | Rate limit `companyExtractionLimiter` |
| `GET` | `/api/public/invitations/:token` | — | — |
| `POST` | `/api/public/invitations/:token/accept` | — | — |
| `POST` | `/api/public/uploads/request-url` | — | Rate limit `fileServeLimiter` |
| `GET` | `/api/shipments/:id/track` | — | Guard `requireAuth` |
| `POST` | `/api/shipments/check-service` | — | Guard `requireAuth` |
| `POST` | `/api/shipments/rates` | — | Guard `requireAuth` |
| `POST` | `/api/shipments/validate-address` | — | Guard `requireAuth` |
| `POST` | `/api/shipments/validate-postal-code` | — | Guard `requireAuth` |
| `GET` | `/api/tasks` | — | Guard `requireTaskPermission` |
| `POST` | `/api/tasks` | — | Guard `requireTaskPermission` |
| `GET` | `/api/tasks/:id` | — | Guard `requireTaskPermission` |
| `PATCH` | `/api/tasks/:id` | — | Guard `requireTaskPermission` |
| `POST` | `/api/tasks/:id/comments` | — | Guard `requireTaskPermission` |
| `POST` | `/api/tasks/:id/complete` | — | Guard `requireTaskPermission` |
| `POST` | `/api/tasks/:id/reopen` | — | Guard `requireTaskPermission` |
| `GET` | `/api/tasks/summary` | — | Guard `requireTaskPermission` |
| `GET` | `/api/tasks/users` | — | Guard `requireTaskPermission` |
| `PUT` | `/api/uploads/direct/:fileName` | — | — |
| `POST` | `/api/uploads/request-url` | — | Guard `requireAuthenticated`<br>Rate limit `fileServeLimiter` |

## Schemas

### `Address`

Fields — `Address`:

> stateOrProvince becomes required for countries in COUNTRIES_REQUIRING_STATE.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | yes | min length 1 |
| `company` | string | no |  |
| `phone` | string | yes | min length 1 |
| `email` | string (email) | no |  |
| `countryCode` | string | yes | exactly 2 chars; ISO 3166-1 alpha-2 |
| `city` | string | yes | min length 1 |
| `postalCode` | string | yes | min length 1 |
| `addressLine1` | string | yes | min length 1 |
| `addressLine2` | string | no |  |
| `stateOrProvince` | string | no |  |
| `shortAddress` | string | no | Saudi national short address |

### `Package`

Fields — `Package`:

> Units are set by weightUnit and dimensionUnit on the enclosing request.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `weight` | number | yes | > 0 |
| `length` | number | yes | > 0 |
| `width` | number | yes | > 0 |
| `height` | number | yes | > 0 |

### `ShipmentItem`

Fields — `ShipmentItem`:

> Commercial-invoice line. Required for cross-border shipments.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `itemName` | string | yes | min length 1 |
| `itemDescription` | string | no |  |
| `category` | string | yes | min length 1 |
| `material` | string | no |  |
| `countryOfOrigin` | string | yes | exactly 2 chars |
| `hsCode` | string | no |  |
| `hsCodeSource` | enum: `USER`, `FEDEX`, `HISTORY`, `UNKNOWN` | no |  |
| `hsCodeConfidence` | enum: `HIGH`, `MEDIUM`, `LOW`, `MISSING` | no |  |
| `price` | number | yes | >= 0 |
| `quantity` | integer | yes | > 0 |
| `currency` | string | no |  |

### `Pickup`

Fields — `Pickup`:

> Carrier pickup preference. Booked after the shipment is booked; a pickup failure sets pickupStatus=failed and never fails the shipment.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `requested` | boolean | no | default `false` |
| `date` | string | no | pattern `^\d{4}-\d{2}-\d{2}$` |
| `readyTime` | string | no | default `09:00`; pattern `^\d{2}:\d{2}$` |
| `closeTime` | string | no | default `17:00`; pattern `^\d{2}:\d{2}$` |
| `location` | string | no | max length 120 |
| `instructions` | string | no | max length 500 |

### `TokenPair`

Fields — `TokenPair`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `accessToken` | string | no | JWT (HS256). Send as Authorization: Bearer. |
| `refreshToken` | string | no | Opaque, rotating. Store in Keychain/Keystore, never AsyncStorage. |
| `expiresIn` | integer | no | Access-token lifetime in seconds |
| `tokenType` | enum: `Bearer` | no |  |
| `user` | [`User`](#schemas) | no |  |

### `User`

Fields — `User`:

> Public user shape. Never includes the password hash.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | no |  |
| `username` | string | no |  |
| `email` | string (email) | no |  |
| `phone` | string | no |  |
| `fullName` | string | no |  |
| `userType` | enum: `admin`, `client`, `operations` | no |  |
| `clientAccountId` | string | no |  |
| `isPrimaryContact` | boolean | no |  |
| `isAccountManager` | boolean | no |  |
| `mustChangePassword` | boolean | no |  |
| `isActive` | boolean | no |  |
| `lastLoginAt` | string (date-time) | no |  |
| `createdAt` | string (date-time) | no |  |

### `ResetTokenStatus`

Fields — `ResetTokenStatus`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `valid` | boolean | no | False when the token is unknown, expired, or already used. Advisory only — POST /api/auth/reset-password re-checks, so never treat true as a guarantee. |
| `mode` | enum: `reset`, `onboard` | no | `onboard` = a new user setting their first password (link valid 7 days). `reset` = forgot-password (link valid 1 hour). Both use the same POST; this only changes the wording you show. |

### `ResetPasswordRequest`

Fields — `ResetPasswordRequest`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `token` | [`PasswordResetToken`](#schemas) | yes |  |
| `password` | string (password) | yes | min length 8; The new password. Minimum 8 characters. |

### `Error`

Fields — `Error`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `error` | string | no | Human-readable message |
| `code` | string | no | Machine-readable code. Auth values: token_expired, token_invalid, token_revoked, refresh_invalid, refresh_expired, refresh_reused. |

---

Generated from `server/routes.ts` and `server/integrations/storage/routes.ts` by `script/generate-openapi.ts`.

