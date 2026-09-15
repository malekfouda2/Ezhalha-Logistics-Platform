# Tap native checkout (in-app payment)

The mobile app takes payment inside the app instead of bouncing the customer to a hosted page.
This documents the backend half.

Tap docs: [Checkout SDK — React Native](https://developers.tap.company/docs/checkout-sdk-react-native)

## Why this needs a new endpoint at all

The hosted flow and the native flow are inverted:

| | Hosted (web) | Native SDK (mobile) |
| --- | --- | --- |
| Who creates the charge | **The server**, via `POST /charges/` | **The device**, via the SDK |
| Key used | Secret key | Public key |
| How the customer pays | Redirect to `charge.transaction.url` | Sheet rendered in the app |
| What the server returns | A charge id and a URL | A signed configuration |

Because the device creates the charge, the server cannot state the amount by putting it in an API
call. It states the amount by **signing** it. That signature is `hashString`, and it is the entire
reason this endpoint exists — without it, a patched client could open the sheet for SAR 1.00.

## `POST /api/client/payments/tap/checkout-session`

Auth: client session or bearer token, same as every other `/api/client/*` route.

```jsonc
// Request — exactly one target, and nothing else that touches money.
{ "shipmentId": "3f6c…" }        // or { "invoiceId": "inv_…" }
// Optional: "language": "en" | "ar", "saveCardForFuture": true, "returnPath": "/client/shipments"
```

An `amount` in the body is **ignored**. The server prices the shipment or invoice itself, applying
the same abandoned-recovery discount and the same FX conversion the hosted flow applies.

```jsonc
// Response
{
  "configured": true,
  "configurations": { /* hand this to the SDK unchanged */ },
  "target": "shipment",
  "shipmentId": "3f6c…",
  "trackingNumber": "EZH043868517",
  "amount": 1457.70,
  "currency": "SAR",
  "amountSar": 1457.70,
  "fxRate": 1,
  "tapIntegrationAccountId": "a6d9…"
}
```

### Rules for the app

1. **Check `configured` before opening the sheet.** False means Tap has no public key for this
   account and there is nothing to authenticate with.
2. **Pass `configurations` through untouched.** Every signed field — amount, currency,
   `reference.transaction`, `post.url` — is covered by `hashString`. Change one and Tap rejects the
   session, with a message that will not tell you why.
3. **Do not treat `onSuccess` as settlement.** It returns a `chargeId` and nothing more. Payment is
   confirmed when our webhook has processed it; poll the shipment or invoice.

## Settlement is unchanged

The session sets `post.url` to `/api/webhooks/tap`, so an SDK charge lands in exactly the same
handler as a hosted one and reconciles through `processTapChargeUpdate`. There is no second
settlement path.

The charge is matched to its shipment or invoice three ways, in order:

1. `metadata.shipmentId` / `metadata.invoiceId` — what the hosted flow has always used.
2. `paymentIntentId` recorded on the shipment — not available here, because no charge exists when
   the session is built.
3. **`reference.order`** — added for this flow. Tap always echoes `reference`, whereas metadata
   reaches Tap through the SDK rather than through our own request. If the SDK ever drops a
   metadata key, the payment still finds its shipment.

`reference.idempotent` is set to our row id, so a double tap on a slow connection settles as one
charge. This platform has already had a duplicate-payment incident; that field is not decoration.

## The signature

`server/integrations/tap.ts` → `buildCheckoutHashString`:

```
HMAC-SHA256(
  "x_publickey{publicKey}x_amount{amount}x_currency{currency}x_transaction{reference}x_post{postUrl}",
  secretKey
)  → hex
```

Positional and compared byte for byte. The amount carries the decimals its currency uses — three
for KWD and BHD, two for SAR and USD — which is what `formatTapAmount` handles. Reordering the
fields or formatting the amount differently breaks payment with no useful error.

The secret key never leaves the server, and `tests/tap-checkout-session.test.ts` asserts it does
not appear anywhere in the response body.

## Guards

The in-app sheet must not be a way around a check the web flow enforces, so
`getShipmentPaymentBlockReason` is shared by `/shipments/pay` and this endpoint. It refuses:

- a shipment already paid, or not in `payment_pending` / `carrier_error`
- a DDP quote whose terms have not been accepted
- a dangerous-goods shipment the client has not confirmed
- an **expired** dangerous-goods quote

Ownership is checked against the caller's `clientAccountId` before anything else.

## Tests

- `tests/tap-checkout-session.test.ts` — the signature is byte-exact, changes with every signed
  field, formats per-currency decimals, and the payload carries no secret.
- `tests/api-client.test.ts` — the endpoint prices the invoice itself and ignores an `amount` in
  the body, refuses another account's invoice, refuses an already-paid invoice, requires exactly
  one target, and a webhook carrying only `reference.order` still settles.

## Not done here

`TAP_PUBLIC_KEY` and `TAP_MERCHANT_ID` must be set on the Tap integration account the mobile
traffic routes to — both already exist as credential fields on the Apps page. Production currently
has one Tap account ("Ezhalha worldwide", default).
