# Shipox Integration — Full Analysis & Options

**Status:** Research / decision doc (not yet implemented)
**Author:** Engineering
**Last updated:** 2026-07-18
**Scope:** Evaluate integrating Shipox's API into the Ezhalha Logistics Platform and document every viable integration model.

---

## 1. What Shipox Is

Shipox is **not** a carrier like FedEx / DHL / Aramex. It is a **Delivery Management System (DMS)** — a full last-mile logistics platform (origin DAST, Uzbekistan/Dubai; strong presence in KSA/UAE/GCC).

It bundles layers that **overlap our own platform**:

- Order / parcel management
- Own driver app + dispatch + routing
- COD cash collection **and** reconciliation
- Multi-tenant 3PL (super-admin, B2B customer, driver)
- Sub-integrations to real carriers (DHL, Aramex, SMSA, J&T, iMile, Emirates Post, DPD)
- Payments (Stripe, PayFort, ClickPay, Payme)
- E-commerce (Shopify, Salla, Zid, WooCommerce, OpenCart)

> **Key framing:** Integrating Shipox is *not* "adding a carrier to fill a gap." Shipox duplicates our orders / drivers / COD / carrier-routing layers. The design question is **which single Shipox capability we consume**, and **who stays system-of-record**.

---

## 2. API Surface (verified from the Apiary blueprint)

- **Production base URL:** `https://prodapi.shipox.com`
- **Docs:** https://shipox.docs.apiary.io/ (Apiary, JS-rendered — machine blueprint scraped for this doc)
- **Format:** REST / JSON

### 2.1 Auth

- `POST /api/v1/customer/authenticate` (user / password) → returns a **JWT** (`id_token`).
- All requests: `Authorization: Bearer <id_token>`, `Accept: application/json`.
- Token **expires** → adapter must cache the token and refresh on 401. (Different from our FedEx OAuth-client-credentials pattern.)
- This is a **customer / tenant** API — we authenticate as a Shipox *B2B customer*, not as a super-admin.

### 2.2 Verified endpoints (customer/tenant API)

| Purpose | Method + Path |
|---|---|
| Authenticate | `POST /api/v1/customer/authenticate` |
| Account info | `GET /api/v1/customer/account` |
| Register | `POST /api/v1/customer/register` |
| **Service tiers** | `GET /api/v1/service_types` |
| **Rate / price calc** | `GET /api/v2/customer/packages/prices/starting_from` |
| **Create order** | `POST /api/v2/customer/order` |
| Create order (boxes) | `POST /api/v3/customer/order` |
| Order status | `GET /api/v1/customer/order/{id}/status` |
| Order history | `GET /api/v1/customer/order/{order_number}/history_items` |
| Airwaybill / label | `GET /api/v1/customer/orders/airwaybill_mini` |
| Reference data | `GET /api/v2/customer/countries` · `/cities` · `/neighborhoods` |
| Public tracking | `GET /api/v1/public/order/{order_number}/history_items` |
| Public driver location | `GET /api/v1/public/order/{public_id}/driver/location` |
| Food delivery | `POST /api/v2/food/order/create` (+ list/update/get) |

### 2.3 What does NOT exist in the tenant API

- ❌ No `/providers`, `/couriers`, `/carriers`, `/integrations` list or CRUD endpoint.
- ❌ No way to **fetch or manage Shipox's underlying carriers** (SMSA/J&T/iMile…) — that lives in Shipox's **super-admin console**, not the customer API.
- ❌ No multi-carrier rate *comparison*. The rate endpoint returns Shipox's own blended tariff; the actual delivering carrier is chosen internally by Shipox and is **opaque** to us.

### 2.4 Rate endpoint detail

`GET /api/v2/customer/packages/prices/starting_from`

**Query params:**
```
from_latitude, from_longitude, to_latitude, to_longitude
from_country_id, to_country_id
dimensions_length, dimensions_width, dimensions_weight, dimensions_unit
price_calculation_type, logistic_type
sender_address_type, recipient_address_type
page, size
```

**Response:**
```jsonc
{
  "status": "...",
  "data": {
    "total": 3,
    "list": [
      {
        "id": 12,
        "name": "Standard",
        "description": "...",
        "price": {
          "id": 88,
          "distance": 14.2,
          "duration": 35,
          "base": 15.0,
          "per_weight": 2.0,
          "per_distance": 1.5,
          "total": 22.5,
          "currency": "SAR"
        }
      }
    ]
  }
}
```

> ⚠️ **Lat/lng driven, not postal code.** We must geocode sender/recipient before quoting. Contrast FedEx/DHL which quote off postal code.

### 2.5 Create-order detail

`POST /api/v2/customer/order`

**Request fields:** `sender_data`, `recipient_data`, `dimensions`, `package_type`, `charge_items`, `recipient_not_available`, `payment_type`, `payer`, `parcel_value`, `fragile`, `note`, `reference_id`.

**Response fields:** `data.id`, `order_number`, `total_charge`, `status`, `charge_items[]`, `currency`.

**V3** (`POST /api/v3/customer/order`) adds `boxes[]`, `agent`, `manifest`, `placed_storage_address`; response adds `boxes[].line_items[]`.

### 2.6 Tracking

- `GET /api/v1/customer/order/{id}/status` — current status.
- `GET /api/v1/customer/order/{order_number}/history_items` — event history.
- Statuses observed: `NEW → PICKED_UP → ON_THE_WAY → DELIVERED / RETURNED` (plus assignment states via `assigned_to_courier`, `courier_type`).

### 2.7 Webhooks / callbacks

- Shipox supports a **callback URL per account**, POST on status change, expects HTTP `200`.
- ⚠️ **No HMAC / signature.** Security must be bolted on by us (secret token in the callback path + IP allowlist). See §6.

---

## 3. How It Maps to Our `CarrierAdapter`

Our carrier interface (`server/integrations/fedex.ts:320`) requires 8 methods. Shipox maps as a **local / last-mile** adapter:

| Interface method | Shipox mapping | Notes |
|---|---|---|
| `isConfigured()` | creds present in encrypted config | store user/pass, not env |
| `validateAddress` | Shipox `cities`/`neighborhoods` lookup | weak — likely pass-through |
| `validatePostalCode` | n/a (lat/lng model) | pass-through / stub |
| `checkServiceAvailability` | `countries`/`cities` coverage check | |
| `getRates` | `GET /packages/prices/starting_from` | **geocode first**; cache tariff |
| `createShipment` | `POST /api/v2/customer/order` | `order_number` → trackingNumber; label via `airwaybill_mini` (PDF) |
| `trackShipment` | `GET /order/{id}/status` + `history_items` | map to our status enum |
| `cancelShipment` | order cancel/status-update endpoint | verify exact path during build |
| `validateWebhookSignature` | **none** → shared-secret check | §6 |

**Registration:** add `shipoxAdapter` in `server/integrations/carriers.ts` alongside the local carriers (`smsaAdapter`, `naqelAdapter`, …).

**Capability profile:** `type: "local"` (or `"both"`), `domesticCountries: ["SA","AE"]`.

**Service tiers:** surface `GET /api/v1/service_types` results (`id, code, name, sorder`) as selectable Shipox service levels in the apps/config page. *These are tiers (standard/express/same-day), NOT the underlying carrier list.*

---

## 4. Integration Options

### Option 1 — Shipox as a Last-Mile Carrier ✅ *recommended / smallest*

We stay system-of-record. Shipox = one more `CarrierAdapter` for domestic KSA/GCC delivery via **its own driver fleet**.

```
Ezhalha (System of Record)
  └─ CarrierService
       ├─ FedEx
       ├─ DHL
       ├─ Aramex
       └─ Shipox   ← new adapter
            push order → track → COD settlement back to Zoho
```

**Pros**
- Smallest, cleanest change. Fits existing adapter pattern exactly.
- We keep control of orders / customers / ledger.
- Adds Shipox's driver network + same-day capability where we lack it.

**Cons**
- COD flows through Shipox → reconciliation work (§5).
- JWT token lifecycle to manage.
- Rates are zonal/tariff, not real-time multi-carrier.

---

### Option 2 — Shipox as DMS Backbone ❌ *heavy, cedes ops*

Shipox runs ops (drivers, dispatch, COD). Our platform becomes a thin front-end tenant pushing orders in.

```
Ezhalha (thin front)
  push orders → Shipox DMS
                   ├─ drivers
                   ├─ dispatch
                   └─ COD reconcile
(our ops layer retired)
```

**Pros**
- Offload dispatch/driver/COD engineering to Shipox.

**Cons**
- Massive overlap — we throw away our own ops layer.
- Two systems-of-record risk; deep coupling; vendor lock-in.
- Zoho/financial flows must re-anchor on Shipox data.
- **Not recommended** unless the business intent is to replace our ops platform.

---

### Option 3 — COD / 3PL Aggregator ❌ *blocked by the API*

Intended model: use Shipox purely as a broker over its sub-carriers (SMSA/J&T/iMile), picking carriers + using Shipox's COD reconciliation, **without** its drivers.

```
Ezhalha
  └─ Shipox (broker)
       ├─ SMSA
       ├─ J&T
       └─ iMile
     COD collected + reconciled via Shipox
```

**Why it's blocked:** The tenant API exposes **no carrier list and no per-carrier selection**. Shipox picks the delivering carrier internally and hides it. We'd only ever get a blended price + Shipox's own routing choice.

**Also:** we already have direct `smsaAdapter`, `jtAdapter`, `aramexAdapter` in `local-carriers.ts` — so a middleman with markup only wins if Shipox's rates/coverage beat our direct contracts.

**Verdict:** not achievable as specified with the current API. Fold into Option 1 if we still want Shipox.

---

## 5. COD & Zoho Reconciliation (applies to Options 1 & 2)

- Shipox **collects the cash** and reconciles COD internally.
- If we push COD orders, money settles **inside Shipox** first → we must pull settlements back into **Zoho Books**.
- **Decision required:** who owns the COD ledger — us or Shipox? Two sources of truth = reconciliation bugs.
- Plan: periodic settlement pull (or webhook on `DELIVERED` + COD collected) → map to Zoho invoice/payment. Preserve our existing Zoho bilingual field conventions.

---

## 6. Security Requirements

- **Credentials:** store Shipox `user/pass` in the encrypted integration config (`INTEGRATION_CONFIG_SECRET`), **not** in env. Keep that secret stable across deploys.
- **Token cache:** cache JWT, refresh on 401. Never log the token.
- **Webhook hardening (no native signature):**
  - Secret token embedded in the callback path (e.g. `/webhooks/shipox/<random-secret>`).
  - IP allowlist for Shipox callback origins.
  - `validateWebhookSignature` implements the shared-secret comparison.
  - Idempotency on status callbacks (dedupe by order_number + status + timestamp).
- Preserve audit logging + idempotency on the create-order POST, consistent with other high-risk integration paths.

---

## 7. Constraints & Gotchas

- **Geocoding required** — rate + order endpoints are lat/lng driven, not postal code.
- **Zonal tariffs** — cache rates; do not call per-quote at FedEx frequency.
- **Opaque carrier** — we cannot see or choose the real delivering carrier.
- **No carrier management via API** — the apps page cannot CRUD Shipox's carriers; only service tiers are surfaceable.
- **Token expiry** — unlike our OAuth carriers.
- **Overlap** — Shipox duplicates our platform; consume one capability only.

---

## 8. Recommendation

Proceed with **Option 1** only, if Shipox adds driver-network / same-day coverage we lack:

1. Build `shipoxAdapter` implementing the 8 `CarrierAdapter` methods against the verified endpoints (§3).
2. Register in `carriers.ts` with a local capability profile (`SA`/`AE`).
3. Add JWT token cache + refresh.
4. Surface `service_types` as selectable tiers in the apps/config page.
5. Harden the webhook (secret path + IP allowlist + idempotency).
6. Define + build COD → Zoho settlement reconciliation.

Reject **Option 2** (cedes our ops layer) and **Option 3** (not supported by the tenant API) unless business scope changes.

---

## 9. Open Questions

- Exact **cancel-order** endpoint/path (confirm in Apiary during build).
- Label format/size from `airwaybill_mini` — PDF? thermal?
- COD settlement: push (webhook) vs pull (report) — which does our Shipox account expose?
- Does our commercial Shipox contract cover its own fleet, its sub-carriers, or both?
- Rate-limit / throttling on `prices/starting_from`.

---

## 10. Endpoint Quick Reference

```
AUTH     POST /api/v1/customer/authenticate            -> id_token (JWT, Bearer)
ACCOUNT  GET  /api/v1/customer/account
TIERS    GET  /api/v1/service_types                    -> service tiers (NOT carriers)
RATES    GET  /api/v2/customer/packages/prices/starting_from
ORDER    POST /api/v2/customer/order                   -> order_number, total_charge
ORDER3   POST /api/v3/customer/order                   -> + boxes[]
STATUS   GET  /api/v1/customer/order/{id}/status
HISTORY  GET  /api/v1/customer/order/{order_number}/history_items
LABEL    GET  /api/v1/customer/orders/airwaybill_mini
REFDATA  GET  /api/v2/customer/{countries|cities|neighborhoods}
TRACKpub GET  /api/v1/public/order/{order_number}/history_items
DRIVER   GET  /api/v1/public/order/{public_id}/driver/location
```

**No endpoint exists to list or manage Shipox's integrated carriers via the customer API.**
