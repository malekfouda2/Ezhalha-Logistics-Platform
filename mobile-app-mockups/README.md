# Mobile app mockups

Reference designs for the Ezhalha React Native app. Screens mirror the real pages in
`client/src/pages/client/` — card titles, wizard steps, tab names and dialog titles are
taken from the code, not invented.

Every screen is 390 × 844 (iPhone 14/15 logical size), exported at 3×.

## Layout

```
client/<flow>/NN-screen.png     one PNG per screen
client/<flow>/00-gallery.png    the whole flow on one sheet
client/<flow>/_all.html         editable source for that flow
```

## Client app

| Flow | Screens | Covers |
| --- | --- | --- |
| [`01-auth`](client/01-auth) | 7 | Sign in, passwordless code, password reset, invite, public application |
| [`02-dashboard`](client/02-dashboard) | 2 | Home and notifications |
| [`03-create-express`](client/03-create-express) | 11 | The 9-step express wizard — Type → Sender → Recipient → Packages → Rate → Customs → Pickup → Payment → Confirmation |
| [`04-create-local`](client/04-create-local) | 6 | 5-step domestic flow via local carriers |
| [`05-create-freight`](client/05-create-freight) | 10 | 9-step Door To Door Freight (DDP) flow |
| [`06-shipments`](client/06-shipments) | 6 | List, attention queue, detail, live tracking, cancel, empty state |
| [`07-quotations`](client/07-quotations) | 3 | Admin-prepared quotations and acceptance |
| [`08-orders`](client/08-orders) | 7 | Sales channels, orders, fulfilment, carrier assignment rules |
| [`09-billing`](client/09-billing) | 7 | Invoices, credit / pay-later, payments, saved cards |
| [`10-account`](client/10-account) | 8 | Settings, company details, currency, team permissions, devices, quick quote |

**67 client screens across 10 flows.**

## Operations (M2)

[`operations/`](operations) — 4 screens: hub and queues, shipment status handling,
tasks, waybill scanning.

## Admin (M3)

Not mocked. 151 endpoints across 27 web pages, and the decision on which parts belong on
a phone hasn't been made — mocking it now would be guesswork. Worth doing once M1 ships.

## Rebuilding

Screens are generated, not hand-written, so the flows stay consistent.

```bash
python3 _src/build.py            # helpers + device chrome
python3 _src/run.py              # renders every flow
python3 _src/run.py --no-png     # HTML only (fast)
```

`_src/screens.py` holds the content, `_src/build.py` the components, and
`_src/base.css.html` the design system (lifted verbatim from the original mockups).

## Conventions to carry into the app

- Brand orange `#fe5200`. Full token set is in the `:root` block of `_src/base.css.html`.
- **Currency:** `﷼` is strong-RTL, so `﷼450.00` reorders to `450.00﷼`. Amounts are wrapped
  in `.sar { unicode-bidi: bidi-override; direction: ltr }`. This bites in React Native too.
- **RTL:** use `start`/`end`, never `left`/`right`.
- Tracking IDs are `EZH#########`; the carrier's own number is shown separately.
- Displayed totals always include VAT (15%).
- Money is a string end to end — never a float.

