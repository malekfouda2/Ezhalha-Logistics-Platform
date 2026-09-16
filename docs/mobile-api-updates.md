# Backend updates for the mobile app

Two changes, both requested by the mobile side. Neither breaks anything that exists today — the
web portal sends none of the new headers or fields, so nothing already shipped changes behaviour.

1. **[Pagination](#1-pagination)** — one `{ data, pagination }` shape for every list endpoint.
2. **[In-app Tap payment](#2-in-app-tap-payment)** — a signed session for Tap's native Checkout
   SDK, so the payment sheet opens inside the app instead of redirecting out.

Environments:

| | URL |
| --- | --- |
| Staging | `https://staging.ezhalha.co` |
| Production | `https://app.ezhalha.co` |

Auth is unchanged. Native clients use `POST /api/auth/token` and send
`Authorization: Bearer <token>`; see the OpenAPI spec (`docs/openapi.json`) for the full route
list.

---

## 1. Pagination

### The problem this solves

List endpoints grew three different shapes over time:

| Shape | Example endpoint | Response |
| --- | --- | --- |
| Bare array | `GET /api/client/shipments` | `[ {...}, {...} ]` |
| Resource-keyed | `GET /api/admin/shipments` | `{ shipments: [...], total, page, totalPages }` |
| Items-keyed | `GET /api/operations/tasks` | `{ items: [...], total, page, pageSize }` |

You cannot write one list screen against three shapes, and several of the bare-array endpoints
return an account's entire history in a single response.

### Opting in

Send one header on any `GET`:

```http
X-Paginate: 1
```

Or, if setting a header is awkward in some call site, `?paginate=1` does the same thing.

**Without the opt-in, every endpoint returns exactly what it returns today.** That is deliberate —
it is what makes this safe to ship while the web portal is live. Set the header once in your HTTP
client and every list is uniform from then on.

### The response

```jsonc
{
  "data": [ /* the items */ ],
  "pagination": {
    "page": 2,
    "pageSize": 25,
    "total": 143,
    "totalPages": 6,
    "hasNextPage": true,
    "hasPreviousPage": true
  }
}
```

### Paging parameters

| Parameter | Default | Notes |
| --- | --- | --- |
| `page` | `1` | 1-indexed |
| `pageSize` | `25` | Clamped to `100`. Aliases: `perPage`, `limit` |

```http
GET /api/client/shipments?page=2&pageSize=25
X-Paginate: 1
Authorization: Bearer <token>
```

### Rules you can rely on

- `total` is the count across **all** pages, not the number in `data`.
- `totalPages` is **never 0**. An empty list is one empty page, so `page 1 of 1` — safe to render
  a pager without a special case.
- A page past the end returns `"data": []`, not an error.
- An unparseable `page` (say `?page=abc`) falls back to page 1 rather than 400ing or returning
  nothing — a stale deep link still shows something.
- **Errors are never wrapped.** A 4xx/5xx keeps its own `{ "error": "..." }` shape, so your error
  handling does not need to look inside an envelope.
- **Single resources are never wrapped.** `GET /api/client/account` returns the account, not a
  one-item page.
- Endpoints that return extra keys beside their list keep them at the top level. For example
  `GET /api/admin/shipments?abandoned=true` returns `recoveries` and `metrics` alongside `data`.

### Example

```ts
type Paginated<T> = {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

async function fetchPage<T>(path: string, page = 1, pageSize = 25): Promise<Paginated<T>> {
  const url = `${BASE_URL}${path}?page=${page}&pageSize=${pageSize}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Paginate": "1",
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? body.message ?? `HTTP ${res.status}`);
  }

  return res.json();
}

// Infinite scroll
const next = await fetchPage<Shipment>("/api/client/shipments", page + 1);
if (next.pagination.hasNextPage) { /* … */ }
```

### One caveat

Most endpoints currently page **in memory** — the server still reads the full set from the database
and slices it. Your payload shrinks; the server's query does not. That is fine at today's volumes
and invisible from your side. If a specific list ever feels slow, tell us which one and we will
push its paging down into SQL — the response shape will not change.

---

## 2. In-app Tap payment

### Why this needed a new endpoint

Tap's native Checkout SDK works the opposite way round from our web flow:

| | Hosted (web) | Native SDK (your app) |
| --- | --- | --- |
| Who creates the charge | **The server** | **The device**, via the SDK |
| Key used | Secret key | Public key |
| How the customer pays | Redirect to a hosted page | Sheet rendered in the app |
| What the server gives you | a charge id and a URL | a **signed configuration** |

Because the SDK creates the charge on the device, the server cannot state the amount by putting it
in an API call. It states the amount by **signing** it, and Tap verifies that signature. That is
why there is a new endpoint rather than a flag on the existing one.

Tap's own docs: <https://developers.tap.company/docs/checkout-sdk-react-native>

### `POST /api/client/payments/tap/checkout-session`

Send exactly one target and nothing else that touches money:

```jsonc
// Pay for a shipment
{ "shipmentId": "3f6c1d9e-…" }

// Or settle an invoice
{ "invoiceId": "inv_…" }

// Optional on either
{
  "language": "ar",            // "en" (default) or "ar"
  "saveCardForFuture": true,
  "returnPath": "/client/shipments"
}
```

There is **no `amount` field**, and sending one has no effect — it is ignored. The server prices
the shipment or invoice itself, applying the same discounts and currency conversion the web flow
applies, and signs the result.

### The response

```jsonc
{
  "configured": true,
  "configurations": { /* hand this to the SDK unchanged */ },

  "target": "shipment",
  "shipmentId": "3f6c1d9e-…",
  "trackingNumber": "EZH043868517",
  "amount": 1457.70,
  "currency": "SAR",
  "amountSar": 1457.70,      // shipments only — the SAR accounting figure
  "fxRate": 1,               // shipments only
  "tapIntegrationAccountId": "a6d9…"
}
```

Use the top-level `amount` / `currency` for anything **you** render. Use `configurations` only to
hand to the SDK.

### Three rules

**1. Check `configured` before opening the sheet.** `false` means Tap has no public key set up for
that account — there is nothing for the SDK to authenticate with, and opening it anyway fails
inside the payment UI where the error is unhelpful. Fall back to the hosted redirect flow.

**2. Pass `configurations` through untouched.** Amount, currency, `reference.transaction` and the
webhook URL are all covered by `hashString`. Change any one of them — even reformatting the amount
— and Tap rejects the session with a message that will not tell you why. If you need a different
amount, ask the server for a different session.

**3. `onSuccess` is not settlement.** It hands you a `chargeId` and nothing more. The payment is
confirmed when Tap's webhook reaches our backend and we reconcile it. After `onSuccess`, poll the
shipment or invoice until it reports paid:

- `GET /api/client/shipments/:id` → `paymentStatus: "paid"`
- `GET /api/client/invoices` → the invoice's `status: "paid"`

A few seconds is normal. Treating `onSuccess` as final will occasionally show a customer a paid
screen for a payment that later failed.

### Example

```ts
import { startCheckoutSDK } from "@tap-payments/checkout-react-native";

async function payForShipment(shipmentId: string) {
  const res = await fetch(`${BASE_URL}/api/client/payments/tap/checkout-session`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ shipmentId, language: "en" }),
  });

  const session = await res.json();

  if (!res.ok) throw new Error(session.error ?? "Could not start payment");
  if (!session.configured) return fallbackToHostedRedirect(shipmentId);

  startCheckoutSDK({
    // Unchanged. Do not merge your own fields into this object.
    ...session.configurations,

    onSuccess: async (data: string) => {
      const { chargeId } = JSON.parse(data);
      await pollUntilPaid(shipmentId, chargeId);
    },
    onError: (error: string) => showError(error),
    onClose: () => {},
    onReady: () => {},
  });
}
```

### Errors

| Status | Meaning |
| --- | --- |
| `400` | Not payable right now — read `error` and show it. Includes already-paid, an unaccepted DDP declaration, an unconfirmed or **expired** dangerous-goods quote, and sending neither or both targets |
| `403` | The shipment or invoice belongs to another account |
| `404` | Shipment or invoice not found, or no client account on the session |

The `400` messages are written to be shown to the customer as-is.

### Things the backend handles so you do not have to

- **Pricing**, including any active abandoned-cart discount and FX conversion when the account is
  billed in a currency other than SAR.
- **Double submission.** The session carries an idempotency reference, so a double tap on a slow
  connection settles as one charge.
- **Settlement.** The session points Tap's webhook at our backend, so an SDK charge reconciles
  through exactly the same code as a web payment. Invoices, credit ledgers and carrier booking all
  follow as normal.

---

## Questions

Both changes are on staging first. If something in the shapes above does not match what you get
back, say which endpoint and we will look — do not work around it in the app.
