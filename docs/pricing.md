# Pricing Reference

How Ezhalha turns a carrier cost into what a client pays. This is the single source of
truth for admins configuring pricing and for developers touching the rate engines.

Accounting currency is **SAR**. VAT is **15%** (`VAT_RATE` in
`server/services/shipment-accounting.ts`). All markup is added on top of a base rate,
never baked into it.

---

## 1. The three pricing types

| Type | When it applies | Base rate source | Markup source | VAT |
|---|---|---|---|---|
| **Local (domestic KSA)** | Shipments inside Saudi Arabia via SMSA / Naqel | Live carrier API, else rate-card fallback | `local_carrier_pricing_tiers` (percent or flat, per weight band + profile) | 15% on the full amount (DCE scenario) |
| **International express** | Cross-border via carrier APIs (DHL / FedEx / Aramex) | Live carrier rate | Client profile margin % (`pricing_rules` + value tiers) | 15% per tax scenario (import/export = margin-only) |
| **DDP (door-to-door)** | Manually-fulfilled duties-inclusive freight | Lane rate (air per-kg / sea per-cbm) in `ddp_pricing_lanes` | Profile DDP margin % (`pricing_rules.ddpMarginPercentage` + `ddp_pricing_tiers`) | 15% margin-only |

The three paths are independent — a shipment uses exactly one.

---

## 2. Price formulas (exact, from code)

### Local — `server/services/local-pricing.ts` → `resolveLocalRate()`

```
base      = live carrier rate  (else tier.baseRateSar fallback)
markup    = tier.markupType === "flat" ? markupValue : base × markupValue/100
if (base + markup) < tier.minCharge:  markup += minCharge − (base + markup)   # floor
clientExclTax = base + markup
VAT       = clientExclTax × 0.15        # domestic = full VAT (DCE)
client total = clientExclTax + VAT
```

Tier selection: enabled tiers for the carrier whose weight band contains the shipment
weight (`min ≤ w < max`), preferring one matching the client's profile, else a
profile-agnostic tier.

### International express — `pricing_rules` + `pricing_tiers`

```
base      = live carrier rate (DHL/FedEx/Aramex)
markup%   = highest value tier whose minAmount ≤ base   (else profile.marginPercentage)
markup    = base × markup%/100
finalPrice = base + markup      # stored in shipment_rate_quotes
VAT applied per tax scenario in shipment-accounting.ts (import/export extract margin VAT)
```

### DDP — `server/services/ddp-pricing.ts` → `calculateDdpPrice()`

```
# air:
chargeable kg = max(actual, dimensional)   dimensional = L×W×H / volumetricDivisor(6000)
billable      = roundUp(max(chargeable, minimumBillableKg), kgRoundingIncrement)
subtotal      = billable × airBaseRatePerKg
# sea:
billable      = roundUp(max(cbm, minimumBillableCbm), cbmRoundingIncrement)
subtotal      = billable × seaBaseRatePerCbm

base      = max(subtotal, minimumShipmentCharge)
markup    = base × markupPercentage/100     # markupPercentage = profile DDP margin
total     = base + markup
VAT margin-only in the accounting engine
```

---

## 3. Config fields → tables

| Table | Purpose | Key columns |
|---|---|---|
| `pricing_rules` | Client markup **profiles** | `profile` (regular/mid_level/vip, unique), `displayName`, `marginPercentage`, `ddpMarginPercentage`, badge styling, `isActive` |
| `pricing_tiers` | Value-based margin tiers per profile | `profileId`, `minAmount` (SAR), `marginPercentage` |
| `ddp_pricing_lanes` | DDP door-to-door lane rates | origin/dest country+city, `airBaseRatePerKg`, `seaBaseRatePerCbm`, `minimumBillableKg/Cbm`, `kg/cbmRoundingIncrement`, `minimumShipmentCharge`, `volumetricDivisor`, air/sea transit days, `isActive` |
| `ddp_pricing_tiers` | Tiered DDP markup per profile | `profileId`, `billingUnit` (KG/CBM), `minAmount` (billable-qty threshold), `marginPercentage` |
| `local_carrier_pricing_tiers` | Local carrier markup by carrier + weight band | `carrierCode`, `minWeightKg`/`maxWeightKg`, `baseRateSar` (fallback), `markupType` (percent/flat), `markupValue`, `minCharge`, `clientProfile`, `enabled` |
| `shipment_rate_quotes` | Persisted computed quotes | `carrierCode`, chargeable weight, `baseRate`, `marginPercentage`, `marginAmount`, `finalPrice`, `expiresAt` |
| `carrier_assignment_rules` | Which carrier/strategy wins per client | `conditions` (JSON), `strategy` (specific/cheapest/fastest), `carrierCode`, `priority` |

> Note the word **"tier"** means three different things: `pricing_tiers` (by SAR value),
> `ddp_pricing_tiers` (by KG/CBM quantity), `local_carrier_pricing_tiers` (by weight band).

A client's profile comes from `client_accounts.profile`. Per-shipment overrides are
stored on the shipment (`margin`, `marginAmount`, extra-fee columns).

---

## 4. Endpoint reference

All in `server/routes.ts`. Admin routes gated by `requireAdminPermission(...)`.

### Config — client markup profiles
| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/api/admin/pricing` | pricing-rules:read | List profiles |
| POST | `/api/admin/pricing` | pricing-rules:create | Create profile |
| PATCH | `/api/admin/pricing/:id` | pricing-rules:update | Update profile |
| DELETE | `/api/admin/pricing/:id` | pricing-rules:delete | Delete profile |
| GET/POST | `/api/admin/pricing/:id/tiers` | read / update | Value-based margin tiers |
| PATCH/DELETE | `/api/admin/pricing/tiers/:tierId` | update | Edit/remove value tier |
| GET/POST | `/api/admin/pricing/:id/ddp-tiers` | read / update | DDP markup tiers |
| PATCH/DELETE | `/api/admin/pricing/ddp-tiers/:tierId` | update | Edit/remove DDP tier |

### Config — DDP lanes
| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/api/admin/ddp-pricing` | pricing-rules:read | List lanes |
| POST | `/api/admin/ddp-pricing` | pricing-rules:create | Create lane |
| PATCH | `/api/admin/ddp-pricing/:id` | pricing-rules:update | Update lane |
| DELETE | `/api/admin/ddp-pricing/:id` | pricing-rules:delete | Delete lane |

### Config — local carrier tiers
| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/api/admin/local-pricing` | pricing-rules:read | List tiers |
| POST | `/api/admin/local-pricing` | pricing-rules:create | Create tier |
| PATCH | `/api/admin/local-pricing/:id` | pricing-rules:update | Update tier |
| DELETE | `/api/admin/local-pricing/:id` | pricing-rules:delete | Delete tier |

### Quoting (compute a price)
| Method | Path | Permission | Purpose |
|---|---|---|---|
| POST | `/api/admin/pricing/preview` | pricing-rules:read | Read-only price simulator (Preview tab); no writes, reuses the rate engines |
| POST | `/api/admin/shipping/rates` | shipments:read | Admin rate quote |
| POST | `/api/client/shipments/rates` | client CREATE_SHIPMENTS | Int'l/express quote |
| POST | `/api/client/local/rates` | client CREATE_SHIPMENTS | Local KSA quote |
| GET | `/api/client/ddp/lanes` | client CREATE_SHIPMENTS | Available DDP lanes |
| POST | `/api/client/ddp/rates` | client CREATE_SHIPMENTS | DDP quote (full breakdown) |
| POST | `/api/client/ddp/checkout` | client CREATE_SHIPMENTS | Book DDP at quoted price |
| GET | `/api/client/orders/:id/rates` | client CREATE_SHIPMENTS | Rates for an order |

### Post-quote adjustments
| Method | Path | Permission | Purpose |
|---|---|---|---|
| POST | `/api/operations/shipments/:id/charges/extra-weight[/preview]` | operations:update | Extra-weight surcharge |
| POST | `/api/admin/ddp/shipments/:id/charges` | shipments:update | Add DDP charges |
| PATCH | `/api/admin/financial-statements/shipments/:id/extra-fees` | shipments:update | Set extra fees |
| POST | `/api/admin/shipments/:id/abandoned-recovery/discount` | shipments:update | Recovery discount |

---

## 5. Worked examples (incl. 15% VAT)

### Local — SMSA, 3 kg, Regular
- Tier: SMSA `0–5 kg`, markup `+20%`, min charge `25 SAR`.
- Base (live) = `30.00`. Markup = `30 × 0.20 = 6.00`. `36.00 ≥ 25` floor not hit.
- VAT = `36.00 × 0.15 = 5.40` (domestic, full).
- **Client total = 41.40 SAR.**

### International express — DHL, VIP
- Base (live carrier) = `420.00`. VIP profile margin = `18%` (no higher tier hit).
- Markup = `420 × 0.18 = 75.60`. finalPrice = `495.60`.
- Export scenario → margin-only VAT = `75.60 × 0.15 = 11.34`.
- **Client total = 506.94 SAR.**

### DDP — China → KSA, air, 12 kg chargeable, Regular (DDP 40%)
- Lane air rate = `42.00 /kg`. Billable (min 1 kg, round 0.5) = `12.0`.
- Subtotal = `12 × 42 = 504.00`. `504 ≥ 350` min charge not hit → base = `504.00`.
- DDP markup = `504 × 0.40 = 201.60`. total ex-VAT = `705.60`.
- Margin-only VAT = `201.60 × 0.15 = 30.24`.
- **Client total = 735.84 SAR.**

---

## 6. Where admins configure this

Consolidated under a single **Pricing** page (`/admin/pricing`) with tabs:
**Client Markup** (profiles + value/DDP tiers), **Local Carriers**, **DDP Lanes**, and a
read-only **Preview** simulator. See `docs/pricing-simplification-plan.md` and the
prototype at `docs/pricing-prototype.html`.
