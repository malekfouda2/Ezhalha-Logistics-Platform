# Simplify Admin Pricing

> Prototype for this plan: [`docs/pricing-prototype.html`](./pricing-prototype.html) (open in a browser).
> Full pricing reference: [`docs/pricing.md`](./pricing.md).

## Context

Admin pricing is spread across **three separate pages** buried as siblings under the
"Financial Management" nav group, with no unifying model, no explainer, and no way to
see a final price. To fully reason about what a client pays, an admin currently has to
mentally stitch together settings that live on different screens:

- `/admin/pricing` (`client/src/pages/admin/pricing.tsx`, ~1540 lines) — **client markup profiles**: per-profile default markup %, value-based markup tiers, *plus* the DDP margin % and DDP KG/CBM markup tiers, plus badge styling.
- `/admin/ddp-pricing` (`client/src/pages/admin/ddp-pricing.tsx`) — **DDP lanes**: air base rate/kg, sea base rate/cbm, billable minimums, rounding, transit days.
- `/admin/local-pricing` (`client/src/pages/admin/local-pricing.tsx`) — **local KSA carrier tiers**: base rate (fallback), markup (percent/flat), weight bands, per-profile scoping, min charge.

Why it's confusing:
1. **Base rate vs markup are on different pages for the same flow.** DDP base rates live on the DDP page but the DDP markup % lives on the Profiles page. Admin must cross two screens to reason about one DDP price.
2. **"Tier" means three unrelated things** — value-band margin tiers (`pricing_tiers`, by SAR), DDP markup tiers (`ddp_pricing_tiers`, by KG/CBM), local weight-band tiers (`local_carrier_pricing_tiers`, by kg). Same word, three models, three UIs re-implemented independently (no shared component).
3. **No end-to-end view or preview.** Nothing shows how base rate → markup → min-charge floor → 15% VAT combine into the client price. VAT (`VAT_RATE=0.15` in `server/services/shipment-accounting.ts`) is invisible in the config UI.
4. **Three nav items** for one concept, alongside 5 other financial items.

Intended outcome: one coherent "Pricing" destination with clear sections, inline
explanation of the price formula, and a live price preview — **without changing any
pricing math, existing endpoints, or database schema**. All three underlying rate
paths (int'l carrier-margin, local carrier-markup, DDP lane) and their write endpoints
stay exactly as they are; this is a presentation + documentation change plus two
read-only additive helpers.

## Scope decisions (defaults; user was away for confirmation)

- **Scope:** UI consolidation + additive read-only helpers. No change to pricing logic, existing write endpoints, or schema/migrations.
- **Layout:** one tabbed `/admin/pricing` page; the two old routes redirect into tabs.
- **Docs:** both in-app help panels **and** a repo reference `docs/pricing.md`.

## Approach

### 1. One tabbed "Pricing" page (frontend consolidation)

Turn `/admin/pricing` into a single hub with tabs (shadcn `Tabs`, already used elsewhere).
Do **not** rewrite the working forms — move each existing page's body into a tab so the
proven mutations/queries are preserved verbatim.

Tabs:
- **Client Markup** — existing `pricing.tsx` profiles UI (default markup %, value tiers, DDP margin %, DDP tiers, badge). Unchanged internally.
- **Local Carriers** — the body of `local-pricing.tsx`.
- **DDP Lanes** — the body of `ddp-pricing.tsx`.
- **Preview** — new price simulator (see §3).

Mechanics:
- Extract each current page component's inner JSX into a child component (e.g. `ClientMarkupTab`, `LocalCarriersTab`, `DdpLanesTab`) that renders **without** its own `<AdminLayout>` wrapper. The parent page renders one `AdminLayout` + `Tabs`.
- Keep tab state in the URL (`?tab=local`) via Wouter's search params so links/bookmarks/redirects land on the right tab.
- `client/src/App.tsx`: keep `/admin/pricing`; change `/admin/ddp-pricing` and `/admin/local-pricing` to redirect to `/admin/pricing?tab=ddp` / `?tab=local` (preserve deep links, no dead URLs). Permission gate stays `pricing-rules:read`.
- `client/src/lib/admin-navigation.ts`: collapse the three `ADMIN_NAV_ITEMS` entries (lines ~112–114) into a single `{ href: "/admin/pricing", label: "Pricing" }`. Leave `ADMIN_ROUTE_PERMISSIONS.pricing` as-is.

Files: `client/src/pages/admin/pricing.tsx` (becomes the tab host), `.../ddp-pricing.tsx`, `.../local-pricing.tsx` (exported as tab bodies), `client/src/App.tsx`, `client/src/lib/admin-navigation.ts`.

### 2. In-app "How pricing works" explainer

A persistent, collapsible help card at the top of the Pricing page (and a short note per
tab) stating the actual formula from the code, so the model is explicit:

- Local: `client price = carrier base rate (live API, else rate-card base) + markup(percent|flat), floored at min charge, then +15% VAT` (`server/services/local-pricing.ts:resolveLocalRate`).
- Int'l/express: `live carrier rate + profile markup% (value-tier aware) → final price` (`pricing_rules` + `pricing_tiers`), VAT per tax scenario.
- DDP: `billable qty (chargeable kg air / cbm sea, min + rounding) × lane rate, floored at min shipment charge = base; + profile DDP markup% ` (`server/services/ddp-pricing.ts:calculateDdpPrice`), VAT margin-only.

Reuse the existing `Info`-card pattern already in `pricing.tsx:871`. No new component library.

### 3. Live price Preview tab (additive, read-only)

A small form (carrier/lane + weight/dimensions + client profile) that calls the
**existing** rate endpoints and renders the returned breakdown — so admins verify config
without creating a shipment. No new pricing math; strictly reuses:
- Local: `POST /api/client/local/rates` — or add a thin read-only admin alias `POST /api/admin/pricing/preview/local` that internally calls `resolveLocalRate` + `calculateShipmentAccounting` (no writes).
- DDP: `POST /api/client/ddp/rates` (returns full `DdpPriceQuote` breakdown already).
- Int'l: `POST /api/admin/shipping/rates` (already admin, `shipments:read`).

Recommended: add one **read-only** admin preview endpoint `POST /api/admin/pricing/preview`
in `server/routes.ts` gated by `requireAdminPermission("pricing-rules","read")` that
dispatches to the existing service functions and returns `{ baseRate, markup, minChargeApplied, vat, clientTotal }`. It performs **no DB writes** and reuses `resolveLocalRate`, `calculateDdpPrice`, and `calculateShipmentAccounting` — no duplicated logic.

### 4. Documentation

- **`docs/pricing.md`** (new): the single source of truth for admins/devs. Sections:
  - The three pricing types and when each applies (domestic KSA / international express / DDP door-to-door).
  - Exact price formula per type (base → markup/tier → min-charge → VAT), citing the service files.
  - What each config field means, mapped to its table (`pricing_rules`, `pricing_tiers`, `ddp_pricing_lanes`, `ddp_pricing_tiers`, `local_carrier_pricing_tiers`).
  - Endpoint reference table (method, path, permission, purpose) for all pricing routes.
  - Worked examples (one per type) end-to-end incl. 15% VAT.
- Link it from the in-app explainer ("Full reference →").

## What is explicitly NOT changed

- No schema/table changes, no migrations, no `db:push`.
- No change to `resolveLocalRate`, `calculateDdpPrice`, `calculateShipmentAccounting`, or any existing write/rate endpoint.
- Profile/tier/lane data and their CRUD behavior are byte-for-byte the same; only their container/nav/labels change.
- `VAT_RATE`, currencies, carrier adapters untouched.

## Critical files

- `client/src/pages/admin/pricing.tsx` — becomes tab host; existing profiles UI → `ClientMarkupTab`.
- `client/src/pages/admin/local-pricing.tsx` — body exported as `LocalCarriersTab` (drop inner `AdminLayout`).
- `client/src/pages/admin/ddp-pricing.tsx` — body exported as `DdpLanesTab` (drop inner `AdminLayout`).
- `client/src/App.tsx` — redirect old routes into tabs.
- `client/src/lib/admin-navigation.ts` — collapse 3 nav items → 1 (lines ~112–114).
- `server/routes.ts` — (optional, recommended) additive read-only `POST /api/admin/pricing/preview`.
- `docs/pricing.md` — new reference doc.
- Reuse: `server/services/local-pricing.ts`, `server/services/ddp-pricing.ts`, `server/services/shipment-accounting.ts`, `client/src/components/ui/tabs`, `client/src/components/sar-symbol.tsx`.

## Verification

- `npm run check` — clean typecheck.
- `npx vitest run` — existing suite green (no pricing-logic change expected; sourcing env per memory note, tolerate the 4 known pre-existing failures).
- Manual (run app `npm run dev`):
  - Nav shows a single "Pricing" item; it opens the tabbed page.
  - Each tab's CRUD (add/edit/delete profile, local tier, DDP lane) still works and hits the same endpoints (verify in network tab).
  - `/admin/ddp-pricing` and `/admin/local-pricing` redirect to the correct tab.
  - Preview tab returns a breakdown for a sample local + DDP + int'l input and the numbers match a hand calc incl. 15% VAT.
  - Permissions: an admin with only `pricing-rules:read` sees the page read-only (no create/edit buttons), matching current `canCreatePricing/canUpdatePricing` gating.
