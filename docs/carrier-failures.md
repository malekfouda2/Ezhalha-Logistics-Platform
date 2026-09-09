# Knowing when a carrier says no

How carrier failures get captured, translated and surfaced.

## The problem this solves

Shipment **EZH327836721** sat for three days. An operator retried its DHL pickup **fourteen
times** across 28–30 August. Every attempt was rejected with the same message, which DHL had
sent on the very first one:

```
400 - 5006: Pickup is not allowed for this shipment date. Please update and re-try again.
```

The collection dates being requested were 30 August (a Sunday) and 31 August (the UK Summer
Bank Holiday) — the shipper is in Newport, Wales, and DHL UK collects on neither. The carrier
had said exactly what was wrong. Three things stopped anyone hearing it:

1. **Production discarded the message.** Both adapters looked for a response key that neither
   carrier actually returns, so every production failure was logged as `{}`.
2. **Nothing translated the code.** `5006` means nothing to an operator, and DHL's own text
   ends "please update and re-try" without saying *what* to update — so they re-tried.
3. **Nothing raised a flag.** The reason was written to a database column and stopped there.

Meanwhile **1,498 FedEx tracking calls** were rejected over the same two months — a refused
credential — and nobody noticed, because each failure happened quietly inside a scheduler.

## The three layers

### 1. Capture — `server/services/integration-log-payload.ts`

The rule is deliberately asymmetric:

- **Successes** stay out of the production log. They are the volume and tell us nothing.
- **Failures** keep the carrier's own body, masked for credentials and capped at 4KB.

Truncation is recorded in the payload (`{truncated: true, originalLength}`) rather than
silently trimming, so a cut-off message is never mistaken for the whole of what the carrier
said. All three carrier adapters share this one function.

### 2. Translate — `shared/carrier-errors.ts`

`explainCarrierError({ message, carrierCode, statusCode })` returns a title, the cause in
plain words, the next action, and — most valuably — **whether retrying could possibly work**:

| Advice | Meaning |
|---|---|
| `retry` | Transient. Worth trying again unchanged. |
| `after_fix` | Retrying unchanged will fail again. Change something first. |
| `not_retryable` | No amount of retrying or editing helps; a credential or account needs fixing. |

Two rules keep it honest:

- **Every catalogue entry was seen in production.** Speculative codes would make the
  catalogue look thorough while widening the chance of explaining an error *wrongly*, which is
  worse than not explaining it — a confident wrong answer sends someone down the wrong path.
- **The carrier's original message is always preserved.** The translation is a lens, never a
  replacement.

An unrecognised error still gets useful advice: a **4xx means the carrier looked at what we
sent and refused it**, so retrying it unchanged is pointless even when we cannot say precisely
why. That distinction alone breaks the fourteen-retry loop.

### 3. Surface — four places

**Attention flag** (`server/services/carrier-failure-reporting.ts`) — every pickup, booking
and tracking failure raises one flag carrying the decoded cause and action.
`upsertOpenAttentionFlag` updates a single flag rather than stacking fourteen duplicates.

**Ops hub** — the attention panel shows a retry badge, why, what to do, the date that was
rejected, and the carrier's raw message behind a disclosure.

**Notification** — the assigned operator is pinged, but **only when `retry !== "retry"`**. A
transient carrier 5xx that the scheduler will retry on its own does not need a human pulled in.

**Admin → System → Integration Health** — failure counts per service and the distinct problems
behind them, grouped by (service, operation, status). This is where the 1,498 tracking 403s
would have been obvious.

**Daily email digest** — off unless `INTEGRATION_DIGEST_EMAIL` or `ADMIN_EMAIL` is set, and
suppressed entirely on any day where nothing actionable failed. Transient outages are excluded
on purpose: a digest that arrives daily saying "nothing wrong" is one people filter away, and
then it is useless on the day it matters. Note the Postmark plan's send cap.

## Severity

| Category | Severity | Why |
|---|---|---|
| Credentials refused | high | Every shipment on that account is failing, not just this one |
| Platform bug | high | Ours to fix; retrying cannot help |
| Pickup / booking failure | high | The client has paid and the shipment is stuck |
| Carrier 5xx | low | Usually clears on its own — flagging every blip trains people to ignore flags |

## Adding a new error

Add an entry to `CATALOGUE` in `shared/carrier-errors.ts` with a `match` regex, and a test in
`tests/carrier-errors.test.ts` using the **real production string**. Set `carrier` when the
same code means different things across carriers — DHL's `5006` must never explain a FedEx
error. If you cannot produce a real example, leave it out.

## Known open items this surfaced

- **FedEx tracking credentials are refused** — 1,498 rejections in 60 days. FedEx tracking is
  a separate project and key from Ship/Rate (`FEDEX_TRACK_API_KEY`), so booking keeps working
  while tracking fails.
- **No working-day validation on pickup dates.** `requestPickup` sends the stored date
  verbatim; `advanceToBusinessDay` skips weekends only and never applies to the pickup date.
  Nothing anywhere knows about public holidays, so a bank holiday can still be submitted. This
  release explains the rejection but does not prevent it.
