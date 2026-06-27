# Sales Channels & Local Shipments — Feature Plan

> Status: **Planning / prototype only.** No implementation yet. Companion interactive prototype: [`sales-channels-prototype.html`](./sales-channels-prototype.html) (open in a browser).

## 1. Goal

Let Ezhalha clients **connect their e-commerce stores** (WooCommerce, Shopify, Salla, Zid, …), have their **orders flow into Ezhalha automatically**, and turn each order into a **shipment** booked with a growing list of **local + international carriers** (SMSA, SPL/Saudi Post, Naqel, Zajil, FedEx, DHL, Aramex, …). Carrier choice per order is either **automated** (rules) or **manual** (per the client's preference).

### Decisions locked (review round 1)

- **Platforms in scope:** all of them — Salla, Zid, WooCommerce, Shopify, Magento, + a custom/API option.
- **Carriers:** none chosen yet — capabilities to be proven via the prototype/integration first.
- **No COD.** Local shipments are paid the same way as Express/DDP: **Tap (Pay Now)** or **Credit / Pay Later** (the existing credit scope/limits apply identically). No cash-on-delivery anywhere.
- **Default carrier mode = manual.** The client picks the carrier per order. Automation (rules) is **opt-in** — the client enables it themselves.
- **Who fulfills:** deferred (client self-serve vs operations) — to decide later.
- **Local create flow = the Express/DDP flow minus customs:** Sender → Recipient → Pieces & Weight → Select Rate → Payment (Tap / Credit) → Confirmation. **No commercial invoice, no item list, no HS codes.**
- **Local pricing:** carrier-based pricing tiers (see §4a).

This introduces three intertwined capabilities:

| # | Capability | Summary |
|---|---|---|
| A | **Local Shipments** | A new shipment type alongside *Express* and *DDP*, for domestic KSA delivery via local carriers (COD support, domestic zones). |
| B | **Carrier expansion** | Add SMSA, SPL, Naqel, Zajil (+ framework to keep adding) on top of FedEx/DHL/Aramex. |
| C | **Sales Channels (Orders)** | Connect e-commerce platforms → ingest orders → convert to shipments with auto/manual carrier assignment. |

## 2. Where this fits in the current system

- **Shipment kinds** today: `OperationShipmentKind = { DDP, EXPRESS }` (`shared/schema.ts`), derived from `fulfillmentType` / `isDdp` / `carrierCode`. → **add `LOCAL`.**
- **Carriers**: `CarrierService` registers adapters (`server/integrations/carriers.ts`) implementing a common `CarrierAdapter` interface (`getRates`, `createShipment`, `trackShipment`, label, cancel). → **add local-carrier adapters.**
- **Client portal nav** (`client-layout.tsx`): Dashboard / Shipments / DDP / Invoices / … → **add Sales Channels + Orders + Local.**
- **Operations hub** views: Door-to-Door (DDP) / Express / Needs Attention / … → **add a Local queue.**
- **Encrypted credentials**: integration accounts are AES-256-GCM encrypted with `INTEGRATION_CONFIG_SECRET`. → **reuse the same pattern for channel + carrier credentials.**
- **Auto-assignment**: operations shipments already auto-assign to the least-loaded DDP agent. → **extend for local/order fulfillment.**

## 3. Domain model (new tables)

```
sales_channels
  id, client_account_id, platform (woocommerce|shopify|salla|zid|magento|custom),
  name, store_url, status (connected|error|disconnected),
  credentials_encrypted (oauth tokens / api keys),
  webhook_secret, sync_settings (json: auto_sync, sync_window, import_paid_only),
  carrier_mode (auto|manual), default_carrier_rule_id,
  last_synced_at, created_at, updated_at

orders
  id, client_account_id, sales_channel_id,
  external_order_id, external_order_number,
  status (new|ready_to_ship|assigned|shipped|delivered|cancelled|on_hold),
  customer (json: name, phone, email),
  ship_to (json: address, city, region, country, postal),
  items (json[] — informational only, not used for customs), package (weight, dims, pieces),
  currency, order_total,
  carrier_mode (manual|auto), assigned_carrier_code, assignment_rule_id,
  shipment_id (nullable, set on fulfillment),
  synced_at, created_at, updated_at
  UNIQUE (sales_channel_id, external_order_id)   -- idempotent ingest

carrier_assignment_rules
  id, client_account_id, name, priority, enabled,
  conditions (json: region/city in, weight range, cod boolean, value range, channel),
  strategy (specific_carrier|cheapest|fastest),
  carrier_code (when strategy=specific_carrier),
  created_at, updated_at

carriers (config/registry — optional, can stay code-driven first)
  code, name, type (local|international|both), supports_cod, supports_label,
  countries[], enabled, credentials_encrypted
```

Extend `shipments`: reuse existing columns; set kind = LOCAL (via `fulfillmentType`/flag), add `order_id` (nullable FK-ish), `cod_amount`. Add `LOCAL` to `OperationShipmentKind`.

## 4. Carrier framework

- Keep the existing `CarrierAdapter` interface; add adapters: **SMSA, SPL (Saudi Post), Naqel, Zajil**.
- Each declares a **capability profile**: `{ type: local|international|both, supportsCOD, domesticZones, labelFormat, trackingMode }`.
- A **capability matrix** drives which carriers are offered for a given lane (local vs international, COD vs prepaid, destination country/city).
- Credentials encrypted per integration account (existing pattern). Admin configures + enables carriers; capability matrix surfaces them to clients.

## 4a. Local pricing tiers (per carrier)

Express and DDP already have pricing tiers. **Local shipments get their own pricing model, keyed by carrier**, because each local carrier has its own cost structure. The client-facing price = carrier base rate (from the carrier's rate API or a rate card) **+ Ezhalha markup**, where the markup is defined in **weight-banded tiers per carrier**.

```
local_carrier_pricing_tiers
  id, carrier_code (SMSA|Naqel|Zajil|SPL|…),
  min_weight_kg, max_weight_kg,        -- the band, e.g. 0–1, 1–5, 5–10, 10+
  markup_type (percent|flat),
  markup_value,                        -- e.g. 18 (%) or 12 (SAR)
  min_charge,                          -- optional floor
  client_profile (regular|mid_level|vip|null),  -- optional, mirrors existing tier profiles
  enabled, created_at, updated_at
```

Example (admin-configured):

| Carrier | Weight band | Markup |
|---|---|---|
| Naqel | 0–5 kg | +18% |
| Naqel | 5 kg and above | +12% (min SAR 8) |
| SMSA | 0–2 kg | +20% |
| SMSA | 2 kg and above | +15% |
| Zajil | any | flat +SAR 10 |

Resolution order at quote time: pick the carrier → find the tier whose weight band contains the shipment weight (and matches the client profile if set) → apply markup to the carrier base rate → enforce `min_charge`. Admin manages these tiers in the existing Pricing admin area, with a new **"Local (by carrier)"** tab next to Express/DDP.

## 5. Sales-channel sync

- **Platform adapters** (one per platform) handle auth + order mapping:
  - WooCommerce: REST API key/secret + webhooks.
  - Shopify: OAuth app + webhooks.
  - Salla / Zid: OAuth + webhooks (KSA-native; priority).
  - Custom: signed webhook + documented payload.
- **Ingest path**: platform webhook → `POST /api/webhooks/sales-channel/:platform` → verify signature → normalize → upsert `orders` (idempotent on `external_order_id`). Polling fallback for missed webhooks.
- **Address normalization**: KSA city/region mapping so local carriers accept the destination; phone normalization (+966).
- **Status push-back**: when a shipment is booked/shipped/delivered, update the order's fulfillment + tracking on the source platform.

## 6. Order → Shipment flow

1. **Order synced** → lands in the Orders inbox (`new`).
2. **Review / validate** (address, weight, COD).
3. **Carrier assignment**:
   - *Auto*: rule engine evaluates `carrier_assignment_rules` (by region/weight/COD/value) → picks specific carrier, or cheapest/fastest from a live rate query.
   - *Manual*: client/ops picks a carrier from a **rate-comparison panel** (live rates across eligible carriers).
4. **Payment** → **Tap (Pay Now)** or **Credit / Pay Later** (same checkout + credit scope as Express/DDP). No COD.
5. **Create shipment** (book with carrier, get AWB + label).
6. **Fulfill** → push tracking + status back to the store.

`carrier_mode` defaults to **manual** per channel; the client can switch a channel to **auto** and overrides are allowed per order.

## 7. UI surfaces

**Client portal**
- **Sales Channels**: connected-store cards (status, last sync), "Connect store" wizard, per-channel settings (auto/manual, sync rules).
- **Orders**: inbox table (filters: channel, status, carrier, COD), per-order detail with carrier assignment + rate compare, bulk fulfill.
- **Auto-assignment rules**: rule list + builder.
- **Local shipments**: create flow with local-carrier picker + rates (or folded into existing Shipments with a "Local" type).

**Operations portal**
- New **Local** queue in the hub (next to Door-to-Door / Express).
- Order-fulfillment workspace for ops-assisted bookings.

**Admin portal**
- **Carrier management**: enable/configure SMSA/SPL/Naqel/Zajil, capability matrix.
- **Platform app credentials**: per-platform OAuth app config.
- New **RBAC permissions**: `orders:read|update|fulfill`, `sales-channels:read|manage`, `carrier-rules:manage`.

## 8. Phasing

| Phase | Deliverable |
|---|---|
| **P1 — Local foundation** | `LOCAL` shipment kind; 2 local carriers (SMSA, Naqel); manual carrier select; local create flow; ops Local queue. |
| **P2 — First channel** | Sales Channels model + 1 platform (Salla *or* WooCommerce); order ingest (webhook + idempotency); Orders inbox; manual fulfill → shipment. |
| **P3 — Automation** | Carrier-assignment rule engine + live rate comparison; auto vs manual per channel; status push-back. |
| **P4 — Scale** | More platforms (Shopify, Zid); more carriers (SPL, Zajil); COD reconciliation; bulk ops; analytics. |

## 9. Risks & cross-cutting concerns

- **Credential security**: reuse AES-256-GCM + `INTEGRATION_CONFIG_SECRET`; never log secrets.
- **Webhook security**: per-platform signature verification, fail-closed in prod (mirror Tap/FedEx pattern).
- **Idempotency**: dedupe on `(sales_channel_id, external_order_id)`; safe re-sync.
- **Rate limits / retries**: backoff for platform + carrier APIs; queue heavy syncs.
- **Address/phone normalization**: critical for local-carrier acceptance.
- **Payment parity**: local uses the existing Tap + Credit/Pay Later path; no new money-collection surface (no COD).
- **Multi-currency**: local SAR vs international.
- **Operations load**: extend auto-assignment to local/order fulfillment.
- **Schema migrations on prod**: additive `ALTER TABLE` only — **never `db:push`** (it tries to drop the runtime `session` table).
- **Backwards-compat**: Express/DDP flows must remain untouched while `LOCAL` is added.

## 10. Decisions & remaining questions

**Resolved (round 1):** all platforms in scope · no COD (Tap + Credit only) · default carrier mode = manual (auto opt-in) · local create flow = Express/DDP minus customs · local pricing = per-carrier weight tiers (§4a).

**Still open:**
1. Which platforms are built **first** (suggest KSA-native Salla + Zid, then WooCommerce/Shopify)?
2. Which local carriers integrate first (SMSA / Naqel / Zajil / SPL …)?
3. Who fulfills orders — **client self-serve**, **operations**, or both? (deferred)

### On the auto-assignment "cheapest / fastest" strategy (the earlier Q6, explained)

When a channel is set to **auto** and a rule says *"use the cheapest carrier"* (or *fastest*), the system has to know each eligible carrier's price/ETA for that specific order **before** it can pick one. Two ways to get those numbers:

- **Option A — live rate calls (per order):** at fulfillment, call every eligible carrier's rate API for that exact order, compare, pick the cheapest. **Pro:** always accurate, reflects real-time carrier pricing. **Con:** slower (several API calls per order), depends on carrier API uptime, can hit rate limits during bulk fulfilment.
- **Option B — cached rate cards:** keep a stored table of each carrier's price by weight band/zone (refreshed periodically), and pick the cheapest from the cache instantly. **Pro:** fast, works offline, great for bulk. **Con:** can drift from the carrier's real price until refreshed; needs a sync job.

**Recommendation:** start **manual-only** (no cheapest/fastest needed at all — the client just picks). When auto is added, use **Option B (cached rate cards) with an Option-A live re-quote at booking time** to confirm the final price — fast selection, accurate charge. Most "specific carrier" auto-rules don't need rates at all.
