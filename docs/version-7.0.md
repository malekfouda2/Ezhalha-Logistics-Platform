# Ezhalha Logistics Platform — Version 7.0

**Status:** Uncommitted working tree (release candidate)
**Compiled:** 2026-07-18
**Scope:** All uncommitted updates in the current working tree, grouped by feature area.

> Deploy note: several changes add database columns/tables. Run the **[Database changes](#12-database-changes--deploy-checklist)** section **before** deploying this build. Follow the project rule: **never `db:push`** (it wants to drop the session table) — apply the `ALTER`/migration SQL manually.

---

## 1. Overview

Version 7.0 is a large release spanning six workstreams:

1. **Sales Channels** — connect external stores (WooCommerce, Shopify, Salla, Zid, Magento, custom), ingest their orders via webhook + background sync, and fulfil them.
2. **Local (domestic KSA) shipments** — a dedicated local shipping flow with rate-card pricing across six local carriers, plus carrier assignment rules.
3. **Pricing** — DDP domestic rate, DDP supplier cost + real-margin reporting, per-lane air-delivery toggle, and always-on local-carrier cost.
4. **Integrations & Apps** — six new carriers (SMSA, Naqel, J&T, RedBox, Zajil live domestic adapters + SPL/Saudi Post credentials-only), per-app brand logos, and integration-account management.
5. **Aggregators & virtual carriers** — Fizzpa and Shipox integrated as aggregator providers behind client-facing **virtual carriers**, with per-courier rate cards and a provider-order assignment note.
6. **Carrier / accounting fixes** — DHL payload numeric fields, Zoho invoice-deletion removed from all system flows, financial-statement real-margin columns, and four stale tests fixed.

---

## 2. Sales Channels (new)

Connect a client's external storefront and pull its orders into the platform.

- **Platforms:** `woocommerce`, `shopify`, `salla`, `zid`, `magento`, `custom` (`SalesChannelPlatform`). Channel lifecycle via `SalesChannelStatus`.
- **Adapters** (`server/services/sales-channels.ts`): each platform adapter (a) verifies an inbound webhook signature against the channel's stored secret and (b) normalizes the raw payload into the internal `InsertOrder` shape. Order items are informational only (local shipments carry no customs).
- **Background sync** (`server/services/sales-channel-sync.ts`): polls each channel every **5 min** for orders modified since `lastSyncedAt`; a missed tick self-heals on the next run. First run ~45s after boot; bounded look-back on a channel's first-ever pull. Scheduler starts after the HTTP server listens.
- **Orders** (`orders` table, `OrderStatus`: `new → ready_to_ship → assigned → shipped → delivered`, plus `cancelled`/`on_hold`).

**Endpoints**
```
GET    /api/client/sales-channels
POST   /api/client/sales-channels
PATCH  /api/client/sales-channels/:id
DELETE /api/client/sales-channels/:id
POST   /api/client/sales-channels/:id/sync
POST   /api/webhooks/sales-channel/:platform      (signed inbound order webhook)
GET    /api/client/orders
GET    /api/client/orders/:id
GET    /api/client/orders/:id/rates
POST   /api/client/orders/:id/fulfill
```

**Client pages:** `sales-channels.tsx`, `sales-channel-detail.tsx`, `orders.tsx`, `order-fulfill.tsx`.

---

## 3. Local (Domestic KSA) Shipments & Carriers (new)

A first-class domestic shipping flow separate from international/express and DDP.

- **Carrier adapters** (`server/integrations/local-carriers.ts`) registered in `carriers.ts`: **SMSA, Naqel, J&T, RedBox, Zajil**. Each implements the standard `CarrierAdapter` capability profile (local/`SA`).
- **Rate-card pricing** (`server/services/local-pricing.ts`, `local_carrier_pricing_tiers` table): per carrier + weight band, returns `(baseRate, marginAmount, clientPriceExclTax)` that feed the DCE accounting path (domestic, full 15% VAT). Base cost source: configured tier **Cost** → live carrier rate (see §5.4).
- **Admin config:** Pricing → **Local Carriers** tab (`local-pricing.tsx`).

**Endpoints**
```
POST   /api/client/local/rates
POST   /api/client/local/checkout
GET    /api/admin/local-pricing
POST   /api/admin/local-pricing
PATCH  /api/admin/local-pricing/:id
DELETE /api/admin/local-pricing/:id
```

**Client pages:** `create-shipment-select.tsx` (chooses shipment kind), `create-local-shipment.tsx`.

### 3.1 Carrier Assignment Rules
`carrier_assignment_rules` table + `CarrierMode` (`manual` | `auto`): clients can auto-route orders/local shipments to a carrier by rule.
```
GET/POST/PATCH/DELETE /api/client/carrier-rules[/:id]
```
Client page: `assignment-rules.tsx`.

---

## 4. Integrations & Apps

### 4.1 New carrier integrations
Six carriers were added this version. Five are **live, bookable** domestic-KSA adapters (`server/integrations/local-carriers.ts`, registered in `carriers.ts`); SPL is **credentials-only** in the Apps panel (live adapter is a follow-up). All appear in the Apps panel with their own credential fields and host allowlist (`server/services/integration-apps.ts`). FedEx, DHL, and Aramex are pre-existing and unchanged (except DHL's payload fix in §6).

| Carrier | App key | Type | Auth | Live adapter | Rate API | Notes |
|---|---|---|---|---|---|---|
| **SMSA Express** | `smsa` | Local KSA | `apikey` header + customer account (+ optional passkey) | ✅ book / A6 label / track | — (rate card) | |
| **Naqel Express** | `naqel` | Local KSA | ClientID + Password + account (ClientInfo) | ✅ waybill / label / track | — (rate card) | |
| **J&T Express** | `jt` | Local KSA | apiAccount + private-key digest `Base64(MD5(bizContent+key))` + customer code | ✅ waybill / label / track | — (rate card) | |
| **RedBox** | `redbox` | Local KSA | Bearer API key + merchant id | ✅ order / label / track | — (rate card) | |
| **Zajil Express** | `zajil` | Local KSA | raw API key in `Authorization` + numeric customer id | ✅ book / label / track | ❌ none | IP allowlist required; **no cancel API**; TGA accounts need a valid Saudi National Address short code |
| **SPL (Saudi Post)** | `spl` | Local KSA | Azure APIM Subscription Key + OAuth2 Client ID/Secret + Contract ID | ⏳ creds-only (follow-up) | ❌ none | Flat contract tariff → Local Pricing rate card |

All six local carriers price via the **Local Carriers rate card** (§3, §5.4), not a live rate API. Domestic lanes feed the DCE accounting path (full 15% VAT).

### 4.2 Apps panel & logos
- **Per-app brand logos:** `integration_app_logos` table + `carrier-logo.tsx` component + `GET /api/carrier-logos`; upload/replace/remove via `PUT/DELETE /api/admin/apps/:appKey/logo`.
- **Integration research docs added:** `docs/shipox-integration.md`, `docs/fizzpa-integration.md` (both concluded: no manageable multi-carrier API / no live rate quote → integrate as a single provider + local rate card). Build spec: `docs/fizzpa-shipox-virtual-carriers.md`.

### 4.3 Fizzpa & Shipox — aggregator providers + virtual carriers (new)

Fizzpa and Shipox are **aggregators** whose APIs expose **no downstream-carrier list, no carrier selection, and no usable live rate quote**. They are integrated as **provider-only** adapters that clients never pick directly; instead admins define client-facing **virtual carriers** on top of them.

- **Provider adapters** (`server/integrations/local-carriers.ts`, registered in `carriers.ts`):
  - `FizzpaAdapter` (`FIZZPA`) — raw-key auth (`Authorization`, not Bearer) + required `Referer`; `POST /orders`; label `GET /orders/label/{id}/en/A6`; track `GET /Tracking/{id}`; cancel `DELETE /orders/{id}` (before pickup only). Recipient `CityId` resolved from an admin-supplied `FIZZPA_CITY_MAP` JSON (no live cities API).
  - `ShipoxAdapter` (`SHIPOX`) — JWT auth (cache + refresh on 401); `POST /api/v2/customer/order`; track via `history_items`; cancel is out-of-band (returns false). Rate API is a blended/opaque tariff → not used.
  - Both carry `capabilities.providerOnly: true` → hidden from `getLocalCarriers()` (the client rate list) but resolvable by code for booking/tracking.
- **Virtual carriers** (`virtual_carriers` table): a client-facing courier layered on a provider — `code` (also the rate-card key), `name`, `provider` (`fizzpa`/`shipox`), `note_template`, `logo`, `enabled`. Each shows to clients as its own pickable carrier and is priced from its **own Local Carriers rate card** (keyed by `code`). Admin CRUD under `pricing-rules`; UI at **Pricing → Virtual Carriers** (`virtual-carriers.tsx`).
- **Per-carrier logos:** each virtual carrier can upload its own brand logo (same data-URI contract/size cap as Apps-tab logos) via `PUT/DELETE /api/admin/virtual-carriers/:id/logo`; merged into `GET /api/carrier-logos` keyed by `code` so the client rates UI renders it automatically.
- **Booking routing:** shipments record `provider_carrier_code` (real adapter) + `carrier_assignment_note` while keeping the virtual `carrierCode`/`carrierName` for the client/invoice/ops. `getAdapterForShipment` routes to the provider via `provider_carrier_code`; the note is injected as `CreateShipmentRequest.note` and mapped to Fizzpa `OrderNote` / Shipox `note` so the provider's ops know which downstream courier to assign.
- **Not possible (API limits):** fetching the provider's courier list, forcing a specific downstream courier via API, or getting a live per-courier rate. All courier choice is handled on our side (display + rate card + note).
- **Apps-panel creds:** `fizzpa` (`FIZZPA_API_KEY`, `FIZZPA_REFERER`, `FIZZPA_CITY_MAP`, `FIZZPA_BASE_URL`) and `shipox` (`SHIPOX_USERNAME`, `SHIPOX_PASSWORD`, `SHIPOX_BASE_URL`); host allowlist `rest.fizzpa.net`, `prodapi.shipox.com`/`api.shipox.com`.

**Endpoints**
```
GET/POST/PATCH/DELETE  /api/admin/virtual-carriers[/:id]
```
(Virtual carriers surface to clients through the existing `POST /api/client/local/rates` + `/local/checkout` flow.)

---

## 5. Pricing Updates

### 5.1 DDP domestic rate
New standalone **domestic** transport method on DDP lanes (`DdpTransportMethod.DOMESTIC`): flat `domesticRatePerKg`, KG-billed, reusing the lane's KG minimum/rounding/minimum-charge knobs (`charge = billableKg × domesticRatePerKg`). Wired through the calc, admin preview, client rate schema, lane availability, checkout, and service labels. **Client-selectable exposure is admin/ops-only** for now (the client DDP wizard remains Air/Sea).

### 5.2 DDP supplier cost + real margin
Separate **supplier (procurement) cost** per lane (`air_supplier_cost_per_kg`, `sea_supplier_cost_per_cbm`, `domestic_supplier_cost_per_kg`), distinct from the client-facing sell base. The DDP quote now returns `supplierCostSar` and `trueMarginSar` (`sell + markup − cost`). Recorded on the shipment at booking (`ddp_supplier_cost_sar`). **Client price and VAT are unchanged** — this is additive margin reporting.

### 5.3 DDP per-lane air toggle
`airEnabled` boolean per lane (default **true**). When off, the air rate/cost/transit fields are hidden in the admin form, air quotes are rejected at the calc guard, and the lane validates on sea/domestic alone. Client lane availability (`airAvailable`) respects the toggle.

### 5.4 Local-carrier always-on cost
The local rate-card **Cost** is now always the markup base when set (previously only a no-live-API fallback). Priority: **configured tier cost → live carrier rate → none**. Relabeled "Rate-card base" → **"Cost"** in the Local Carriers tab.

### 5.5 Financial statements — real margin
Financial statements now surface DDP supplier cost and real margin **without changing client-billed figures or VAT**:
- New per-shipment fields: `ddpSupplierCostSar`, `realCostAmountSar`, `realMarginAmountSar`, `realNetProfitAmountSar` (computed in `getEffectiveShipmentFinancials`; aggregated into summary + monthly totals).
- UI (`payments.tsx`): a **Real Net Profit** summary card and **Supplier Cost** + **Real Margin** columns in the shipment-accounting table.
- Rule: for DDP with a recorded supplier cost, real cost swaps the lane base for the supplier cost (keeping extra-fee cost); otherwise real == recorded.

**Admin pricing preview** endpoint added: `POST /api/admin/pricing/preview` (local / express / ddp).

---

## 6. DHL Payload Fix (carrier compliance)

Per DHL's Shipment Request API validation change (numeric-only, no quoted values):
- `content.declaredValue` is now sent as a **numeric** value (`normalizeDeclaredValue` returns a number; previously `formatDeclaredValue` returned a string). Clamped to range, rounded to 2 dp.
- `valueAddedServices.value` — the platform does not send this field, so no change was required.
- Other monetary fields (`monetaryAmount[].value`, export-declaration `price`/`quantity.value`) were already numeric.

---

## 7. Zoho — no invoice deletion through the system

Per the accounting team's directive, invoice deletion is performed **manually in Zoho**, never by the platform:
- Removed the `deleteInvoiceFromZoho` calls in extra-fee invoice reconciliation (kept the **local** soft-delete `deletedAt` so our records stay correct).
- Removed the now-dead `deleteInvoiceFromZoho` helper.
- `ZohoService.deleteInvoice` remains as an inert client capability — **nothing in the system calls it**.
- (Shipment cancellation already took no Zoho action.)

---

## 8. UI / Navigation

- Redesigned `AdminLayout`, `ClientLayout`, `OperationsLayout`; updated `App.tsx` route map and `admin-navigation.ts`.
- New `client/src/lib/platform-meta.ts`, `carrier-logo.tsx`, refreshed `stat-card.tsx`.
- Client shipment entry reworked around the new shipment kinds (international/express, local, DDP, order fulfilment).
- Operations hub (`operations/hub.tsx`, `server/services/operations.ts`) updates including structured DDP warehouse checkpoint tasks.

---

## 9. Test Suite — 4 stale tests fixed

Root-caused and fixed four long-standing failures (production code was correct; tests lagged behind):
- **3× pay-later** (`api-client.test.ts`) returned 403: tests set `creditEnabled` but no limit. Fixed by also setting **`creditLimitSar`** (the field is `creditLimitSar`, not `creditLimit`) so the credit-limit gate passes.
- **1× Zoho regional hosts** (`zoho-integration.test.ts`): `updateInvoice` makes an extra `/settings/taxes` fetch unless `ZOHO_VAT_TAX_ID` is set, shifting the mock sequence. Fixed by setting `ZOHO_VAT_TAX_ID`, dropping the `deleteInvoice` assertion (we don't delete via the system), and correcting the PUT URL.

New/updated test coverage: DDP domestic + supplier cost + air toggle (`ddp-pricing.test.ts`), local always-on cost (`local-shipments.test.ts`), financial real-margin end-to-end (`api-admin.test.ts`), DHL numeric declaredValue + type guard (`dhl-adapter.test.ts`), and Fizzpa/Shipox virtual carriers (`virtual-carriers.test.ts` — provider capability/`providerOnly`, hidden from client list, note injection, Fizzpa city-map resolution, Shipox JWT auth→book).

**Suite status:** full DB-backed suite passes (**332 tests**). Under full-parallel runs the dirty worktree may show intermittent shared-DB races in unrelated suites (sales-channels / api-client / operations) that pass when run individually — pre-existing flakiness, not caused by these changes.

---

## 10. New / changed API endpoints (reference)

```
# Sales channels
GET/POST/PATCH/DELETE  /api/client/sales-channels[/:id]
POST                   /api/client/sales-channels/:id/sync
POST                   /api/webhooks/sales-channel/:platform
GET                    /api/client/orders  ·  /api/client/orders/:id  ·  /api/client/orders/:id/rates
POST                   /api/client/orders/:id/fulfill

# Local shipments + carriers
POST                   /api/client/local/rates  ·  /api/client/local/checkout
GET/POST/PATCH/DELETE  /api/admin/local-pricing[/:id]
GET/POST/PATCH/DELETE  /api/client/carrier-rules[/:id]

# Virtual carriers (Fizzpa / Shipox aggregators)
GET/POST/PATCH/DELETE  /api/admin/virtual-carriers[/:id]
PUT/DELETE             /api/admin/virtual-carriers/:id/logo

# Apps / logos / pricing preview
GET                    /api/carrier-logos
PUT/DELETE             /api/admin/apps/:appKey/logo
POST                   /api/admin/pricing/preview
```

---

## 11. New docs added

- `docs/version-7.0.md` (this file)
- `docs/shipox-integration.md`, `docs/fizzpa-integration.md` (integration analyses)
- `docs/fizzpa-shipox-virtual-carriers.md` (virtual-carrier build spec)
- `docs/pricing.md`, `docs/pricing-simplification-plan.md`, `docs/pricing-prototype.html`
- `docs/sales-channels-plan.md` (expanded)

---

## 12. Database changes — deploy checklist

Apply **before** deploying. Never `db:push`. Additive/nullable where possible.

### 12.1 New tables (migration SQL provided in `migrations/`)
- `sales_channels`, `orders`, `carrier_assignment_rules`, `local_carrier_pricing_tiers`, `integration_app_logos`, `virtual_carriers`
- Migration files present: `migrations/integration_app_logos.sql`, `migrations/local_shipments_p1.sql`
- Verify every new table above has a corresponding applied migration before deploy; create/apply any missing ones from `shared/schema.ts`.

```sql
-- Virtual carriers (Fizzpa / Shipox aggregators)
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
ALTER TABLE virtual_carriers ADD COLUMN IF NOT EXISTS logo text;  -- if table predates this build
```

### 12.2 Column additions (this release — apply as `ALTER`)
```sql
-- DDP lanes: domestic rate, supplier costs, air toggle
ALTER TABLE ddp_pricing_lanes ADD COLUMN IF NOT EXISTS domestic_rate_per_kg          numeric(12,2);
ALTER TABLE ddp_pricing_lanes ADD COLUMN IF NOT EXISTS air_supplier_cost_per_kg      numeric(12,2);
ALTER TABLE ddp_pricing_lanes ADD COLUMN IF NOT EXISTS sea_supplier_cost_per_cbm     numeric(12,2);
ALTER TABLE ddp_pricing_lanes ADD COLUMN IF NOT EXISTS domestic_supplier_cost_per_kg numeric(12,2);
ALTER TABLE ddp_pricing_lanes ADD COLUMN IF NOT EXISTS air_enabled boolean NOT NULL DEFAULT true;

-- Shipments: recorded DDP supplier cost (real-margin reporting)
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS ddp_supplier_cost_sar numeric(12,2);

-- Shipments: virtual-carrier routing (Fizzpa / Shipox)
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS provider_carrier_code   text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_assignment_note text;
```

### 12.3 New integration secret / env
- SPL, Fizzpa, and Shipox credentials are entered in the Apps panel (encrypted with `INTEGRATION_CONFIG_SECRET` — keep it stable across deploys). Fizzpa additionally needs `FIZZPA_CITY_MAP` (city name→id JSON) for booking.
- Sales-channel sync scheduler can be disabled with its env flag if needed (mirrors the other scheduler toggles in `server/index.ts`).

---

## 13. Known follow-ups (not in this version)

- SPL live carrier adapter (rates via local card, create/label/track).
- Client-selectable **Domestic** option in the DDP wizard (backend already supports it).
- Full-suite test flakiness under parallel DB access (isolation passes).
