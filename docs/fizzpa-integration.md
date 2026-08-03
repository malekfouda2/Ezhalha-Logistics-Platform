# Fizzpa (فيزبا) Integration — Full Analysis & Options

**Status:** Research / decision doc (not yet implemented)
**Author:** Engineering
**Last updated:** 2026-07-18
**Scope:** Evaluate integrating Fizzpa's API into the Ezhalha Logistics Platform and document every integration detail and viable option.

---

## 1. What Fizzpa Is

Fizzpa (فيزبا) is a **KSA domestic last-mile logistics carrier**. Publicly it markets itself as a logistics platform with multiple carriers behind it, but **its API exposes only a single-carrier booking surface** — the underlying carriers are not selectable or visible through the API (see §4).

- Contact: `info@fizzpa.net`, +966 54 245 7271
- Distribution channels: direct API, Shopify, WeShip Track (tracking aggregation)
- Behaves, from our platform's perspective, exactly like our other local KSA carriers (SMSA / Naqel / J&T / **Zajil**).

> **Key framing:** Fizzpa is a plain carrier for our purposes. It is **not** a manageable multi-carrier aggregator via the API. Integrate it as one `CarrierAdapter` + a local rate card, the same shape as Zajil.

---

## 2. API Surface (verified from the Apiary blueprint)

- **Production base URL:** `https://rest.fizzpa.net/api`
- **Docs:** https://fizzpa.docs.apiary.io/ (Apiary; blueprint scraped for this doc)
- **Format:** REST / JSON
- **City reference data:** static spreadsheet at `https://fizzpa.net/Cities.xlsx` (NOT a live API — see §4.2)

### 2.1 Authentication

- **Header:** `Authorization: <your key>` — a **raw API key**, NOT a `Bearer` token.
- **Header:** `Referer: <URL>` — **required** on requests. Wrong/missing value can return 401/403. Must be set to the registered domain Fizzpa expects.
- Key validation endpoint: `GET /Auth/me` (returns the account profile; use it as the connectivity/credential test).

### 2.2 Verified endpoints

| Purpose | Method + Path | Notes |
|---|---|---|
| Verify key / profile | `GET /Auth/me` | credential test |
| Create shipment | `POST /orders` | returns order id + fee fields |
| Read order | `GET /orders/{orderid}` | full order incl. price fields |
| Cancel order | `DELETE /orders/{orderid}` | **only before pickup** |
| Label PDF | `GET /orders/label/{orderid}/{lingo}/{size}` | `lingo` = `ar`/`en`, `size` = `A4`/`A6` |
| Track | `GET /Tracking/{orderid}` | status by order id |

### 2.3 What does NOT exist

- ❌ No `/Carriers`, `/Providers`, `/couriers` endpoint — cannot list or manage Fizzpa's underlying carriers.
- ❌ No `/Rates` or `/Price` **quote** endpoint — no pre-booking rate quote.
- ❌ No pickup-scheduling endpoint.

### 2.4 Create-order (`POST /orders`) fields

**Required:** `SenderPhone`, `RecipientName`, `RecipientPhone1`, `RecipientCityId`, `CodAmount`, `OrderPiecesCount`.

**Common optional / structural fields observed in the schema:**

- Recipient: `RecipientAddress`, `RecipientAddressLine`, `RecipientCityId`, `RecipientCityName`, `RecipientPhone2`, `RecipientEmailAddress`, `RecipientNationalAddress`, `RecipientRegionName`, `RecipientCountryCode`
- Sender: `SenderName`, `SenderPhone`, `SenderAddress`, `SenderCityId`, `SenderNationalAddress`
- Pickup: `PickupAddressId`, `PickupAddressLine`, `PickupCityId`, `PickupRegionId`, `PickupDefaultWarehouseId`, `PickupDefaultZoneId`
- Order: `OrderPiecesCount` / `PieceCount`, `OrderTotalWeight`, `OrderNote`, `OrderRef`, `CodAmount`, `CollectionType` / `CollectionTypeId`
- Returned price fields on the order: `PricePerPackage`, `PriceForExtraPiece`, `DeliveryFees`
- Identity/account fields present in schema: `CompanyId`/`CompanyName` (the business account, **not** a carrier), `AgentId` (driver/agent), `CustomerId`

> **Note:** `CompanyId` is the merchant/business account, not a selectable carrier. There is no field to pick a downstream carrier.

### 2.5 Native capabilities

- **COD** via `CodAmount` + `CollectionType`/`CollectionTypeId`.
- **Saudi National Address** via `RecipientNationalAddress` / `SenderNationalAddress`.
- **Bilingual labels** (Arabic / English) and A4 / A6 sizes.

---

## 3. Mapping to Our `CarrierAdapter`

Our carrier interface (`server/integrations/fedex.ts:320`) requires 8 methods. Fizzpa maps as a **local / last-mile** adapter, mirroring `zajilAdapter`:

| Interface method | Fizzpa mapping | Notes |
|---|---|---|
| `isConfigured()` | creds present in encrypted config | |
| `validateAddress` | city-name → `CityId` lookup (from XLSX map) | see §4.2 |
| `validatePostalCode` | n/a (National Address model) | pass-through / stub |
| `checkServiceAvailability` | destination city present in Fizzpa city map | |
| `getRates` | **local rate card** (no Fizzpa rate API) | Zajil-style; see §4.1 |
| `createShipment` | `POST /orders` → order id = trackingNumber | label via `/orders/label/...` (PDF) |
| `trackShipment` | `GET /Tracking/{orderid}` | map to our status enum |
| `cancelShipment` | `DELETE /orders/{orderid}` | only before pickup |
| `validateWebhookSignature` | n/a (no webhooks documented) | poll tracking via scheduler |

**Registration:** add `fizzpaAdapter` in `server/integrations/carriers.ts` alongside the local carriers.

**Capability profile:** `type: "local"`, `domesticCountries: ["SA"]`.

---

## 4. Constraints & Gotchas

### 4.1 No rate API
No quote endpoint exists. The only price data (`PricePerPackage`, `PriceForExtraPiece`, `DeliveryFees`) is returned **on the created order**, i.e. after booking — not as a pre-booking quote.
- **Consequence:** `getRates()` must read from a **Fizzpa rate card configured under Local Pricing** (fixed contract tariff), exactly like Zajil.
- Optional reconciliation: after booking, read `DeliveryFees`/`PricePerPackage` off the order to compare actual charge vs the rate card.

### 4.2 City IDs come from a static spreadsheet
`RecipientCityId` (and `SenderCityId`) are **required and numeric**, sourced from `https://fizzpa.net/Cities.xlsx` — there is no live cities API.
- **Consequence:** we need a **city-name → Fizzpa CityId mapping table** maintained in our system. This is the **biggest integration friction**: our shipment addresses carry city names/National Address, and every booking must resolve to a valid Fizzpa `CityId` or it fails.
- Plan: import the XLSX into a lookup table (seed + periodic manual refresh), map to our internal city list, and fail fast with a clear error when a city can't be resolved.

### 4.3 `Referer` header requirement
Requests require a `Referer: <URL>` header. Wrong value → 401/403.
- **Consequence:** store the expected Referer value as a credential/setting; document what Fizzpa registered for this account.

### 4.4 Auth is a raw key
`Authorization: <your key>` is the raw key (not `Bearer`). Store encrypted (`INTEGRATION_CONFIG_SECRET`); never log it.

### 4.5 COD reconciliation
Fizzpa collects COD (`CodAmount`). Money settles with Fizzpa → must be reconciled into **Zoho Books**. Decide who owns the COD ledger; preserve bilingual Zoho field conventions.

### 4.6 Cancel window
`DELETE /orders/{orderid}` works **only before pickup**. After pickup, cancellation is out-of-band (Fizzpa ops).

### 4.7 No webhooks
No callback/webhook documented → tracking must be **polled** via the express-tracking-refresh scheduler.

### 4.8 Carriers are opaque
Fizzpa may route to multiple underlying carriers, but the API neither lists nor lets you select them. From our side Fizzpa is one carrier.

---

## 5. Options to Work With Fizzpa

### Option A — Full carrier adapter ✅ *recommended*
Register `fizzpaAdapter` implementing all 8 methods; Fizzpa becomes a bookable carrier in the shipment flow and appears in the Apps panel for credentials.

```
CarrierService
  └─ Fizzpa adapter
       getRates    → local rate card (no Fizzpa API)
       createShip  → POST /orders
       label       → GET /orders/label/{id}/{lingo}/{size}
       track       → GET /Tracking/{id}
       cancel      → DELETE /orders/{id}
+ Apps-panel credentials   + Local Pricing rate card   + City-ID map
```

**Pros:** full booking/label/track/cancel; consistent with existing local carriers.
**Cons:** requires the city-ID mapping (§4.2) and a rate card (§4.1) before it's usable.

---

### Option B — Apps-panel credentials only
Add Fizzpa to `INTEGRATION_APP_DEFINITIONS` so credentials store encrypted and it shows in the Apps panel — no live booking yet. Staging step toward Option A (this is what we did for SPL).

**Pros:** smallest change; lets ops enter/validate creds now.
**Cons:** nothing books/tracks through Fizzpa until the adapter lands.

---

### Option C — Tracking-only
Wire only `GET /Tracking/{orderid}` into the tracking-refresh scheduler; bookings originate elsewhere (e.g. Shopify).

**Pros:** minimal; centralizes status visibility.
**Cons:** no booking, labels, or rates through our platform.

---

### ❌ Not possible: "manage their carriers + live multi-carrier rates"
The API exposes **no carrier list/selection and no rate quote**. The aggregator-style model (pick a downstream carrier, compare live rates during shipment creation) **cannot** be built on Fizzpa's API — same wall as Shipox. Rates come from a local rate card; carrier choice is Fizzpa's alone.

---

## 6. Security Requirements

- **Credentials:** store the raw API key + Referer value in the encrypted integration config (`INTEGRATION_CONFIG_SECRET`), not env. Keep that secret stable across deploys.
- Never log the API key.
- Preserve audit logging + idempotency on the create-order POST (consistent with other carrier booking paths).
- COD settlement reconciliation into Zoho (§4.5).

---

## 7. Recommendation

Proceed with **Option A** if Fizzpa adds domestic coverage/price we want, sequenced as:

1. Add Fizzpa to `INTEGRATION_APP_DEFINITIONS` (Apps-panel creds: `FIZZPA_API_KEY`, `FIZZPA_REFERER`, optional `FIZZPA_BASE_URL`).
2. Build the **city-ID mapping** table from `Cities.xlsx` (§4.2) — do this first; it gates everything.
3. Build a **Fizzpa rate card** under Local Pricing (§4.1).
4. Implement `fizzpaAdapter` (create/label/track/cancel) and register in `carriers.ts`.
5. Wire tracking polling into the express-tracking-refresh scheduler.
6. Build COD → Zoho reconciliation.
7. Add a `testFizzpa` probe (`GET /Auth/me`) to the Apps test flow.

Reject the aggregator model (§5) — unsupported by the API.

---

## 8. Open Questions

- Exact `Referer` value Fizzpa expects for our account.
- Order-status code list from `GET /Tracking` → mapping to our internal status enum.
- COD settlement mechanism (report pull vs manual) and cadence.
- Sandbox/test environment availability (blueprint shows production host only).
- `CollectionType` / `CollectionTypeId` value set (COD vs prepaid vs other).
- International lanes: schema has country fields, but city-ID model implies domestic KSA only — confirm scope.
- Rate limits / throttling on `POST /orders` and `GET /Tracking`.

---

## 9. Endpoint Quick Reference

```
AUTH    Authorization: <raw key>   +   Referer: <registered URL>
BASE    https://rest.fizzpa.net/api

VERIFY  GET    /Auth/me
CREATE  POST   /orders                                  -> order id, DeliveryFees, PricePerPackage
READ    GET    /orders/{orderid}
CANCEL  DELETE /orders/{orderid}                         (before pickup only)
LABEL   GET    /orders/label/{orderid}/{lingo}/{size}    (ar|en, A4|A6) -> PDF
TRACK   GET    /Tracking/{orderid}

CITIES  static file: https://fizzpa.net/Cities.xlsx      (import → CityId map)
```

**No endpoint exists to list/manage Fizzpa's carriers, and no rate-quote endpoint exists.** Rates = local rate card (Zajil model); carrier routing is internal to Fizzpa.
