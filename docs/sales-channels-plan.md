# Sales Channels & Local Shipments — Feature Plan (rev 3)

> **Status (rev 3 audit, 2026-07-05):**
>
> - **P1 (Local foundation) — DONE + tested.** LOCAL kind/discriminator/first-branch fix,
>   SMSA+Naqel adapters + capability profile/matrix, `resolveLocalRate` + tiers → DCE,
>   local rate+checkout (Tap/Credit), ops LOCAL queue + task template, admin Local-pricing
>   tab. Tests: [`tests/local-shipments.test.ts`](../tests/local-shipments.test.ts).
>   *Caveat:* SMSA/Naqel are **scaffolding** — `getRates`/`createShipment`/`trackShipment`
>   are stubs; pricing uses the rate-card `baseRateSar`, and booking/label/tracking are
>   manual until the real carrier APIs are wired.
> - **P2 (Channels) — WooCommerce slice DONE (client self-serve).** Data layer
>   (channels/orders/rules storage CRUD + idempotent `upsertOrder`), WooCommerce adapter +
>   KSA normalizers, signed fail-closed ingest webhook, full prototype-matched UI (Sales
>   Channels + wizard, channel detail/settings, Orders inbox, 4-step Fulfill stepper,
>   Assignment Rules CRUD). Tests: [`tests/sales-channels.test.ts`](../tests/sales-channels.test.ts).
>   **Not done:** Salla/Shopify OAuth adapters (need app registration), **ops-assisted
>   fulfill**, polling fallback, sync-settings enforcement, bulk fulfill, status push-back.
> - **P3 (Automation) — NOT built.** Rules are stored + editable but **never evaluated**;
>   no auto-assignment engine, no rule-driven cheapest/fastest, no rich push-back.
> - **P4 (Scale) — NOT built.** Zid/Magento/Custom, SPL/Zajil, analytics.
> - **Admin (prototype) — partial.** Local-pricing tab ✓. Carriers capability-matrix page
>   ✗ (carriers still configured via existing Apps page). Channel-Apps OAuth page ✗ (moot
>   until Salla/Shopify).
> - **Migration** [`migrations/local_shipments_p1.sql`](../migrations/local_shipments_p1.sql)
>   applied locally; **prod apply status unconfirmed** (idempotent; psql — never `db:push`).
>
> See §12 for the itemized not-finished list. Prototype:
> [`sales-channels-prototype.html`](./sales-channels-prototype.html).

## 1. Goal

Let Ezhalha clients **connect their e-commerce stores** (WooCommerce, Shopify, Salla,
Zid, …), have their **orders flow into Ezhalha automatically**, and turn each order
into a **shipment** booked with a growing list of **local + international carriers**
(SMSA, SPL/Saudi Post, Naqel, Zajil, FedEx, DHL, Aramex, …). Carrier choice per order
is either **automated** (rules) or **manual** (per the client's preference).

### Decisions locked (round 1)

- **Platforms to build:** **Salla, WooCommerce, Shopify** (all three). Zid/Magento/
  custom later. OAuth apps for Salla + Shopify are **single platform-level apps** Ezhalha
  owns; WooCommerce is **per-store client-supplied** REST keys. All keys entered later via
  the Apps / Platform-credentials tab (§5a).
- **Carriers:** **SMSA + Naqel both** in P1. Credentials added later via the Apps tab.
- **No COD anywhere.** Local shipments are paid exactly like Express/DDP:
  **Tap (Pay Now)** or **Credit / Pay Later** (existing credit scope/limits apply
  identically). No cash-on-delivery surface exists in this feature.
- **Default carrier mode = manual.** Client picks carrier per order. Automation
  (rules) is **opt-in**.
- **Local create flow = the Express flow minus customs:** Sender → Recipient →
  Pieces & Weight → Select Rate → Payment (Tap / Credit) → Confirmation.
  **No commercial invoice, no item list, no HS codes.**
- **Local pricing:** carrier-based weight-banded markup tiers (§4a).

Three intertwined capabilities:

| # | Capability | Summary |
|---|---|---|
| A | **Local Shipments** | New shipment kind alongside *Express* and *DDP*, for domestic KSA delivery via local carriers. Prepaid only (Tap / Credit). |
| B | **Carrier expansion** | Add SMSA, SPL, Naqel, Zajil (+ framework to keep adding) on top of FedEx/DHL/Aramex. |
| C | **Sales Channels (Orders)** | Connect e-commerce platforms → ingest orders → convert to shipments with auto/manual carrier assignment. |

## 2. Where this fits (verified against the code)

- **Shipment kind** is *derived*, not stored: `getOperationShipmentKind(shipment)`
  (`server/services/operations.ts:242`) returns `DDP` if
  `fulfillmentType === "ddp_manual" || isDdp || carrierCode === "DDP"`, else `EXPRESS`
  if any `carrierCode/carrierName/carrierTrackingNumber` is set, else `null`.
  `OperationShipmentKind = { DDP, EXPRESS }` (`shared/schema.ts:16`).
  > ⚠️ **Collision:** local carriers also set `carrierCode`, so today they would be
  > mis-derived as **EXPRESS**. See §6 for the fix (explicit `fulfillmentType="local"`
  > discriminator + LOCAL branch evaluated **before** the EXPRESS fallback).
- **Carriers** are **code-driven**: `carrierService` hardcodes 3 adapters
  (`server/integrations/carriers.ts:9–13`); each implements `CarrierAdapter`
  (`server/integrations/fedex.ts:312`). Enable/credentials flow through
  `integration_accounts` (AES-256-GCM, `INTEGRATION_CONFIG_SECRET`) keyed by `appKey`.
  The interface has **no capability profile** field today → additive extension (§4).
- **Tax engine:** `calculateShipmentAccounting` /
  `resolveShipmentTaxScenario` (`server/services/shipment-accounting.ts:44,68`).
  `shipmentType="domestic"` → **DCE** scenario → full 15% VAT on the sell amount
  (line 85). `clientTotalAmountSar` is tax-inclusive. `ShipmentType` enum already has
  `domestic|inbound|outbound` (`schema.ts:98`).
  > **LOCAL reuses DCE end-to-end** — same accounting snapshot, same invoice fields,
  > same Zoho DCE path (already live). No new tax code, no new Zoho branch. §4a only
  > has to produce `baseRate` (carrier cost) + `marginAmount` (markup) to hand the
  > engine.
- **Client portal nav:** `navItems` in `client/src/components/client-layout.tsx:50`
  (Dashboard / Shipments / DDP / Invoices / Financial Statements / Credit-Billing /
  Team). → add **Sales Channels**, **Orders** (+ Local folded into Shipments).
- **Checkout:** `/api/client/shipments/checkout` (`server/routes.ts:14149`) rejects DDP
  quotes (14184) and **requires ≥1 item** (14212). → LOCAL needs its own branch that
  skips item/customs validation (§6).
- **Ops task/stage templates** are per-kind (`operations.ts:640` DDP, `:661` Express);
  assignment via `pickLeastLoadedOperationsUser(kind)` (`:939`). → add a LOCAL template
  + LOCAL assignment (§6).
- **Webhook security** precedent: `validateWebhookSignature` (`routes.ts:16167`),
  `/api/webhooks/tap` (`:16605`), `/api/webhooks/fedex` (`:16418`) — mirror for
  sales-channel webhooks (§5).
- **Credit ledger already exists** (v6.5): `creditTransactions` (`schema.ts:1412`),
  credit-limit + available-credit checks. LOCAL "Pay Later" reuses it unchanged.

## 3. Domain model (new tables)

```
sales_channels
  id, client_account_id, platform (woocommerce|shopify|salla|zid|magento|custom),
  name, store_url, status (connected|error|disconnected),
  credentials_encrypted,                      -- AES-256-GCM, same helper as integrations
  webhook_secret, sync_settings (json: auto_sync, sync_window, import_paid_only),
  carrier_mode (auto|manual) default 'manual', default_carrier_rule_id,
  last_synced_at, created_at, updated_at

orders
  id, client_account_id, sales_channel_id,
  external_order_id, external_order_number,
  status (new|ready_to_ship|assigned|shipped|delivered|cancelled|on_hold),
  customer (json: name, phone, email),
  ship_to (json: address, city, region, country, postal),
  items (json[] — INFORMATIONAL ONLY, never customs), package (weight, dims, pieces),
  currency, order_total,                       -- store value; NOT collected by us (no COD)
  carrier_mode (manual|auto), assigned_carrier_code, assignment_rule_id,
  shipment_id (nullable, set on fulfillment),
  synced_at, created_at, updated_at
  UNIQUE (sales_channel_id, external_order_id)  -- idempotent ingest

carrier_assignment_rules
  id, client_account_id, name, priority, enabled,
  conditions (json: region/city in, weight range, value range, channel),  -- NO cod field
  strategy (specific_carrier|cheapest|fastest),
  carrier_code (when strategy=specific_carrier),
  created_at, updated_at

local_carrier_pricing_tiers                     -- §4a
  id, carrier_code, min_weight_kg, max_weight_kg,
  markup_type (percent|flat), markup_value, min_charge,
  client_profile (regular|mid_level|vip|null),  -- mirrors pricing_rules.profile
  enabled, created_at, updated_at
```

`carriers` DB registry is **deferred** — carriers stay code-driven (adapters) + enabled
via `integration_accounts` appKeys, matching today's FedEx/DHL/Aramex pattern. Revisit a
DB registry only if non-technical admins must add carriers without a deploy.

Extend `shipments` (additive columns): `order_id` (varchar, nullable). **No `cod_amount`
column** (locked: no COD). LOCAL discriminator = `fulfillmentType = "local"` (existing
column, `schema.ts:551`) — no new kind column needed.

Add `LOCAL` to `OperationShipmentKind` (`schema.ts:16`).

## 4. Carrier framework

- Keep the `CarrierAdapter` interface; add adapters **SMSA, Naqel** first (SPL, Zajil
  later). Register in `carrierService` constructor (`carriers.ts:9`).
- **Additive interface extension** — add a capability profile so a lane can filter
  eligible carriers without instantiating every adapter:
  ```ts
  // append to CarrierAdapter (fedex.ts:312) — optional to keep existing adapters valid
  capabilities?: {
    type: "local" | "international" | "both";
    domesticCountries?: string[];   // e.g. ["SA"] for local carriers
    domesticZones?: boolean;
    labelFormat?: "PDF" | "ZPL";
    trackingMode?: "push" | "poll";
  };
  ```
  International adapters default `type:"international"` (or omit → treated as
  international). No COD capability flag (removed).
- A **capability matrix** picks carriers for a lane (local KSA-domestic vs international
  by destination country). For LOCAL: offer adapters whose `capabilities.type ∈
  {local, both}` and `domesticCountries` includes `SA`.
- Credentials encrypted per integration account (existing pattern). Admin
  enables/configures; matrix surfaces enabled+configured carriers to clients.

## 4a. Local pricing tiers (per carrier) → feeds the DCE engine

Local price = **carrier base rate + Ezhalha markup**, markup defined in weight-banded
tiers per carrier. Crucially, the resolver output must be shaped as
`{ baseRate, marginAmount }` and passed to `calculateShipmentAccounting` with
`shipmentType="domestic"`, so DCE VAT (15% on subtotal, inclusive total) and every
downstream invoice/Zoho field come out identical to a domestic Express shipment.

```
local_carrier_pricing_tiers  (see §3)
```

| Carrier | Weight band | Markup |
|---|---|---|
| Naqel | 0–5 kg | +18% |
| Naqel | 5 kg+ | +12% (min SAR 8) |
| SMSA | 0–2 kg | +20% |
| SMSA | 2 kg+ | +15% |
| Zajil | any | flat +SAR 10 |

**Quote-time resolution** (new `resolveLocalRate(carrierCode, weightKg, profile)`):
1. carrier `getRates()` → base rate (or a stored rate card if the carrier has no live
   rate API).
2. find the tier whose band contains `weightKg` and matches `client_profile` (fall back
   to `null`-profile tier).
3. `marginAmount = markup_type==='percent' ? base*value/100 : value`; enforce
   `min_charge` on the resulting client price.
4. Hand `{ baseRate: base, marginAmount }` to `calculateShipmentAccounting`
   (`shipmentType:"domestic"`).

Admin manages tiers in the existing Pricing area with a new **"Local (by carrier)"** tab
beside Express/DDP.

## 5a. Platform credentials — what each needs

| Platform | Model | Ezhalha provides (once) | Client provides (per store) | Redirect / webhook URLs |
|---|---|---|---|---|
| **Salla** | Single platform OAuth app (Salla Partners) | Client ID, Client Secret, webhook secret | store connect via OAuth consent | `/api/oauth/salla/callback`, `/api/webhooks/sales-channel/salla` |
| **Shopify** | Single platform app (Partners); custom app skips review | API key, API secret, scopes `read_orders,write_fulfillments` | store connect via OAuth consent | `/api/oauth/shopify/callback`, `/api/webhooks/sales-channel/shopify` |
| **WooCommerce** | Per-store REST keys (no central app) | — | `consumer_key`, `consumer_secret`, store URL | `/api/webhooks/sales-channel/woocommerce` |

Salla/Shopify platform creds live in the admin **Platform app credentials** area
(encrypted, `INTEGRATION_CONFIG_SECRET`); WooCommerce keys are captured per channel in
the Connect-store wizard. All can be entered after scaffolding ships. Salla/Shopify
public apps require platform review — begin registration early.

**Client connection is fully self-serve for all three.** Two separate layers:
- *One-time app registration (Ezhalha, once ever):* create the Salla/Shopify developer
  app; supplies the shared `Client ID`/`Secret` that powers OAuth for **all** clients.
  Not per-client. The only non-self-serve step, and it's Ezhalha's, not the client's.
- *Per-client store connect (self-serve, in-app):* the client clicks
  "Connect Salla/Shopify" → redirected to the platform → clicks Approve → bounced back
  connected. Standard OAuth ("Sign in with Google" style) — no keys, no copy-paste, the
  client never sees a Client ID. WooCommerce is the one exception: the client pastes
  their own `consumer_key`/`secret` + store URL (still inside our wizard, still
  self-serve; Woo has no OAuth). So the shared app **enables** client self-serve, it
  doesn't block it.

## 5. Sales-channel sync

- **Platform adapters** (one per platform) handle auth + order mapping:
  WooCommerce (per-store REST key/secret + webhooks), Shopify (platform OAuth app +
  webhooks), Salla (platform OAuth app + webhooks).
- **Ingest:** platform webhook → `POST /api/webhooks/sales-channel/:platform` → verify
  signature (mirror `validateWebhookSignature`, `routes.ts:16167`; **fail-closed in
  prod**) → normalize → **upsert `orders`** (idempotent on
  `(sales_channel_id, external_order_id)`). Polling fallback for missed webhooks.
- **Address/phone normalization:** KSA city/region canonicalization + `+966` phone
  normalization so local carriers accept the destination. Shared normalizer used by both
  ingest and the LOCAL create form.
- **Status push-back:** on booked/shipped/delivered, update the order's fulfillment +
  tracking on the source platform (P3).

## 6. Order → Shipment flow (+ the wiring it touches)

1. **Order synced** → Orders inbox (`new`).
2. **Review / validate** (address, weight). No COD, no customs.
3. **Carrier assignment:**
   - *Auto:* rule engine evaluates `carrier_assignment_rules` → specific carrier, or
     cheapest/fastest (P3; see §10).
   - *Manual (default):* client/ops picks from a **rate-comparison panel** (live local
     rates across eligible carriers via `resolveLocalRate`).
4. **Payment:** Tap (Pay Now) or Credit / Pay Later — same checkout + credit path as
   Express. No COD.
5. **Create shipment** (book with local carrier → AWB + label).
6. **Fulfill** → push tracking/status back to the store.

**Code touch-points this flow requires (the round-1 plan omitted these):**

- `OperationShipmentKind` gets `LOCAL` (`schema.ts:16`).
- `getOperationShipmentKind` (`operations.ts:242`) — add, **as the first check**:
  `if (shipment.fulfillmentType === "local") return LOCAL;` (before the EXPRESS
  `carrierCode` fallback, which would otherwise swallow it).
- **LOCAL task template** in the template builder (`operations.ts:~638`), simpler than
  DDP (no customs): `received` → `pickup` → `in_transit` → `delivery`. Wire into
  `pickLeastLoadedOperationsUser(LOCAL)` (`:939`) and the ops hub kind switches
  (`:1273,:1479,:1699,:2146`).
- **LOCAL checkout branch:** `/api/client/shipments/checkout` (`routes.ts:14149`)
  currently rejects DDP and requires ≥1 item (14212). Add a `fulfillmentType==="local"`
  path that **skips item/customs validation**, uses `resolveLocalRate` for the price
  check, and sets `fulfillmentType:"local"` + `order_id`. Local rate quotes go through
  `/api/client/shipments/rates` (`:13897`) extended with a local branch, OR a dedicated
  `/api/client/local/rates` mirroring the DDP split (`:13692`).
- Ops RBAC: operations roles/permissions bootstrapped in `routes.ts` need a LOCAL queue
  permission scope (mirror the Express/DDP queue gating).

`carrier_mode` defaults **manual** per channel; per-order override allowed.

## 7. UI surfaces

**Client portal** (`client-layout.tsx:50` nav additions)
- **Sales Channels**: connected-store cards (status, last sync), "Connect store" wizard,
  per-channel settings (auto/manual, sync rules).
- **Orders**: inbox table (filters: channel, status, carrier — **no COD filter**),
  per-order detail with carrier assignment + rate compare, bulk fulfill.
- **Auto-assignment rules**: rule list + builder.
- **Local**: create flow with local-carrier picker + rates (folded into the existing
  Shipments create page with a "Local" type toggle that hides the customs/items steps).

**Operations portal**
- New **Local** queue in the hub (next to Door-to-Door / Express), driven by the LOCAL
  task template.
- Order-fulfillment workspace for ops-assisted bookings.

**Admin portal**
- **Carrier management**: enable/configure SMSA/Naqel/SPL/Zajil via integration
  accounts; capability matrix view.
- **Local pricing**: "Local (by carrier)" tab (§4a).
- **Platform app credentials**: per-platform OAuth app config.
- **New RBAC permissions**: `orders:read|update|fulfill`,
  `sales-channels:read|manage`, `carrier-rules:manage`, `local-pricing:manage`.
  Register in `ADMIN_ROUTE_PERMISSIONS` + `ADMIN_NAV_ITEMS`
  (`client/src/lib/admin-navigation.ts`) **and** mirror server-side.

## 8. Phasing

| Phase | Deliverable |
|---|---|
| **P1 — Local foundation** | `LOCAL` kind + `fulfillmentType="local"` discriminator; 2 local carriers (SMSA, Naqel); local pricing tiers → DCE engine; local rate + checkout branch (Tap/Credit); ops LOCAL queue + task template; RBAC. |
| **P2 — Channels** | Sales Channels model + **all three platforms** (Salla, WooCommerce, Shopify — start with whichever's app clears review first); order ingest (webhook + idempotency); Orders inbox; manual fulfill → LOCAL shipment (**client self-serve + ops-assisted**); store status push-back (basic). |
| **P3 — Automation** | `carrier_assignment_rules` engine + live rate comparison; auto vs manual per channel; richer status push-back. |
| **P4 — Scale** | More platforms (Zid, Magento); more carriers (SPL, Zajil); bulk ops; analytics. *(No COD reconciliation — removed.)* |

## 9. Risks & cross-cutting concerns

- **Kind mis-classification** (the top implementation risk): the LOCAL branch must
  precede the EXPRESS `carrierCode` fallback in `getOperationShipmentKind`, and
  `isOperationsEligibleShipment` (`operations.ts:254`) must accept LOCAL. Add a
  regression test asserting a `fulfillmentType="local"` shipment with a `carrierCode`
  resolves to LOCAL, not EXPRESS.
- **Tax parity:** LOCAL must go through `calculateShipmentAccounting` with
  `shipmentType="domestic"` so DCE VAT + Zoho stay correct. Do **not** hand-roll local
  totals. Test: a LOCAL invoice equals an equivalent domestic-Express invoice.
- **Credential security:** reuse AES-256-GCM + `INTEGRATION_CONFIG_SECRET`; never log
  secrets. Keep the secret stable across deploys.
- **Webhook security:** per-platform signature verification, fail-closed in prod.
- **Idempotency:** dedupe on `(sales_channel_id, external_order_id)`; safe re-sync.
- **Rate limits / retries:** backoff for platform + carrier APIs; queue heavy syncs.
- **Address/phone normalization:** critical for local-carrier acceptance.
- **Payment parity:** local uses the existing Tap + Credit path; **no new
  money-collection surface (no COD)**.
- **Schema migrations on prod:** additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
  and `CREATE TABLE IF NOT EXISTS` only — **never `db:push`** (it drops the runtime
  `session` table). See §11 DDL.
- **Backwards-compat:** Express/DDP flows and existing kind derivation must be untouched
  for non-local shipments (the LOCAL check is purely additive and gated on the new
  `fulfillmentType` value).

## 10. Decisions & remaining questions

**Resolved (round 1):** all platforms in scope · **no COD (Tap + Credit only)** ·
default carrier mode = manual (auto opt-in) · local flow = Express minus customs ·
local pricing = per-carrier weight tiers (§4a).

**Resolved (round 2):**
- **Platforms:** build all three — Salla, WooCommerce, Shopify (§5a). Salla + Shopify =
  single Ezhalha-owned OAuth apps; Woo = per-store keys. Keys added later via Apps tab.
- **Carriers:** SMSA + Naqel both in P1.
- **Fulfillment:** **both** — client self-serve *and* operations-assisted. UI must expose
  the fulfill action in both the client Orders inbox and the ops Local queue; guard each
  with its own permission (`orders:fulfill` client-side, ops queue permission ops-side).

**Still open:**
1. Do any local carriers (SMSA/Naqel) lack a live rate API? If so, P1 needs a **stored
   rate-card** fallback for `resolveLocalRate` (§4a step 1). *(Determined during adapter
   build; not a blocker — resolver already abstracts base-rate source.)*

### Auto-assignment "cheapest / fastest" (P3)

Start **manual-only** (client just picks — no rate math needed). When auto is added:
**Option B (cached rate cards)** for instant selection + an **Option-A live re-quote at
booking** to confirm the charged price. Most "specific carrier" rules need no rates.

## 11. Implementation sequencing & idempotent migration (no-oversight checklist)

**Order of work (P1):**
1. Schema (DDL below) — add `LOCAL`, `fulfillmentType="local"` support, new tables.
2. `getOperationShipmentKind` LOCAL branch (first) + `isOperationsEligibleShipment` +
   LOCAL task template + assignment. **Add regression test before wiring UI.**
3. Carrier adapters (SMSA/Naqel) + capability profile + capability matrix.
4. `local_carrier_pricing_tiers` + `resolveLocalRate` → `calculateShipmentAccounting`.
5. Local rate + checkout branch (skip items/customs). Verify Tap + Credit end-to-end.
6. Ops LOCAL queue UI + client Shipments "Local" toggle + admin Local pricing tab + RBAC.
7. Then P2 (channels/orders), P3 (rules/rate compare), P4 (scale).

**Idempotent DDL (run on prod manually; never `db:push`):**
```sql
-- shipments discriminator + order link
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS order_id varchar;
-- (fulfillment_type already exists; "local" is just a new value)

CREATE TABLE IF NOT EXISTS sales_channels (...);
CREATE TABLE IF NOT EXISTS orders (...);
CREATE UNIQUE INDEX IF NOT EXISTS orders_channel_external_unique
  ON orders (sales_channel_id, external_order_id);
CREATE TABLE IF NOT EXISTS carrier_assignment_rules (...);
CREATE TABLE IF NOT EXISTS local_carrier_pricing_tiers (...);
```
(Full column lists per §3; all `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT
EXISTS`, no drops.)

**Verification (run the app, drive it) — per surface:**
- LOCAL kind: create a `fulfillmentType="local"` shipment with a `carrierCode` → assert
  ops hub shows it in the **Local** queue (not Express).
- Tax: a LOCAL checkout's invoice total + VAT == an equivalent domestic-Express invoice;
  confirm the Zoho DCE invoice is correct.
- Payment: pay a LOCAL shipment via Tap **and** via Credit/Pay Later → both settle,
  credit ledger debits correctly.
- Ingest: post a signed order webhook twice → exactly one `orders` row (idempotency).
- Security: post an order webhook with a bad signature in prod mode → rejected (401).

## Critical files (touch-points)

- `shared/schema.ts` — `OperationShipmentKind += LOCAL`; new tables; `shipments.order_id`.
- `server/services/operations.ts` — `getOperationShipmentKind` LOCAL branch (first);
  LOCAL task template; assignment; hub kind switches.
- `server/integrations/carriers.ts` + new `smsa.ts`/`naqel.ts` — register adapters.
- `server/integrations/fedex.ts` (interface) — optional `capabilities` profile.
- `server/services/shipment-accounting.ts` — reused as-is (LOCAL = domestic/DCE).
- `server/routes.ts` — local rate + checkout branch; sales-channel webhook + ingest;
  orders CRUD/fulfill; carrier-rule + local-pricing admin routes; RBAC.
- `client/src/components/client-layout.tsx` — nav (Sales Channels, Orders).
- `client/src/lib/admin-navigation.ts` — admin nav + route permissions.
- `client/src/pages/client/*`, `client/src/pages/operations/hub.tsx` — Local queue + UI.

## 12. Not finished yet (rev 3 audit)

Ordered by how much it blocks a real go-live.

**Blocks real fulfillment (P1 close-out):**
1. ~~**Live carrier APIs**~~ — **DONE.** SMSA + Naqel adapters
   (`server/integrations/local-carriers.ts`) now make real REST calls for rates / booking
   (AWB) / label / tracking / cancel, gated on `isConfigured()`. Added to the Apps tab
   (`smsa` / `naqel` app definitions + host allowlist). On payment confirm, a configured
   carrier auto-books (AWB + label, `carrierStatus="created"`); unconfigured falls back to
   manual ops booking; a live booking failure is non-fatal (recorded on the shipment).
   Live rates feed `resolveLocalRate` when available, else the rate card.
   Tests: [`tests/local-carriers.test.ts`](../tests/local-carriers.test.ts).
   *Remaining:* enter real SMSA/Naqel credentials in the Apps tab, and confirm each
   carrier's exact endpoint paths/field names against your contract (centralized in the
   `*_ENDPOINTS` constants + map/parse helpers) — the base URL is Apps-tab overridable.

**P2 gaps (channels):**
2. **Salla + Shopify** — no adapters, no OAuth callback routes, no admin app-credential
   store. Needs Ezhalha to register the developer apps first. Wizard shows them "Coming soon".
3. **Ops-assisted fulfill** — plan §10 locked *both* client and ops fulfillment. Only the
   client Orders inbox can fulfill. The ops hub has no Orders workspace / no ops action to
   turn an order into a shipment.
4. **Sync-settings enforcement** — `importPaidOnly` / `onNewOrder` (auto-create) are captured
   in the wizard + settings but the ingest webhook ignores them (imports every order to inbox).
5. **Polling fallback** — no scheduler to backfill orders missed by webhooks.
6. **Status push-back** — nothing pushes booked/shipped/delivered + tracking back to the store.
7. **Bulk fulfill** — prototype has it; not built.
8. **Zid / Magento / Custom-API** platforms — not built (P4).

**P3 (automation) — nothing built:**
9. **Assignment-rule engine** — rules are stored + editable + shown, but **never evaluated**.
   Ingest/fulfill never auto-picks a carrier. `carrier_mode="auto"` and the Orders "Auto"
   badge are cosmetic. No rule-driven cheapest/fastest live re-quote.

**Admin surfaces (prototype):**
10. **Carriers capability-matrix page** — not built (carriers still enabled via the existing
    Apps page).
11. **Channel-Apps OAuth-credentials page** — not built (moot until Salla/Shopify).
12. **Dedicated RBAC** — plan §7 wanted `orders:*`, `sales-channels:manage`,
    `carrier-rules:manage`, `local-pricing:manage`. Current code reuses client
    `create_shipments` and admin `pricing-rules`; no admin-side order visibility.

**Verification debt:**
13. **Prod migration** — confirm `local_shipments_p1.sql` was applied to prod.
14. **Ops LOCAL queue permission** — reuses existing ops gating; no distinct LOCAL scope.
