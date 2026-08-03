# Fizzpa & Shipox — Virtual Carrier Integration

**Status:** Implemented (uncommitted working tree)
**Last updated:** 2026-07-21
**Scope:** How Fizzpa and Shipox are integrated as aggregator providers behind client-facing "virtual carriers," and how to configure and operate them.

> Research background lives in [`docs/fizzpa-integration.md`](fizzpa-integration.md) and [`docs/shipox-integration.md`](shipox-integration.md). This document is the build spec for the shipped integration.

---

## 1. The problem this solves

Fizzpa and Shipox are **aggregators**: each routes a shipment to one of several underlying couriers, but **neither API exposes that courier list or lets you select a courier**. There is no `/carriers` endpoint and no per-carrier rate quote (see the research docs). So we cannot:

- fetch their downstream couriers, or
- ask their API to use a specific courier, or
- get a live per-courier rate.

**What we can do:** define our own **virtual carriers** on top of each provider. A virtual carrier is a client-facing courier (e.g. "X Express") that:

1. shows to clients as its own pickable carrier at shipment creation, priced from its **own local rate card**;
2. on booking, routes to the real provider adapter (**Fizzpa** or **Shipox**); and
3. writes a **note** onto the provider's order telling their ops which downstream courier to assign.

Everything downstream-courier-specific is handled on **our** side (display + rate card + note). The provider API is only used to create/track/cancel the order.

```
Client sees:   [ X Express ]  [ Y Express ]  [ Fizzpa ]  [ Shipox ]   ← virtual carriers
                      │              │             │           │
Provider adapter:  FIZZPA         FIZZPA        FIZZPA      SHIPOX     ← real booking backend
Order note:     "Assign to X"  "Assign to Y"  "Route via   "Route via
                                               Fizzpa"      Shipox"
```

---

## 2. Architecture

### 2.1 Provider adapters (hidden from clients)

`server/integrations/local-carriers.ts` defines two aggregator adapters registered in `carriers.ts`:

| Adapter | `carrierCode` | Provider key | Capability |
|---|---|---|---|
| `FizzpaAdapter` | `FIZZPA` | `fizzpa` | `type: "local"`, `domesticCountries: ["SA"]`, **`providerOnly: true`** |
| `ShipoxAdapter` | `SHIPOX` | `shipox` | `type: "local"`, `domesticCountries: ["SA","AE"]`, **`providerOnly: true`** |

`providerOnly: true` means `carrierService.getLocalCarriers()` **excludes** them from the client rate list — clients never pick Fizzpa/Shipox directly, only virtual carriers. They remain resolvable by code (`getCarrierAdapter("FIZZPA")`) for booking/tracking.

Both `getRates()` return `[]` (no usable live rate API) → pricing always comes from the rate card.

### 2.2 Virtual carriers (client-facing)

`virtual_carriers` table (`shared/schema.ts`):

| Column | Meaning |
|---|---|
| `code` | client-facing carrier code (unique, upper-cased). Also the **rate-card key**. |
| `name` | display name shown to clients |
| `provider` | `fizzpa` \| `shipox` — the real booking adapter |
| `note_template` | note written onto the provider order. `{name}` is substituted; blank → `"Assign to <name>"` |
| `logo` | admin-uploaded brand logo (image data URI); surfaced via `/api/carrier-logos` keyed by `code` |
| `enabled` | only enabled carriers are offered to clients |

Admin CRUD (under `pricing-rules` permission):
```
GET    /api/admin/virtual-carriers
POST   /api/admin/virtual-carriers
PATCH  /api/admin/virtual-carriers/:id
DELETE /api/admin/virtual-carriers/:id
PUT    /api/admin/virtual-carriers/:id/logo     (data-URI image, ≤70 KB)
DELETE /api/admin/virtual-carriers/:id/logo
```
Admin UI: **Pricing → Virtual Carriers** tab (`client/src/pages/admin/virtual-carriers.tsx`), including per-carrier logo upload/replace/remove.

**Logos:** each virtual carrier can carry its own brand logo, exactly like Apps-tab carrier logos. The logo is merged into `GET /api/carrier-logos` keyed by the upper-cased `code`, so the client rates UI (`CarrierLogo`) renders it wherever the virtual carrier appears — no separate wiring. Same data-URI contract and size cap as app logos.

### 2.3 Shipment columns

`shipments` gains two nullable columns:

| Column | Meaning |
|---|---|
| `provider_carrier_code` | real provider adapter to book with (`FIZZPA`/`SHIPOX`). Null for ordinary carriers. |
| `carrier_assignment_note` | the rendered note forwarded to the provider order. |

`carrierCode`/`carrierName` keep the **client-facing** virtual values (so the client, invoices, and ops all see "X Express"); the provider routing lives on `provider_carrier_code`.

---

## 3. End-to-end flow

1. **Rates** — `POST /api/client/local/rates` loops real local carriers **and** enabled virtual carriers. Each virtual carrier is priced from its own rate card (`resolveLocalRate` keyed by the virtual `code`, no live rate). The quote's `shipmentData` records `providerCarrierCode` + `carrierAssignmentNote`.
2. **Checkout** — `POST /api/client/local/checkout` persists `provider_carrier_code` + `carrier_assignment_note` onto the shipment when the quote is a virtual carrier; `carrierCode`/`carrierName` stay the virtual values.
3. **Booking** (on payment finalization) — `getAdapterForShipment` routes to the **provider** adapter via `provider_carrier_code`. `buildGenericCarrierShipmentRequestFromShipment` injects `carrier_assignment_note` as `CreateShipmentRequest.note`. The provider adapter maps it:
   - Fizzpa → `OrderNote`
   - Shipox → `note`
4. **Result** — order lands on the Fizzpa/Shipox dashboard with the assignment note; we store their order id as the tracking number and pull the label (Fizzpa)/track events. Client only ever sees the virtual carrier.

---

## 4. Fizzpa adapter details

- **Base URL:** `https://rest.fizzpa.net/api` (override: `FIZZPA_BASE_URL`)
- **Auth:** `Authorization: <raw key>` (**not** Bearer) + required `Referer` header (wrong value → 401/403)
- **`isConfigured()`** true when `FIZZPA_API_KEY` present
- **Book:** `POST /orders` — `OrderNote` carries the assignment note; label pulled from `GET /orders/label/{id}/en/A6` (PDF → base64)
- **Track:** `GET /Tracking/{id}` · **Cancel:** `DELETE /orders/{id}` (before pickup only; after pickup → false)
- **City IDs (the friction):** `RecipientCityId` is required + numeric and comes from Fizzpa's static `Cities.xlsx` (no live cities API). The admin pastes a JSON name→id map into **`FIZZPA_CITY_MAP`**, e.g. `{"riyadh":1,"jeddah":2}`. Unresolved recipient city → clear `CITY_NOT_RESOLVED` error, not a silent failure.

**Apps-panel credential fields (`fizzpa`):** `FIZZPA_API_KEY` (secret), `FIZZPA_REFERER`, `FIZZPA_CITY_MAP`, `FIZZPA_BASE_URL`.
**Host allowlist:** `rest.fizzpa.net`.

---

## 5. Shipox adapter details

- **Base URL:** `https://prodapi.shipox.com` (override: `SHIPOX_BASE_URL`)
- **Auth:** JWT — `POST /api/v1/customer/authenticate` (username/password) → `id_token`, cached and **refreshed once on a 401**
- **`isConfigured()`** true when `SHIPOX_USERNAME` + `SHIPOX_PASSWORD` present
- **Book:** `POST /api/v2/customer/order` — `note` carries the assignment note; `order_number` → tracking number
- **Track:** `GET /api/v1/customer/order/{order_number}/history_items` → mapped events
- **Cancel:** account-specific status update → not wired; returns false (cancel via Shipox ops) so we never mark a still-live order cancelled
- **Rates:** Shipox's rate API is a blended, geocode-driven tariff with an opaque carrier → not used; price from the rate card

**Apps-panel credential fields (`shipox`):** `SHIPOX_USERNAME`, `SHIPOX_PASSWORD` (secret), `SHIPOX_BASE_URL`.
**Host allowlist:** `prodapi.shipox.com`, `api.shipox.com`.

Credentials for both are AES-256-GCM encrypted with `INTEGRATION_CONFIG_SECRET` (keep stable across deploys).

---

## 6. Setup / operations

1. **Apps panel** → enter Fizzpa and/or Shipox credentials (Fizzpa also needs `FIZZPA_CITY_MAP`).
2. **Pricing → Virtual Carriers** → add one virtual carrier per downstream courier: set `code`, display `name`, `provider`, and the assignment `note`.
3. **Pricing → Local Carriers** → add a rate card (weight bands, cost, markup) for each virtual carrier `code`. Without a rate card, the virtual carrier shows **no rate** to clients.

> **Downstream courier names are not discoverable via API.** Get them from your Fizzpa/Shipox account dashboards/contracts, then create one virtual carrier per courier. Two provider-level placeholders (`FIZZPA_STD` "Fizzpa", `SHIPOX_STD` "Shipox") can stand in until real courier names are configured.

---

## 7. What is and isn't possible

| Capability | Supported | How |
|---|---|---|
| Show downstream couriers to clients | ✅ | virtual carriers (frontend + rate card) |
| Per-courier rate | ✅ | manual rate card per virtual carrier |
| Auto-create order on provider dashboard | ✅ | provider adapter `createShipment` |
| Tell provider which courier to assign | ✅ | order note (`OrderNote` / `note`) |
| **Fetch provider's courier list via API** | ❌ | no endpoint exists |
| **Force a specific downstream courier via API** | ❌ | no selection field — routing is internal to the provider |
| Live per-courier rate from provider API | ❌ | no rate-quote (Fizzpa) / blended-opaque only (Shipox) |

---

## 8. Security & constraints

- Provider credentials stored **encrypted** (`INTEGRATION_CONFIG_SECRET`), never in env; API keys/tokens never logged.
- Audit logging + idempotency preserved on the create-shipment path (same as other carriers).
- Fizzpa cancel works **only before pickup**; Shipox cancel is out-of-band → both fail safe (keep the booking) rather than marking a live order cancelled.
- Tracking is **poll-based** (no provider webhooks) via the existing tracking-refresh scheduler.
- COD is sent as prepaid/zero on both adapters (no COD reconciliation wired this release).

---

## 9. Tests

`tests/virtual-carriers.test.ts` (11 cases): provider capability + `providerOnly`, hidden from the client local list, resolvable by code, no live rate, Fizzpa booking (note + resolved `CityId` + auth/Referer headers + unresolved-city error), Shipox auth→book (note + Bearer), and generic-request note injection for virtual vs ordinary carriers.

---

## 10. Database changes

```sql
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS provider_carrier_code   text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_assignment_note text;

CREATE TABLE IF NOT EXISTS virtual_carriers (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  provider      text NOT NULL,
  note_template text NOT NULL DEFAULT '',
  logo          text,
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamp NOT NULL DEFAULT now(),
  updated_at    timestamp NOT NULL DEFAULT now()
);
-- If the table already exists from an earlier build:
ALTER TABLE virtual_carriers ADD COLUMN IF NOT EXISTS logo text;
```
Apply manually before deploy — **never `db:push`**.
