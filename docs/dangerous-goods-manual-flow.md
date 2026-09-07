# Dangerous Goods — manual, ops-quoted flow

## Context

The dangerous goods feature currently built treats DG as an ordinary express shipment: the
carrier rates it, the client pays at checkout, and operations merely *holds* it before
tendering. That does not match how these shipments actually move. DG is arranged with the
carrier **by email, outside the system**, and no price exists until that conversation is
finished.

So the flow inverts. The client submits a complete declaration with **no rates and no
payment**. Operations reviews it, completes anything missing, agrees carriage with the carrier
externally, and comes back with a **carrier cost**. The system prices it and asks the client to
pay. Only then does an operator go back to the carrier, confirm the booking, and record the
**air waybill** — after which the shipment behaves like any other, with tracking synced from
the carrier, invoices, the lot.

**Booking follows payment, never precedes it** (revised 2026-09-07). The first cut recorded the
waybill at quotation time, which meant every quotation Ezhalha sent was a live carrier booking
it owned and had not been paid for; a client who declined, or simply went quiet until the quote
lapsed, left an operator to cancel a real consignment by email. Splitting the quote from the
booking makes an unpaid quote cost nothing.

### Decisions taken

| | |
|---|---|
| Quotation | Ops enters the **carrier cost**; the system applies the client's profile margin and VAT. Ops may override the final total. |
| Booking | Ops records the **air waybill after the client pays**, never at quotation time. Nothing is committed with the carrier until the money is in. |
| AWB account | Ezhalha's own DHL/FedEx accounts, so existing tracking polling works. |
| Non-payment | The quotation carries a validity date; on expiry the shipment is flagged so ops can re-confirm the price. Nothing is booked, so nothing needs unwinding, and nothing auto-cancels. |
| Client choice | Sees the quote with a breakdown, then **pays or declines**. |
| Pickup | Booked **through the carrier API at the booking step**, for the collection date the carrier gave — after payment, because every pickup endpoint wants a waybill. |
| Existing carrier DG payload code | **Kept, dormant and tested** — ready if the accounts are ever DG-approved. |
| Client access | Unchanged: per-client approval with training certificate and safety data sheets. |

---

## A bug to fix on the way

**The `dangerous_goods` ops view I previously shipped renders an empty panel.**
`view === "dangerous_goods"` matches none of the four `.dp-body` branches
(`hub.tsx:1713`, `1747`, `1780`, `1810`), and `getShipmentView` (`hub.tsx:797`) never returns
it, so deep links route to `attention` — where `DangerousGoodsReview` is also not mounted. In
practice the review panel is only reachable via the Express or Special tabs. This rewrite
replaces it with a real detail panel.

---

## Four constraints found in the code that shape the design

1. **A shipment cannot be stored unpriced.** `baseRate`, `margin` and `finalPrice` are
   `notNull` (`shared/schema.ts:398-401`). An unpriced DG shipment stores `0.00` and relies on
   status to mean "not yet quoted" — never on a null price.
2. **`paymentStatus: "pending"` is invisible to operations.**
   `OPERATION_ACTIVE_PAYMENT_STATUSES = {paid, unpaid}` (`operations.ts:74`) filters the
   queues. A submitted DG shipment must be created **`unpaid`**, or ops will never see it.
   This is the single easiest way to build the whole feature and have it appear to do nothing.
3. **Adding a 4th shipment kind silently kills tracking.** `shouldRefreshShipment`
   (`express-tracking-refresh.ts:189`) refreshes only `EXPRESS`. A `DANGEROUS_GOODS` kind must
   be added to that gate explicitly, or tracking stops the moment the shipment goes live.
4. **Nobody can currently edit a paid shipment's addresses, weights or items.** Ops has no
   such endpoint at all, and the admin one (`routes.ts:17900`) is gated by `isShipmentEditable`
   — `payment_pending && !paid && !carrierTrackingNumber`. Ops filling in missing data is a
   new capability that must be built.

---

## The flow

```
CLIENT                    OPERATIONS                 CLIENT              OPERATIONS
submit, unpriced  ──▶  review · complete   ──▶  pay or decline  ──▶  book · record AWB  ──▶ live
                       agree a price by email
```

| Shipment state | `status` | `paymentStatus` | Who acts |
|---|---|---|---|
| Submitted | `dg_review` | `unpaid` | ops |
| With the carrier | `dg_awaiting_carrier` | `unpaid` | ops |
| Quoted | `payment_pending` | `unpaid` | client |
| Declined / expired | `cancelled` | `unpaid` | nothing to unwind |
| Paid, not yet booked | `dg_booking` | `paid` | ops |
| Booked | `created` → normal | `paid` | system books pickup, tracking syncs |

`payment_pending` is deliberately reused: `canPayShipment`
(`client/src/pages/client/shipments.tsx:69`) and `POST /api/client/shipments/pay`
(`routes.ts:19551`) already accept it, so the client payment path needs no new code.

---

## The prototype

[`dangerous-goods-ops-prototype.html`](./dangerous-goods-ops-prototype.html) — standalone,
matching the `sales-channels-prototype.html` conventions (brand `#fe5200`, the ops hub's own
CSS tokens). The full Dangerous Goods ops page, clickable, with live quotation arithmetic.

The shipped panel carries **six** stages; the prototype predates the quote/booking split and
still shows five, with the waybill collected at stage 3:

   | Stage | Shows |
   |---|---|
   | 1 · Review & complete | every submitted field, with missing ones called out and editable |
   | 2 · Carrier handover | one copyable block with everything needed to email the carrier — declaration, commodities, packages, addresses, documents |
   | 3 · Enter the quotation | carrier cost in, resolved margin and VAT, final total, validity date, carrier |
   | 4 · Awaiting payment | what the client sees, and the expiry countdown |
   | 5 · Book & record the AWB | carrier, air waybill, collection date — enabled only once paid |
   | 6 · Live | normal shipment, tracking syncing |

Signed off before implementation began.

---

## Phase 1 — Client wizard: submit without pricing

`client/src/pages/client/create-shipment.tsx`

- **SDS step auto-advances.** On successful upload, go straight to the declaration review; the
  extraction summary card is removed. Extraction still runs and still pre-fills — the client
  simply never sees an interstitial. Keep the failure path visible: if extraction fails they
  must know to type it in.
- **Remove the rate step and the payment step for DG.** The DG branch ends at a submit step.
  Step numbering is already computed (`dangerousGoodsContentStep` etc.) — extend that block.
- Keep sender, recipient, packages, customs details and preferred pickup date.
- New submit endpoint replaces the rates→checkout pair.

## Phase 2 — Submission endpoint and schema

`POST /api/client/shipments/dangerous-goods` — validates with the existing
`dangerousGoodsDeclarationSchema`, re-checks `dangerousGoodsEnabled`, creates the shipment
with zeroed prices, `status: "dg_review"`, **`paymentStatus: "unpaid"`**, and
`fulfillmentType: "dg_manual"`.

Migration `migrations/2026-09-04-dangerous-goods-manual.sql`, additive only:
`dg_carrier_cost_sar`, `dg_quoted_at`, `dg_quote_expires_at`, `dg_quote_note`,
`dg_declined_at`, `dg_decline_reason`, `dg_handover_at`. Reuse the existing
`dangerous_goods_*` columns for the declaration itself.

## Phase 3 — A real Dangerous Goods kind in operations

- `OperationShipmentKind.DANGEROUS_GOODS` in `shared/domain.ts:25`, derived in
  `getOperationShipmentKind` (`operations.ts:303`) from `hasDangerousGoods` — **placed before
  the EXPRESS fallback**.
- Add it to `shouldRefreshShipment` (`express-tracking-refresh.ts:189`) so tracking still runs.
- New SQL condition beside `getDdpShipmentSqlCondition` (`operations.ts:1745`) and a `queue`
  branch; counters in `getOperationSummary`.
- Task template in `getDefaultTasksForShipment` (`operations.ts:699`) with stages
  `review → handover → quotation → payment → shipping`, mirroring the DDP pattern.
- Client mirrors: `OperationShipmentSummary.shipmentKind` union (`hub.tsx:141`),
  `OperationSummary` counts, `OperationsNavSummary` (`operations-layout.tsx:52`).
  **`buildShipmentSummary` and `buildShipmentListSummaries` both map fields — change both.**

## Phase 4 — The ops page

`client/src/pages/operations/hub.tsx` — a new `DangerousGoodsDetail` panel wired into the
`.dp-body` branch chain (fixing the empty-panel bug), plus `getShipmentView` returning
`dangerous_goods`, a `ListHeader` title case, and a list badge.

Built on the **D2D stage-accordion pattern** (`D2DDetail` `hub.tsx:2421`,
`D2DStageContent` `2509`, `D2DWarehouseStage` `2647`): `.checkpoint-card` elements with
`done`/`locked` states, a `canComplete` boolean per stage, locked hints, and a summary line
after completion.

**Missing-data guidance** reuses the `missingFields` pattern already in the client DG form
(amber field borders, cleared as you type — `create-shipment.tsx:3663`): the server returns a
`missingFields` list, the panel renders a "still needed" checklist at the top of stage 1, and
the stage cannot be completed until it is empty. This also fixes the inverse problem that
`ShipmentDetailsPanel` (`hub.tsx:2148`) *omits* null rows, so an operator today cannot tell
"not set" from "not shown".

## Phase 5 — Ops editing and the quotation

New, all `requireOperationsPermission("operations", "update")`:

- `PATCH /api/operations/shipments/:id/dangerous-goods` — fill in missing shipment data
  (addresses, weights, packages, items, declaration fields). **This is genuinely new
  capability** — no ops endpoint can write these today. Restricted to DG shipments in
  `dg_review`, fully audit-logged, since it edits data the client declared.
- `POST /api/operations/shipments/:id/dangerous-goods/handover` — marks it sent to the carrier.
- `POST /api/operations/shipments/:id/dangerous-goods/quote` — body `{ carrierCode,
  carrierCostSar, validUntil, collectionDate?, note?, finalTotalOverrideSar? }`. **No waybill.**
  Prices through the **existing** `computeQuotationPricing` / `calculateShipmentAccounting`
  (`server/services/admin-quotations.ts:87`, `shipment-accounting.ts:71`) so margin, VAT
  scenario and Zoho stay consistent; sets `isQuote: true`, `status: "payment_pending"`; then
  notifies exactly as `POST /api/admin/quotations` already does (`routes.ts:13343`) —
  `type: "quotation_created"`, *"New quotation ready to pay"*, `sendEmail: true`,
  `actionUrl: /client/quotations/:id`.
- `POST /api/operations/shipments/:id/dangerous-goods/booking` — body `{ carrierTrackingNumber,
  carrierCode?, collectionDate?, note? }`. Refuses unless `paymentStatus === "paid"`. Records
  the waybill, moves `dg_booking → created`, books the courier pickup, clears the
  `dangerous_goods_awaiting_booking` flag, and emails the client the waybill.

## Phase 6 — Client accept / decline, expiry, and going live

- Reuse `client/src/pages/client/quotation-detail.tsx` — it already has the consent block and
  Pay button. Add a **Decline** action (`POST /api/client/quotations/:id/decline`) and show the
  DG declaration and quote breakdown.
- Reuse the DDP consent pattern (`requiresConsent` / `consentAccepted`,
  `routes.ts:17707`) so the client re-confirms the declaration before paying.
- On payment, `finalizePaidShipmentAfterPayment` gains a `dg_manual` branch **before** the
  existing DG hold: it books nothing, sets `status: "dg_booking"` / `paymentStatus: "paid"`,
  and raises a `dangerous_goods_awaiting_booking` attention flag so the paid shipment is not
  left sitting in a queue. `POST /api/client/shipments/confirm` short-circuits for an already
  settled DG shipment rather than re-running finalization.
- `POST /api/client/shipments/:id/pay-later` needs **its own** `dg_manual` branch: credit
  books carriers on a separate path, and without one it fell through to the express booking
  call and tried to create a real DHL shipment.
- Expiry: extend the existing hourly scheduler pattern (`credit-reminder.ts:134`) to flag
  shipments past `dg_quote_expires_at` with an attention flag. **Never auto-cancel.** Nothing
  is booked at that point, so the flag is a prompt to re-confirm the price, not to unwind.

---

## Critical files

| File | Change |
|---|---|
| `client/src/pages/client/create-shipment.tsx` | auto-advance SDS, drop rate/payment steps |
| `server/routes.ts` | submit, ops edit, handover, quote, decline endpoints; `finalizePaidShipmentAfterPayment` branch |
| `server/services/operations.ts` | new kind, queue, tasks, counters, both summary builders |
| `client/src/pages/operations/hub.tsx` | `DangerousGoodsDetail` panel + view wiring |
| `client/src/pages/client/quotation-detail.tsx` | decline + DG breakdown |
| `shared/domain.ts` | `OperationShipmentKind.DANGEROUS_GOODS` |
| `server/services/express-tracking-refresh.ts` | include DG in the refresh gate |
| `migrations/2026-09-04-dangerous-goods-manual.sql` | additive columns |

## Verification

1. `npx vitest run` — extend `tests/dangerous-goods-flow.test.ts`; new tests for the unpriced
   submission, the ops quote pricing, decline, expiry, and **that a submitted DG shipment
   actually appears in the ops queue** (the `paymentStatus` trap).
2. `npm run check` (excludes `*.test.ts` — run vitest too) and `npm run build`.
3. Locally on `npm run dev`: submit a DG shipment as `client` with a sample SDS from
   `tests/fixtures` / `tmp/sds-samples`, confirm no rates and no payment; find it in the ops
   hub Dangerous Goods queue; complete the checklist; enter a quote; confirm the client is
   notified, sees the breakdown, and can pay or decline; confirm tracking syncs after payment.
4. Confirm the previously-broken `dangerous_goods` view now renders a real panel.
5. Migration applied and re-applied on local, verified behaviour-neutral for existing rows.
6. Staging, then a tagged production release per `docs/branching-and-deployment.md`.

---

## Built — 6 September 2026

All six phases are implemented, typechecked, built and covered by
`tests/dangerous-goods-manual-flow.test.ts` (26 tests). What shipped, and where it differs
from the plan above:

| Plan said | What was built | Why |
|---|---|---|
| Migration `2026-09-04-dangerous-goods-manual.sql` | `migrations/2026-09-06-dangerous-goods-manual.sql` | Dated to the day it was written. |
| Seven new columns | Nine: added `dg_client_confirmed_at` and `dg_quote_expiry_flagged_at` | The client re-confirms a declaration operations may have edited, and the expiry sweep must flag once rather than once an hour forever. |
| Queue = `dg_manual` shipments | Also the older carrier-quoted holds (`PENDING_REVIEW`) | Those are Express shipments by kind. Dropping them from this queue would have removed the only place a paid, untendered declaration is visible. They keep their Express panel. |
| Ops edit covers items | Addresses, packages, declaration, pickup date — **not** customs line items | The panel surfaces "customs items missing" as guidance pointing at the client or the admin editor. Building a third line-item editor was not worth it for a case that only arises on an international shipment the wizard already refuses to submit without items. |
| — | Client may withdraw at `dg_review` | Added `dg_review` to `CANCELLABLE_SHIPMENT_STATUSES`. Nothing is arranged or charged at that point, and without it a client is stuck with a submission they cannot take back. `dg_awaiting_carrier` is deliberately excluded: by then an operator has emailed a carrier. |
| — | Client PATCH of a DG quotation is refused | The price came out of an email thread against an existing air waybill. A rate-card re-price would replace it with a figure no carrier ever offered. |
| — | Payment refused on an expired quote | The carrier held that price for a period and the period is over. |

### Where the pieces live

| File | What it holds |
|---|---|
| `shared/dangerous-goods.ts` | `DG_MANUAL_FULFILLMENT_TYPE`, `DangerousGoodsShipmentStatus`, quote validity default |
| `server/services/dangerous-goods-manual.ts` | `dangerousGoodsMissingFields`, `buildCarrierHandoverText`, quote expiry default |
| `server/services/dangerous-goods-quote-expiry.ts` | hourly sweep — flags, never cancels |
| `server/routes.ts` | client submit / confirm / decline; ops patch / handover / quote; the `dg_manual` payment branch |
| `server/services/operations.ts` | kind, queue condition, task template, counters, the `dangerousGoods` detail block |
| `client/src/pages/operations/hub.tsx` | `DangerousGoodsDetail` — the five-stage panel |
| `client/src/pages/client/create-shipment.tsx` | DG wizard: no rate step, no payment step, SDS auto-advance |
| `client/src/pages/client/quotation-detail.tsx` | DG breakdown, declaration re-confirmation, decline |

### Verified in the browser, 6 September 2026

Walked the whole flow on `npm run dev` against the local database. Three defects only a
running page could have shown, all fixed:

1. **The client wizard rendered a blank page.** The dangerous goods submit hooks sat *below*
   `if (permsLoading) return <LoadingScreen/>`, so React counted a different number of hooks
   on the loading render and the loaded one — "Rendered more hooks than during the previous
   render". A second hook (the `?dg=1` access-redirect effect, added in the earlier DG work)
   had the same problem. Both moved above every early return.
2. **The ops list header read "Delivered Shipments"** on the Dangerous Goods queue — the
   `ListHeader` title chain had no `dangerous_goods` case and fell through to the default.
3. **The wizard banner still promised a carrier quote** ("before we quote, because the carrier
   prices them differently") — copy from the design this replaced.

Confirmed working end to end: submit → ops queue → review with the outstanding-items checklist
→ handover block copied for the carrier email → quotation (SAR 1,200 carrier cost → SAR 1,440
client total) → client sees the declaration, confirms it, and the Pay button unlocks.

### Revision, 6 September 2026 — the client stops filling in the declaration

The declaration review step (step 7) is **removed from the client flow**. A client now supplies
two things: the content kind, and a safety data sheet. Everything else on the Shipper's
Declaration — accessibility, offeror, 24-hour emergency contact, signatory, UN number, hazard
class, packing group and net quantity — is entered and checked by operations.

The reason is that most of it was never answerable by a shipper. A safety data sheet describes a
substance, not a shipment, so it never states the net quantity per package; the emergency
contact and the signatory are properties of the offeror of record; and a classification the
client rubber-stamps without being able to verify is worse than one they never saw — it reads as
authoritative right up until the carrier refuses the consignment at acceptance.

**Validation was moved, not dropped.** A new `dangerousGoodsDraftDeclarationSchema` accepts an
incomplete declaration on submission, `dangerousGoodsMissingFields` names every gap (it gained
checks for accessibility, UN number, hazard class and packing group, which the client used to
supply), and the carrier handover stays blocked until the list is empty. Where a value *is*
present it is validated exactly as strictly as before.

Two parsers now exist, deliberately:

| | |
|---|---|
| `parseDangerousGoodsDeclaration` | lenient — what the ops hub reads and edits |
| `parseCompleteDangerousGoodsDeclaration` | strict — the only thing `shipmentDangerousGoods` will put on a carrier request |

A draft therefore cannot reach an airline: the carrier payload builder simply gets nothing.

One client-facing signal was kept rather than deleted with the step. When the safety data sheet
says the product is **not regulated**, the wizard stops on the upload step and offers to switch
to an express shipment — that is the client's decision to make, and express is quoted instantly
and costs less.

The client's IATA confirmation checkbox moved to the quotation page, where it already existed as
`dgClientConfirmedAt`. That is a better place for it: they now confirm a declaration that is
actually complete, rather than one they were asked to author.

### Still to do

- Apply `migrations/2026-09-06-dangerous-goods-manual.sql` on staging and production **before**
  the build, per `docs/branching-and-deployment.md`. It is additive and idempotent.
- Manual pass on staging with a real safety data sheet from `tmp/sds-samples`.
