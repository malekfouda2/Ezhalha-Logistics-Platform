# Dangerous goods

How regulated goods are declared, quoted, reviewed and booked.

## The one thing to understand first

Ezhalha books on **its own** carrier accounts. On a dangerous goods shipment that makes
Ezhalha the **shipper of record** and the signatory on the Shipper's Declaration for
Dangerous Goods, liable under the IATA Dangerous Goods Regulations and GACA rules.

Everything below follows from that. It is why every dangerous goods shipment is held for a
human before the carrier is called, why the client has to be approved before they can even
see the option, and why every code path fails toward "refuse to book" rather than "book it
anyway".

---

## The flow

```
client approved for DG (admin)
        │
        ▼
  declare on the wizard ──▶ rate ──▶ pay ──▶ HELD, not booked
   (before rates, so the                          │
    surcharge is priced)                          ▼
                                          operations reviews
                                          ┌───────┴────────┐
                                     approve            reject
                                          │                │
                                    book carrier      cancel + refund
```

### 1. Client enablement

`client_accounts.dangerous_goods_enabled`, off by default. An admin turns it on directly
(`PATCH /api/admin/clients/:id/dangerous-goods`) or by approving a request the client raised
(`POST /api/client/dangerous-goods/request` → `dangerous_goods_access_requests`). Approve
only against the evidence attached to the request: current DG training certificate and the
safety data sheets for the substances involved.

The wizard's dangerous goods toggle does not render at all for a client without the flag.

### 2. Declaration, before rates

The declaration step sits between **Package Details** and **Select Rate**, not later. That
ordering is load-bearing: the carrier only includes its dangerous goods surcharge in a quote
that declares the goods, and we charge the client the carrier-quoted price. Declaring after
the quote would undercharge every DG shipment.

Step numbering in `client/src/pages/client/create-shipment.tsx` is computed, not hardcoded,
because the step only exists when the client declares.

### 3. Quoting

`POST /api/client/shipments/rates` gates twice before any carrier is called:

- the **client** must have `dangerous_goods_enabled` → otherwise 403;
- the **carrier account** must be DG-approved by the carrier → adapters without
  `capabilities.dangerousGoods.supported` are filtered out; if none is left, 422.

That second gate exists because an unapproved account does not merely lose the surcharge —
DHL and FedEx reject the rate call outright. Filtering produces one clear message instead of
a pile of carrier errors.

Adapters also **refuse to answer a DG quote with a synthetic rate**
(`rejectSyntheticDangerousGoodsRate`). Every adapter falls back to mock or locally-calculated
rates when the carrier API is unavailable; those fallbacks cannot contain the carrier's DG
surcharge, so for a DG quote they raise `DANGEROUS_GOODS_RATE_UNAVAILABLE` instead.

### 4. Checkout

The declaration is already on the quote (it had to be, to price it), so checkout only carries
the paperwork. The shipment is created with `has_dangerous_goods = true` and
`dangerous_goods_status = 'pending_review'`.

### 5. The hold

`finalizePaidShipmentAfterPayment` returns **before** the carrier booking for any shipment in
`pending_review`: status `awaiting_review`, a high-severity attention flag, an ops assignment,
and the invoice raised as normal. The client has paid; nothing has been tendered.

### 6. Review

Operations hub → **Dangerous Goods**, or the review panel on any DG shipment's Track tab.
The whole declaration is shown verbatim rather than summarised — the operator is signing it.

- **Approve** → `POST /api/operations/shipments/:id/dangerous-goods/approve` books the
  carrier. A carrier failure leaves the approval standing and moves the shipment to
  `carrier_error` so it is visible and retryable.
- **Reject** → `POST /api/operations/shipments/:id/dangerous-goods/reject` requires a written
  reason, cancels the shipment and auto-refunds. Nothing was ever tendered, so there is no
  carrier cancellation to make.

A declaration whose stored JSON cannot be parsed **cannot be approved** (422). The carrier
payload is built from that JSON, so approving it would book the goods undeclared.

---

## Carrier support

| Carrier | DG via API | How |
|---|---|---|
| DHL Express | yes | `content.packages[].dangerousGoods[{contentId}]` + root `valueAddedServices[{serviceCode}]` |
| FedEx | yes | `packageSpecialServices.dangerousGoodsDetail` per package + shipment-level `DANGEROUS_GOODS` |
| Aramex | **no** | the Shipping Services API has no DG structure at all |
| All local carriers | **no** | domestic couriers, no DG surface |

Refusal is enforced centrally in `server/integrations/carriers.ts`: any adapter that has not
declared `capabilities.dangerousGoods.supported` is wrapped at registration and rejects a DG
request with `DangerousGoodsUnsupportedError`. A newly added carrier is therefore DG-refusing
by default — the failure mode of forgetting the guard would be regulated goods travelling as
general cargo.

### DHL content IDs and service codes

DHL declares dangerous goods by a **content id** its contract approved, plus a value added
service code. **One content id per shipment** — a declaration mixing types must be split into
two shipments.

| DG type | contentId | serviceCode |
|---|---|---|
| Li-ion Section II PI965 / PI966 / PI967 | 965 / 966 / 967 | HB / HD / HV |
| Li-metal Section II PI969 / PI970 | 969 / 970 | HM / HW |
| Fully regulated lithium (Section IA/IB) | 911 | HE |
| Biological substance UN3373 / GMO | 650 / 651 | HY |
| Limited quantities (ADR) | A01 | HL |
| Consumer commodity ID8000 | 700 | HK |
| Magnetized material UN2807 | HT1 | HX |
| Pressurized articles UN3164 | HU1 | HU |
| Exempt specimens | HU3 | HU |
| ADR load exemption | A02 | HN |
| Fully regulated dangerous goods | *per contract* | HE |
| Excepted quantities (IATA) | E01 | HH — **not accepted via API** |
| Dry ice UN1845 | 901 | HC — **not accepted via API** |

Fully regulated goods have no published content id: DHL assigns one per account. Set it in
**Apps → DHL Express → Dangerous Goods Content IDs** as a JSON map, e.g.
`{"FULLY_REGULATED":"HE1"}`. Configured ids take precedence over the table above, because DHL
validates against the contract, not the brochure.

The table lives in `shared/dangerous-goods.ts` (`DHL_DG_CODE_TABLE`) and is pinned by tests.

---

## Before enabling in production

Both carriers gate DG at the account level, and the failure modes differ:

- **DHL** — approval is per `(serviceCode, contentId)` pair. An unapproved pair is **not**
  rejected by the API. The shipment is stopped later at the DHL facility, after the client has
  paid. Confirm the code table against the account's own contract before going live.
- **FedEx** — approval comes through an account executive; the exact per-account JSON comes
  from `dghotline@fedex.com`.

Until then, leave `FEDEX_DG_ENABLED` / `DHL_DG_ENABLED` off in Apps. With both off, no DG
quote reaches a carrier and the feature is inert in production.

---

## Where things live

| Concern | File |
|---|---|
| Types, DHL/FedEx resolvers, code table | `shared/dangerous-goods.ts` |
| Declaration validation (Zod) | `shared/schema.ts` |
| Read a stored declaration | `server/services/dangerous-goods.ts` |
| Carrier refusal guard | `server/integrations/carriers.ts` |
| DHL payloads | `server/integrations/dhl.ts` |
| FedEx payloads | `server/integrations/fedex.ts` |
| Rate gating, checkout, the hold, review endpoints | `server/routes.ts` |
| Queue and counts | `server/services/operations.ts` |
| Declaration step | `client/src/pages/client/create-shipment.tsx` |
| Review panel and queue | `client/src/pages/operations/hub.tsx` |
| Schema | `migrations/2026-08-23-dangerous-goods.sql` |

## Deliberately not supported

- **Aramex and local carriers** — no API surface for a declaration.
- **Mixed content types on one DHL shipment** — DHL accepts one content id; split the shipment.
- **Excepted quantities (HH) and dry ice (HC) on DHL** — not accepted through MyDHL API even
  on an approved account. The resolver returns a specific message pointing at operations
  rather than a generic failure.
