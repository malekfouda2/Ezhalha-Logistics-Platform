// Dangerous goods: domain model and carrier code resolution.
//
// Deliberately dependency-free, same rule as `shared/domain.ts` — no drizzle, no zod, no
// server imports — so it is safe to bundle into the React Native app. The Zod validation
// schema lives in `shared/schema.ts` next to `shipmentTradeDocumentSchema`, which is where
// every other request-shape validator already lives.
//
// Ezhalha books DG on its own carrier accounts, which makes Ezhalha the shipper of record
// and the signatory on the Shipper's Declaration. Everything here is therefore written to
// fail loudly and early rather than to guess: an unresolvable commodity must stop the quote,
// never quietly ship as general cargo.

/** Regulation set a declaration is made under. */
export const DgRegulation = {
  IATA: "IATA",
  ADR: "ADR",
} as const;

export type DgRegulationValue = (typeof DgRegulation)[keyof typeof DgRegulation];

/**
 * IATA packing group. NONE covers entries that genuinely have no packing group (class 2
 * gases, class 7 radioactive, and the lithium-battery entries) — it is a real value, not a
 * missing one, so it must round-trip rather than be normalised away.
 */
export const DgPackingGroup = {
  I: "I",
  II: "II",
  III: "III",
  NONE: "NONE",
} as const;

export type DgPackingGroupValue = (typeof DgPackingGroup)[keyof typeof DgPackingGroup];

/**
 * Whether the package must remain reachable in flight. Drives a materially different carrier
 * surcharge and a different aircraft loading rule, so it is declared, never inferred.
 */
export const DgAccessibility = {
  ACCESSIBLE: "ACCESSIBLE",
  INACCESSIBLE: "INACCESSIBLE",
} as const;

export type DgAccessibilityValue = (typeof DgAccessibility)[keyof typeof DgAccessibility];

export const DgQuantityType = {
  GROSS: "GROSS",
  NET: "NET",
} as const;

export type DgQuantityTypeValue = (typeof DgQuantityType)[keyof typeof DgQuantityType];

/**
 * Review state of a DG shipment.
 *
 * `PENDING_REVIEW` is the whole point of the feature: a paid DG shipment stops here and is
 * NOT booked with the carrier until an operator has read the declaration. `NOT_APPLICABLE`
 * is what every non-DG shipment carries so the column is never null-ambiguous.
 */
export const DangerousGoodsStatus = {
  NOT_APPLICABLE: "not_applicable",
  PENDING_REVIEW: "pending_review",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export type DangerousGoodsStatusValue =
  (typeof DangerousGoodsStatus)[keyof typeof DangerousGoodsStatus];

/**
 * The DG content kinds DHL recognises. This is not a taxonomy we invented — each value maps
 * to exactly one (serviceCode, contentId) pair DHL approves per account, so the client picks
 * a kind and the carrier codes follow.
 */
export const DgContentKind = {
  LITHIUM_ION_PI965_SECTION_II: "LITHIUM_ION_PI965_SECTION_II",
  LITHIUM_ION_PI966_SECTION_II: "LITHIUM_ION_PI966_SECTION_II",
  LITHIUM_ION_PI967_SECTION_II: "LITHIUM_ION_PI967_SECTION_II",
  LITHIUM_METAL_PI969_SECTION_II: "LITHIUM_METAL_PI969_SECTION_II",
  LITHIUM_METAL_PI970_SECTION_II: "LITHIUM_METAL_PI970_SECTION_II",
  LITHIUM_FULLY_REGULATED: "LITHIUM_FULLY_REGULATED",
  BIOLOGICAL_SUBSTANCE_UN3373: "BIOLOGICAL_SUBSTANCE_UN3373",
  GENETICALLY_MODIFIED_ORGANISMS: "GENETICALLY_MODIFIED_ORGANISMS",
  LIMITED_QUANTITIES_ADR: "LIMITED_QUANTITIES_ADR",
  EXCEPTED_QUANTITIES_IATA: "EXCEPTED_QUANTITIES_IATA",
  CONSUMER_COMMODITY_ID8000: "CONSUMER_COMMODITY_ID8000",
  MAGNETIZED_MATERIAL_UN2807: "MAGNETIZED_MATERIAL_UN2807",
  PRESSURIZED_ARTICLES_UN3164: "PRESSURIZED_ARTICLES_UN3164",
  EXEMPT_SPECIMENS: "EXEMPT_SPECIMENS",
  ADR_LOAD_EXEMPTION: "ADR_LOAD_EXEMPTION",
  DRY_ICE_UN1845: "DRY_ICE_UN1845",
  FULLY_REGULATED: "FULLY_REGULATED",
} as const;

export type DgContentKindValue = (typeof DgContentKind)[keyof typeof DgContentKind];

// ---------------------------------------------------------------------------
// Declaration shape
// ---------------------------------------------------------------------------

export interface DgQuantity {
  amount: number;
  /** Unit as printed on the declaration: "KG", "L", "G", "ML".  */
  units: string;
  quantityType: DgQuantityTypeValue;
}

export interface DgInnerReceptacle {
  quantity: DgQuantity;
}

/** One hazardous commodity as it appears on the Shipper's Declaration. */
export interface DangerousGoodsCommodity {
  /** "UN1234" or "ID8000". Stored with the prefix so it prints exactly as declared. */
  unNumber: string;
  properShippingName: string;
  /** Only required when the proper shipping name is a generic ("n.o.s.") entry. */
  technicalName?: string;
  /** Primary hazard class or division, e.g. "3", "4.1", "9". */
  hazardClass: string;
  subsidiaryRisks?: string[];
  packingGroup: DgPackingGroupValue;
  /** IATA packing instruction, e.g. "965", "Y341". */
  packingInstruction?: string;
  quantity: DgQuantity;
  innerReceptacles?: DgInnerReceptacle[];
  /** True when the entry is forbidden on passenger aircraft (CAO). */
  cargoAircraftOnly?: boolean;
}

/** DG content of one package, addressed by its index in `shipments.packagesData`. */
export interface DangerousGoodsPackage {
  packageIndex: number;
  /** Free text as printed, e.g. "Fibreboard box". */
  containerType?: string;
  numberOfContainers?: number;
  /** Set when several commodities share one outer package. */
  packingOption?: "ALL_PACKED_IN_ONE";
  commodities: DangerousGoodsCommodity[];
}

export interface DgEmergencyContact {
  name: string;
  /** Full international format; printed on the declaration and sent to FedEx verbatim. */
  phone: string;
  /** Emergency response contract number (e.g. CHEMTREC), when the destination requires one. */
  contractNumber?: string;
}

export interface DgSignatory {
  name: string;
  title?: string;
  place: string;
}

export interface DangerousGoodsDeclaration {
  regulation: DgRegulationValue;
  /** The DHL content kind; also selects the FedEx simplified path where one exists. */
  contentKind: DgContentKindValue;
  accessibility: DgAccessibilityValue;
  /** Party offering the goods for transport. Ezhalha unless the client is the named offeror. */
  offeror: string;
  emergencyContact: DgEmergencyContact;
  signatory: DgSignatory;
  packages: DangerousGoodsPackage[];
  /** Net dry ice weight in KG. Required for UN1845, ignored otherwise. */
  dryIceWeightKg?: number;
  /** Set when the client accepted the DG terms; the shipment cannot book without it. */
  termsAcceptedAt?: string;
  /**
   * DHL content id when it could not be resolved statically. DHL assigns fully-regulated
   * content ids per account contract, so for those kinds the id has to be supplied rather
   * than derived. See `resolveDhlDangerousGoodsCodes`.
   */
  dhlContentIdOverride?: string;
}

/**
 * A declaration as the CLIENT submits it — incomplete by design.
 *
 * The client picks what they are shipping and uploads a safety data sheet. That is all they
 * are asked for, because everything else on a Shipper's Declaration is either something an
 * SDS does not state (net quantity per package) or something only the offeror of record can
 * answer (the 24-hour emergency contact, the signatory). Asking a shipper to fill a blank
 * IATA form is what makes dangerous goods hard, and a form filled in wrongly is worse than
 * one not filled in at all — it reads as authoritative right up until the carrier refuses the
 * consignment at acceptance.
 *
 * So operations completes it. `dangerousGoodsMissingFields` names every gap, and the handover
 * gate refuses to send anything to a carrier while one remains. A draft never reaches a
 * carrier payload: `shipmentDangerousGoods` parses strictly and returns nothing for a draft.
 */
export interface DangerousGoodsDraftCommodity {
  unNumber?: string;
  properShippingName?: string;
  technicalName?: string;
  hazardClass?: string;
  subsidiaryRisks?: string[];
  packingGroup?: DgPackingGroupValue;
  packingInstruction?: string;
  quantity?: Partial<DgQuantity>;
  innerReceptacles?: DgInnerReceptacle[];
  cargoAircraftOnly?: boolean;
}

export interface DangerousGoodsDraftPackage {
  packageIndex: number;
  containerType?: string;
  numberOfContainers?: number;
  packingOption?: "ALL_PACKED_IN_ONE";
  commodities: DangerousGoodsDraftCommodity[];
}

export interface DangerousGoodsDraftDeclaration {
  regulation: DgRegulationValue;
  contentKind: DgContentKindValue;
  accessibility?: DgAccessibilityValue;
  offeror?: string;
  emergencyContact?: Partial<DgEmergencyContact>;
  signatory?: Partial<DgSignatory>;
  packages: DangerousGoodsDraftPackage[];
  dryIceWeightKg?: number;
  termsAcceptedAt?: string;
  dhlContentIdOverride?: string;
}

// ---------------------------------------------------------------------------
// DHL
// ---------------------------------------------------------------------------

export interface DhlDgCodeEntry {
  serviceCode: string;
  /**
   * Null where DHL assigns the id per account contract rather than globally. Those kinds
   * require `dhlContentIdOverride` or the account's configured id — see the resolver.
   */
  contentId: string | null;
  label: string;
  /**
   * False for kinds DHL currently does not accept through MyDHL API even on an approved
   * account. Kept in the table rather than omitted so the resolver can return a specific
   * "not supported by DHL" message instead of a bare unknown-kind error.
   */
  supported: boolean;
}

/**
 * DHL Express DG service codes and content ids.
 *
 * Confirm this table against the account's own DHL contract before enabling DG in
 * production: approval is granted per (serviceCode, contentId) pair, and an unapproved pair
 * is not rejected at the API — the shipment is stopped later at the DHL facility, after the
 * client has already paid.
 */
export const DHL_DG_CODE_TABLE: Record<DgContentKindValue, DhlDgCodeEntry> = {
  [DgContentKind.LITHIUM_ION_PI965_SECTION_II]:
    { serviceCode: "HB", contentId: "965", label: "Lithium ion batteries, PI965 Section II", supported: true },
  [DgContentKind.LITHIUM_ION_PI966_SECTION_II]:
    { serviceCode: "HD", contentId: "966", label: "Lithium ion batteries packed with equipment, PI966 Section II", supported: true },
  [DgContentKind.LITHIUM_ION_PI967_SECTION_II]:
    { serviceCode: "HV", contentId: "967", label: "Lithium ion batteries contained in equipment, PI967 Section II", supported: true },
  [DgContentKind.LITHIUM_METAL_PI969_SECTION_II]:
    { serviceCode: "HM", contentId: "969", label: "Lithium metal batteries packed with equipment, PI969 Section II", supported: true },
  [DgContentKind.LITHIUM_METAL_PI970_SECTION_II]:
    { serviceCode: "HW", contentId: "970", label: "Lithium metal batteries contained in equipment, PI970 Section II", supported: true },
  [DgContentKind.LITHIUM_FULLY_REGULATED]:
    { serviceCode: "HE", contentId: "911", label: "Fully regulated lithium batteries (Section IA/IB)", supported: true },
  [DgContentKind.BIOLOGICAL_SUBSTANCE_UN3373]:
    { serviceCode: "HY", contentId: "650", label: "Biological substance Category B, UN3373", supported: true },
  [DgContentKind.GENETICALLY_MODIFIED_ORGANISMS]:
    { serviceCode: "HY", contentId: "651", label: "Genetically modified organisms, UN3245", supported: true },
  [DgContentKind.LIMITED_QUANTITIES_ADR]:
    { serviceCode: "HL", contentId: "A01", label: "Limited quantities (ADR)", supported: true },
  [DgContentKind.CONSUMER_COMMODITY_ID8000]:
    { serviceCode: "HK", contentId: "700", label: "Consumer commodity ID8000", supported: true },
  [DgContentKind.MAGNETIZED_MATERIAL_UN2807]:
    { serviceCode: "HX", contentId: "HT1", label: "Magnetized material, UN2807", supported: true },
  [DgContentKind.PRESSURIZED_ARTICLES_UN3164]:
    { serviceCode: "HU", contentId: "HU1", label: "Pressurized articles, UN3164", supported: true },
  [DgContentKind.EXEMPT_SPECIMENS]:
    { serviceCode: "HU", contentId: "HU3", label: "Exempt human or animal specimens", supported: true },
  [DgContentKind.ADR_LOAD_EXEMPTION]:
    { serviceCode: "HN", contentId: "A02", label: "ADR load exemption", supported: true },
  [DgContentKind.FULLY_REGULATED]:
    { serviceCode: "HE", contentId: null, label: "Fully regulated dangerous goods (IATA)", supported: true },
  [DgContentKind.EXCEPTED_QUANTITIES_IATA]:
    { serviceCode: "HH", contentId: "E01", label: "Excepted quantities (IATA)", supported: false },
  [DgContentKind.DRY_ICE_UN1845]:
    { serviceCode: "HC", contentId: "901", label: "Dry ice, UN1845", supported: false },
};

export interface DhlDangerousGoodsCodes {
  serviceCode: string;
  contentId: string;
}

/**
 * Thrown when a declaration cannot be turned into carrier instructions. Typed so the routes
 * can map it to a 400 with the message intact rather than a generic 500 — the client needs
 * to know exactly which part of their declaration the carrier will not take.
 */
export class DangerousGoodsResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DangerousGoodsResolutionError";
  }
}

/** Thrown by adapters whose carrier has no way to carry a DG declaration at all. */
export class DangerousGoodsUnsupportedError extends Error {
  constructor(carrierName: string) {
    super(`${carrierName} cannot accept dangerous goods shipments.`);
    this.name = "DangerousGoodsUnsupportedError";
  }
}

/**
 * Resolve a declaration to DHL's (serviceCode, contentId).
 *
 * `configuredContentIds` carries the ids DHL assigned to this specific account, read from
 * the integration account settings — they take precedence over the static table because the
 * contract, not the published table, is what DHL actually validates against.
 *
 * DHL accepts exactly one content id per shipment, so a declaration mixing kinds cannot be
 * booked and must be split. That constraint is enforced upstream by the Zod schema (one
 * `contentKind` per declaration); this function is the second line of defence.
 */
export function resolveDhlDangerousGoodsCodes(
  declaration: DangerousGoodsDeclaration,
  configuredContentIds?: Partial<Record<DgContentKindValue, string>> | null,
): DhlDangerousGoodsCodes {
  const entry = DHL_DG_CODE_TABLE[declaration.contentKind];
  if (!entry) {
    throw new DangerousGoodsResolutionError(
      `Unknown dangerous goods content kind "${declaration.contentKind}".`,
    );
  }
  if (!entry.supported) {
    throw new DangerousGoodsResolutionError(
      `DHL does not accept ${entry.label} through the API. Contact operations to arrange this shipment.`,
    );
  }

  const contentId = configuredContentIds?.[declaration.contentKind]
    || declaration.dhlContentIdOverride
    || entry.contentId;

  if (!contentId) {
    throw new DangerousGoodsResolutionError(
      `DHL assigns the content id for ${entry.label} per account. Set it on the DHL integration account before quoting this shipment.`,
    );
  }

  return { serviceCode: entry.serviceCode, contentId };
}

// ---------------------------------------------------------------------------
// FedEx
// ---------------------------------------------------------------------------

export interface FedexHazardousCommodity {
  description: {
    id: string;
    sequenceNumber: number;
    packingGroup?: string;
    properShippingName: string;
    technicalName?: string;
    hazardClass: string;
    subsidiaryClasses?: string[];
    packingDetails?: {
      packingInstructions?: string;
      cargoAircraftOnly?: boolean;
    };
  };
  quantity: {
    amount: number;
    units: string;
    quantityType: DgQuantityTypeValue;
  };
  innerReceptacles?: Array<{
    quantity: { amount: number; units: string; quantityType: DgQuantityTypeValue };
  }>;
}

export interface FedexDangerousGoodsDetail {
  offeror: string;
  accessibility: DgAccessibilityValue;
  emergencyContactNumber: string;
  regulation: DgRegulationValue;
  packingOption?: "ALL_PACKED_IN_ONE";
  containers: Array<{
    containerType?: string;
    numberOfContainers: number;
    packingType?: "ALL_PACKED_IN_ONE";
    hazardousCommodities: FedexHazardousCommodity[];
  }>;
}

/**
 * Build FedEx's `packageSpecialServices.dangerousGoodsDetail` for one package.
 *
 * FedEx nests commodities inside containers; a package with no declared container still
 * needs one, so a single implicit container is emitted rather than an empty array (FedEx
 * rejects the latter).
 *
 * Returns null when the package carries no DG, which is the normal case for a multi-package
 * shipment where only some boxes are regulated.
 */
export function resolveFedexDangerousGoodsDetail(
  declaration: DangerousGoodsDeclaration,
  packageIndex: number,
): FedexDangerousGoodsDetail | null {
  const pkg = declaration.packages.find((entry) => entry.packageIndex === packageIndex);
  if (!pkg || pkg.commodities.length === 0) return null;

  const hazardousCommodities: FedexHazardousCommodity[] = pkg.commodities.map((commodity, index) => ({
    description: {
      id: commodity.unNumber,
      sequenceNumber: index + 1,
      // FedEx rejects the literal "NONE"; an entry with no packing group omits the field.
      packingGroup: commodity.packingGroup === DgPackingGroup.NONE ? undefined : commodity.packingGroup,
      properShippingName: commodity.properShippingName,
      technicalName: commodity.technicalName,
      hazardClass: commodity.hazardClass,
      subsidiaryClasses: commodity.subsidiaryRisks?.length ? commodity.subsidiaryRisks : undefined,
      packingDetails: {
        packingInstructions: commodity.packingInstruction,
        cargoAircraftOnly: commodity.cargoAircraftOnly ?? false,
      },
    },
    quantity: {
      amount: commodity.quantity.amount,
      units: commodity.quantity.units,
      quantityType: commodity.quantity.quantityType,
    },
    innerReceptacles: commodity.innerReceptacles?.length
      ? commodity.innerReceptacles.map((receptacle) => ({ quantity: receptacle.quantity }))
      : undefined,
  }));

  return {
    offeror: declaration.offeror,
    accessibility: declaration.accessibility,
    emergencyContactNumber: declaration.emergencyContact.phone,
    regulation: declaration.regulation,
    packingOption: pkg.packingOption,
    containers: [{
      containerType: pkg.containerType,
      numberOfContainers: pkg.numberOfContainers ?? 1,
      packingType: pkg.packingOption,
      hazardousCommodities,
    }],
  };
}

/** True when the declaration is dry ice, which rides a separate FedEx field. */
export function isDryIceDeclaration(declaration: DangerousGoodsDeclaration): boolean {
  return declaration.contentKind === DgContentKind.DRY_ICE_UN1845;
}

/** Every package index the declaration covers, for cross-checking against `packagesData`. */
export function declaredPackageIndexes(declaration: DangerousGoodsDeclaration): number[] {
  return declaration.packages.map((pkg) => pkg.packageIndex);
}

/**
 * One-line summary for ops lists, attention flags and audit entries — e.g.
 * "IATA · UN3480 Lithium ion batteries (+1 more) · inaccessible".
 */
export function summarizeDangerousGoods(declaration: {
  regulation: string;
  accessibility?: string;
  packages: Array<{ commodities: Array<{ unNumber?: string; properShippingName?: string }> }>;
}): string {
  const commodities = declaration.packages.flatMap((pkg) => pkg.commodities);
  const first = commodities[0];
  // A draft is summarised too — it is what an operator sees in the queue before anyone has
  // filled it in, so "not yet classified" has to read as a state rather than as a blank.
  const named = [first?.unNumber, first?.properShippingName].filter(Boolean).join(" ");
  const head = named || "not yet classified";
  const rest = commodities.length > 1 ? ` (+${commodities.length - 1} more)` : "";
  const access = declaration.accessibility
    ? declaration.accessibility === DgAccessibility.ACCESSIBLE ? "accessible" : "inaccessible"
    : "accessibility not set";
  return `${declaration.regulation} · ${head}${rest} · ${access}`;
}

// ---------------------------------------------------------------------------
// Compliance documents
// ---------------------------------------------------------------------------

/**
 * DG paperwork, stored separately from `tradeDocumentsData` on purpose.
 *
 * Trade documents are customs paperwork and their `documentType` is passed straight through
 * to FedEx's ETD upload, whose enum has no value for a Shipper's Declaration. Putting DG
 * paperwork in that array would send FedEx an invalid document type and would also consume
 * the 5-file ETD cap. These are compliance evidence for the ops reviewer, not customs
 * documents, so they get their own column.
 */
export const DangerousGoodsDocumentType = {
  SHIPPERS_DECLARATION: "SHIPPERS_DECLARATION",
  SAFETY_DATA_SHEET: "SAFETY_DATA_SHEET",
  PACKING_CERTIFICATE: "PACKING_CERTIFICATE",
  TRAINING_CERTIFICATE: "TRAINING_CERTIFICATE",
  OTHER: "OTHER",
} as const;

export type DangerousGoodsDocumentTypeValue =
  (typeof DangerousGoodsDocumentType)[keyof typeof DangerousGoodsDocumentType];

export const DANGEROUS_GOODS_DOCUMENT_MAX_FILES = 10;

// ---------------------------------------------------------------------------
// The manual, ops-quoted flow
// ---------------------------------------------------------------------------

/**
 * `fulfillmentType` for a dangerous goods shipment that operations prices by hand.
 *
 * Sits beside "ddp_manual" and "local" as a peer discriminator, because it is the same kind
 * of fact: it decides which queue the shipment belongs to, which tasks it gets, and — the
 * part that matters most — that payment must NOT trigger a carrier booking, since the AWB
 * was created by a person outside the system long before the client paid.
 */
export const DG_MANUAL_FULFILLMENT_TYPE = "dg_manual";

/**
 * The three shipment statuses this flow adds, before it rejoins the ordinary lifecycle.
 *
 * `shipments.status` is free text with no database constraint, so these cost nothing to add;
 * what they buy is an honest answer to "where is this shipment?" while it is sitting in an
 * operator's inbox rather than moving. None is terminal.
 *
 * The first two are deliberately *not* "payment_pending": a shipment in either state has no
 * price yet, so showing a client a Pay button would be a lie. The third is the mirror image —
 * the money has arrived and the client has nothing left to do, but no air waybill exists yet
 * because nobody books a consignment they have not been paid for.
 */
export const DangerousGoodsShipmentStatus = {
  /** Submitted by the client, waiting for an operator to check and complete the declaration. */
  REVIEW: "dg_review",
  /** Sent to the carrier by email, waiting for them to come back with a price. */
  AWAITING_CARRIER: "dg_awaiting_carrier",
  /** Paid by the client; an operator now books the movement and records the air waybill. */
  AWAITING_BOOKING: "dg_booking",
} as const;

export type DangerousGoodsShipmentStatusValue =
  (typeof DangerousGoodsShipmentStatus)[keyof typeof DangerousGoodsShipmentStatus];

export const DANGEROUS_GOODS_MANUAL_STATUSES: readonly string[] = [
  DangerousGoodsShipmentStatus.REVIEW,
  DangerousGoodsShipmentStatus.AWAITING_CARRIER,
];

/** True while the shipment is still with operations and carries no price the client can pay. */
export function isDangerousGoodsPreQuoteStatus(status?: string | null): boolean {
  return DANGEROUS_GOODS_MANUAL_STATUSES.includes(String(status || ""));
}

/**
 * True once the client has paid but before an operator has recorded the air waybill.
 *
 * Nothing that reads a carrier tracking number may assume one exists in this state — the
 * tracking poller in particular, which would otherwise ask a carrier about a shipment the
 * carrier has never heard of.
 */
export function isDangerousGoodsAwaitingBooking(status?: string | null): boolean {
  return String(status || "") === DangerousGoodsShipmentStatus.AWAITING_BOOKING;
}

/** How long an ops-entered DG quote is good for by default, in days. */
export const DANGEROUS_GOODS_QUOTE_DEFAULT_VALIDITY_DAYS = 7;
