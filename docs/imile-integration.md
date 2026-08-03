# iMile Integration

iMile is integrated as a **`both`-type carrier**: it serves domestic KSA/AE last-mile *and*
cross-border lanes, so it appears in **both** the local-shipment flow (alongside SMSA, Naqel, J&T,
RedBox, Zajil) **and** the international/express flow (alongside FedEx, DHL, Aramex). On booking the
platform creates the order on iMile's OpenAPI, stores the returned AWB, and pulls the label + tracking.

Carrier surfacing is capability-driven: the local list keeps carriers whose `type !== "international"`
and the express list keeps carriers whose `type !== "local"` — `type: "both"` satisfies both. No
per-list enum edits are needed; iMile appears wherever it can price.

- **Adapter:** `IMileAdapter` in [`server/integrations/local-carriers.ts`](../server/integrations/local-carriers.ts) (`carrierCode: "IMILE"`, `capabilities.type: "both"`).
- **Registered in:** [`server/integrations/carriers.ts`](../server/integrations/carriers.ts).
- **Apps-tab definition:** key `imile` in [`server/services/integration-apps.ts`](../server/services/integration-apps.ts).
- **Docs:** <https://developer.imile.com> · <https://imiledeveloperskit.docs.apiary.io/>

## Credentials (Apps tab → iMile)

| Field | Env key | Notes |
|-------|---------|-------|
| Customer ID | `IMILE_CUSTOMER_ID` | iMile client code, e.g. `C2102175701`. |
| Sign / API Secret | `IMILE_SIGN` | API secret; sent verbatim with `signMethod: SimpleKey`. Secret. |
| API Base URL | `IMILE_BASE_URL` | Test `https://openapi.52imile.cn` · Prod `https://openapi.imile.com`. |
| Time Zone (setting) | `IMILE_TIME_ZONE` | Account offset on each request. KSA `+3`, UAE `+4`. Default `+3`. |
| Sign Method (setting) | `IMILE_SIGN_METHOD` | `SimpleKey` (default), `MD5`, or `SHA256` per contract. |

Egress host allowlist: `openapi.52imile.cn`, `openapi.imile.com`.

### Test account

```
Base URI:   https://openapi.52imile.cn
customerId: C2102175701
sign:       MIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAwggJcAgEAAoGBAMhUhTRlDHZV6a4i
OMS portal: https://test-oms.52imile.cn/  (user C2102175701 / Hultinfo@2025)
```

## Auth & request envelope

Every request is a JSON envelope; the real payload rides in `param`:

```json
{
  "customerId": "C2102175701",
  "sign": "<API secret>",
  "signMethod": "SimpleKey",
  "format": "json",
  "version": "1.0.0",
  "timestamp": 1648883951481,
  "timeZone": "+3",
  "accessToken": "<2h token>",
  "param": { /* endpoint payload */ }
}
```

Two-step auth:

1. `POST /auth/accessToken/grant` with `param: { grantType: "clientCredential" }` → `data.accessToken` (lives `expiresIn` = 7200s).
2. Every other call repeats the envelope plus that `accessToken`.

Tokens are cached per `host|customerId` and refreshed a minute before expiry; a missing/invalid-token
code (402 / 407) triggers exactly one refresh + retry. With `signMethod: SimpleKey` the `sign` is sent
as-is — no hashing. Responses are HTTP 200 with an app-level `code` (`"200"` = success); anything else is
raised as a `CarrierError` (`IMILE_<code>`).

## Endpoints used

| Purpose | Path | Method |
|---------|------|--------|
| Grant access token | `/auth/accessToken/grant` | POST |
| Estimate shipping fee (rates) | `/client/order/calShippingFee` | POST |
| Create order (Forward, type 100) | `/client/order/v2/createOrder` | POST |
| Cancel order (before pickup) | `/client/order/deleteOrder` | POST |
| Track (single, by waybill) | `/client/track/getOne` | POST |
| Reprint label | `/client/order/batchRePrintOrder` | POST |

### Create order

- `orderType: "100"` (Forward). `senderInfo` / `consigneeInfo` carry contacts, phone, country, city,
  area, address, zipCode; the recipient's Saudi national-address short code (`streetLine3`) maps to
  `consigneeInfo.shortAddress`.
- `packageInfo`: `grossWeight` (total KG), `totalCount` (pieces), `length/width/high` (cm, from the
  first package's dimensions), declared value/currency, `paymentMethod: "PPD"`.
- `items` → `skuInfos[]` (name, qty, declared value, HS code) when present.
- Response: `data.expressNo` = AWB (stored as tracking number); `data.imileAwb` = A6 label PDF as
  **base64** (stored as `labelData`, no separate label fetch needed).

### Country naming

iMile uses its own country names, not ISO ALPHA-2. The adapter maps them: `SA→KSA`, `AE→UAE`, and
ALPHA-3 for the rest (`CN→CHN`, `KW→KWT`, `BH→BHR`, `OM→OMN`, `QA→QAT`, `EG→EGY`, `JO→JOR`, …);
unknown codes pass through unchanged.

### Tracking

`/client/track/getOne` with `orderType: "1"` (by waybill), `language: "2"` (English). `data.locus`
arrives newest-first and is reversed to chronological `events[]`; `data.latestStatus` sets the top-line
status.

## Pricing

iMile exposes a live shipping-fee estimate: `POST /client/order/calShippingFee`.

**Request `param`** — `senderInfo` / `consigneeInfo` (`country`, `province`, `city`, `area`, `zipCode`),
`orderType: "100"`, `paymentMethod: "PPD"`, `goodsType: "Normal"`, `totalWeight` (KG), `totalVolume`
(cm³, from package dims), `clientDeclaredValue` / `clientDeclaredCurrency`.

**Response `data`** — `totalAmount` (used as the base rate), `currency`, `weight` (chargeable), and a
`feeDetails[]` breakdown (e.g. `BayanFee`, `CODServiceFee`, each with `amount` + `vat`).

`getRates` returns `totalAmount` as the base rate (platform markup + VAT applied on top, same as any
carrier). When the lane's product is **not enabled** for the account (`code 400 "Product Service no
open"`) or the estimate errors, `getRates` returns `[]` and the platform prices iMile off the stored
**rate card** (Local Pricing → carrier `IMILE`). Keep an iMile rate card configured as the fallback.

> Verified against the test host: KSA→KSA returns `code 200` with a SAR `totalAmount`. Cross-border
> lanes (e.g. CHN→KSA) returned `Product Service no open` on the test account until iMile enables that
> product — the rate-card fallback covers those meanwhile.

## Frontend touch-points

- Carrier display name `iMile` — [`client/src/components/carrier-logo.tsx`](../client/src/components/carrier-logo.tsx).
- Apps-tile gradient — [`client/src/pages/admin/apps.tsx`](../client/src/pages/admin/apps.tsx).
- Local Pricing carrier option `IMILE` — [`client/src/pages/admin/local-pricing.tsx`](../client/src/pages/admin/local-pricing.tsx) and [`pricing.tsx`](../client/src/pages/admin/pricing.tsx).
- Assignment-rules carrier list — [`client/src/pages/client/assignment-rules.tsx`](../client/src/pages/client/assignment-rules.tsx).

Upload the iMile logo in the Apps tab to replace the name chip everywhere.

## Verification

Token grant + adapter track were smoke-tested against the test host (`openapi.52imile.cn`) — auth
returns `code: 200` with a 2-hour `accessToken`, and the adapter's `trackShipment` round-trips the
envelope successfully. Booking/cancel should be validated against the OMS portal with the test account
before enabling in production.
