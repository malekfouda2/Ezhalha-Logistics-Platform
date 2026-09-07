/**
 * The manual, ops-quoted dangerous goods flow.
 *
 * A dangerous goods shipment is not priced by a carrier API. Carriage is agreed with DHL or
 * FedEx over email — a person sends the declaration, a person replies with a price — so the
 * client submits an unpriced declaration and an operator carries it the rest of the way.
 *
 * This module holds the three pieces of that work which are pure functions of the shipment:
 * what is still missing before a carrier can be asked, what to put in the email, and what to
 * charge once the carrier answers.
 */

import {
  DANGEROUS_GOODS_QUOTE_DEFAULT_VALIDITY_DAYS,
  summarizeDangerousGoods,
  DgAccessibility,
  type DangerousGoodsDraftDeclaration,
} from "@shared/dangerous-goods";
import { isPostalCodeRequired } from "@shared/postal-codes";
import type { DangerousGoodsDocument, Shipment } from "@shared/schema";

export interface DangerousGoodsMissingField {
  /** Dot-path into the ops edit payload, so the panel can highlight the exact input. */
  field: string;
  label: string;
  /** Why the carrier needs it — shown under the field, not just "required". */
  reason: string;
}

function blank(value?: string | null): boolean {
  return !String(value ?? "").trim();
}

function numericBlank(value?: string | number | null): boolean {
  const n = Number(value ?? 0);
  return !Number.isFinite(n) || n <= 0;
}

function parseJsonArray(raw?: string | null): any[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Everything a carrier will ask for that this shipment does not yet have.
 *
 * Deliberately stricter than the client wizard's own validation. The wizard is a form the
 * client fills in; this is the check an operator makes on their behalf before putting a
 * declaration in front of DHL, where a missing technical name or an absent emergency phone
 * comes back as a rejection days later rather than a red field immediately.
 *
 * Returning an empty array is the gate on the handover stage — an operator cannot mark a
 * shipment sent to the carrier while anything here is outstanding.
 */
export function dangerousGoodsMissingFields(
  shipment: Shipment,
  declaration: DangerousGoodsDraftDeclaration | null,
): DangerousGoodsMissingField[] {
  const missing: DangerousGoodsMissingField[] = [];
  const isInternational = shipment.senderCountry !== shipment.recipientCountry;

  const address = (
    side: "sender" | "recipient",
    label: string,
    values: {
      name?: string | null;
      address?: string | null;
      city?: string | null;
      country?: string | null;
      phone?: string | null;
      postalCode?: string | null;
    },
  ) => {
    if (blank(values.name)) missing.push({ field: `${side}.name`, label: `${label} name`, reason: "The carrier books against a named party." });
    if (blank(values.address)) missing.push({ field: `${side}.address`, label: `${label} street address`, reason: "Required on the air waybill." });
    if (blank(values.city)) missing.push({ field: `${side}.city`, label: `${label} city`, reason: "Required on the air waybill." });
    if (blank(values.country)) missing.push({ field: `${side}.country`, label: `${label} country`, reason: "Determines which dangerous goods rules apply." });
    if (blank(values.phone)) missing.push({ field: `${side}.phone`, label: `${label} phone`, reason: "Carriers refuse a dangerous goods booking without a contactable party at each end." });
    // Only where the country actually uses them. Asking for one in Lebanon or the UAE is how
    // "00000" ends up on an air waybill and the collection fails.
    if (isPostalCodeRequired(values.country) && blank(values.postalCode)) {
      missing.push({ field: `${side}.postalCode`, label: `${label} postal code`, reason: "This country uses postal codes and the carrier validates them." });
    }
  };

  address("sender", "Shipper", {
    name: shipment.senderName,
    address: shipment.senderAddress,
    city: shipment.senderCity,
    country: shipment.senderCountry,
    phone: shipment.senderPhone,
    postalCode: shipment.senderPostalCode,
  });
  address("recipient", "Consignee", {
    name: shipment.recipientName,
    address: shipment.recipientAddress,
    city: shipment.recipientCity,
    country: shipment.recipientCountry,
    phone: shipment.recipientPhone,
    postalCode: shipment.recipientPostalCode,
  });

  if (numericBlank(shipment.weight)) {
    missing.push({ field: "weight", label: "Total weight", reason: "The carrier prices dangerous goods by weight and package count." });
  }

  const packages = parseJsonArray(shipment.packagesData);
  if (packages.length === 0) {
    missing.push({ field: "packages", label: "Package dimensions", reason: "Each piece has to be listed with its dimensions for a dangerous goods acceptance check." });
  } else {
    packages.forEach((pkg, index) => {
      if (numericBlank(pkg?.weight)) {
        missing.push({ field: `packages.${index}.weight`, label: `Package ${index + 1} weight`, reason: "Net quantity per package drives the packing instruction." });
      }
      if (numericBlank(pkg?.length) || numericBlank(pkg?.width) || numericBlank(pkg?.height)) {
        missing.push({ field: `packages.${index}.dimensions`, label: `Package ${index + 1} dimensions`, reason: "Required for the carrier's acceptance check." });
      }
    });
  }

  if (isInternational && parseJsonArray(shipment.itemsData).length === 0) {
    missing.push({ field: "items", label: "Customs line items", reason: "An international shipment needs a commercial invoice before it can be tendered." });
  }

  if (!declaration) {
    missing.push({ field: "declaration", label: "Dangerous goods declaration", reason: "The stored declaration is missing or unreadable — it has to be re-entered before the carrier sees it." });
    return missing;
  }

  if (!declaration.accessibility) {
    missing.push({ field: "declaration.accessibility", label: "Accessibility", reason: "The carrier stows accessible and inaccessible dangerous goods differently, and must be told which this is." });
  }
  if (blank(declaration.offeror)) {
    missing.push({ field: "declaration.offeror", label: "Offeror", reason: "The party offering the goods for transport is named on the Shipper's Declaration." });
  }
  if (blank(declaration.emergencyContact?.name) || blank(declaration.emergencyContact?.phone)) {
    missing.push({ field: "declaration.emergencyContact", label: "24-hour emergency contact", reason: "IATA requires a number answered around the clock while the goods are in transit." });
  }
  if (blank(declaration.signatory?.name) || blank(declaration.signatory?.place)) {
    missing.push({ field: "declaration.signatory", label: "Signatory name and place", reason: "The declaration is a signed legal document and cannot be filed unsigned." });
  }

  declaration.packages.forEach((pkg, pkgIndex) => {
    pkg.commodities.forEach((commodity, commodityIndex) => {
      const path = `declaration.packages.${pkgIndex}.commodities.${commodityIndex}`;
      if (blank(commodity.unNumber)) {
        missing.push({ field: `${path}.unNumber`, label: `UN number (package ${pkgIndex + 1}, item ${commodityIndex + 1})`, reason: "Identifies the substance to every authority along the route." });
      }
      if (blank(commodity.hazardClass)) {
        missing.push({ field: `${path}.hazardClass`, label: `Hazard class (package ${pkgIndex + 1}, item ${commodityIndex + 1})`, reason: "Decides the label, the stowage and whether the aircraft can carry it at all." });
      }
      if (!commodity.packingGroup) {
        missing.push({ field: `${path}.packingGroup`, label: `Packing group (package ${pkgIndex + 1}, item ${commodityIndex + 1})`, reason: "Sets the packaging standard the goods must already be in." });
      }
      if (blank(commodity.properShippingName)) {
        missing.push({ field: `${path}.properShippingName`, label: `Proper shipping name (package ${pkgIndex + 1}, item ${commodityIndex + 1})`, reason: "Must match the IATA entry exactly, not a trade name." });
      }
      // An n.o.s. entry names a category, not a substance. Without the technical name the
      // carrier rejects it at acceptance, after the goods have already been collected.
      if (/n\.o\.s\./i.test(commodity.properShippingName || "") && blank(commodity.technicalName)) {
        missing.push({ field: `${path}.technicalName`, label: `Technical name (package ${pkgIndex + 1}, item ${commodityIndex + 1})`, reason: "An n.o.s. shipping name is not a legal declaration without the actual substance named." });
      }
      if (numericBlank(commodity.quantity?.amount) || blank(commodity.quantity?.units)) {
        missing.push({ field: `${path}.quantity`, label: `Net quantity (package ${pkgIndex + 1}, item ${commodityIndex + 1})`, reason: "The carrier checks the net quantity against the packing instruction limit." });
      }
    });
  });

  return missing;
}

function formatQuantity(quantity?: { amount?: number; units?: string }): string {
  if (!quantity?.amount) return "not stated";
  return `${quantity.amount} ${quantity.units || ""}`.trim();
}

/**
 * The text an operator pastes into the email to DHL or FedEx.
 *
 * One block, everything the carrier asks for, in the order they ask for it. This exists
 * because the alternative — an operator copying eleven fields out of four panels — is how a
 * technical name gets left out of the email and the shipment is refused at acceptance.
 */
export function buildCarrierHandoverText(
  shipment: Shipment,
  declaration: DangerousGoodsDraftDeclaration | null,
  documents: DangerousGoodsDocument[],
): string {
  const lines: string[] = [];
  const packages = parseJsonArray(shipment.packagesData);
  const dimensionUnit = shipment.dimensionUnit || "CM";
  const weightUnit = shipment.weightUnit || "KG";

  lines.push(`Dangerous goods enquiry — ${shipment.trackingNumber}`);
  lines.push("");
  lines.push("SHIPPER");
  lines.push(`  ${shipment.senderName}${shipment.senderCompany ? ` (${shipment.senderCompany})` : ""}`);
  lines.push(`  ${[shipment.senderAddress, shipment.senderAddressLine2].filter(Boolean).join(", ")}`);
  lines.push(`  ${[shipment.senderCity, shipment.senderStateOrProvince, shipment.senderPostalCode, shipment.senderCountry].filter(Boolean).join(", ")}`);
  lines.push(`  Tel ${shipment.senderPhone}${shipment.senderEmail ? ` · ${shipment.senderEmail}` : ""}`);
  lines.push("");
  lines.push("CONSIGNEE");
  lines.push(`  ${shipment.recipientName}${shipment.recipientCompany ? ` (${shipment.recipientCompany})` : ""}`);
  lines.push(`  ${[shipment.recipientAddress, shipment.recipientAddressLine2].filter(Boolean).join(", ")}`);
  lines.push(`  ${[shipment.recipientCity, shipment.recipientStateOrProvince, shipment.recipientPostalCode, shipment.recipientCountry].filter(Boolean).join(", ")}`);
  lines.push(`  Tel ${shipment.recipientPhone}${shipment.recipientEmail ? ` · ${shipment.recipientEmail}` : ""}`);
  lines.push("");
  lines.push("PACKAGES");
  lines.push(`  Total weight ${shipment.weight} ${weightUnit} across ${packages.length || shipment.numberOfPackages || 1} piece(s)`);
  packages.forEach((pkg, index) => {
    lines.push(`  ${index + 1}. ${pkg?.weight ?? "?"} ${weightUnit} · ${pkg?.length ?? "?"}×${pkg?.width ?? "?"}×${pkg?.height ?? "?"} ${dimensionUnit}`);
  });

  if (declaration) {
    lines.push("");
    lines.push("DECLARATION");
    lines.push(`  Regulation: ${declaration.regulation}`);
    lines.push(`  Content type: ${declaration.contentKind}`);
    lines.push(`  Accessibility: ${declaration.accessibility || "not stated"}`);
    lines.push(`  Offeror: ${declaration.offeror || "not stated"}`);
    lines.push(`  Emergency contact: ${[declaration.emergencyContact?.name, declaration.emergencyContact?.phone].filter(Boolean).join(", ") || "not stated"}${declaration.emergencyContact?.contractNumber ? ` (contract ${declaration.emergencyContact.contractNumber})` : ""}`);
    lines.push(`  Signatory: ${[declaration.signatory?.name, declaration.signatory?.title].filter(Boolean).join(", ") || "not stated"}${declaration.signatory?.place ? ` — ${declaration.signatory.place}` : ""}`);
    if (declaration.dryIceWeightKg) {
      lines.push(`  Dry ice: ${declaration.dryIceWeightKg} kg net`);
    }
    lines.push("");
    lines.push("COMMODITIES");
    declaration.packages.forEach((pkg) => {
      lines.push(`  Package ${pkg.packageIndex + 1}${pkg.containerType ? ` · ${pkg.containerType}` : ""}${pkg.numberOfContainers ? ` × ${pkg.numberOfContainers}` : ""}`);
      pkg.commodities.forEach((commodity) => {
        const risks = commodity.subsidiaryRisks?.length ? ` (sub-risk ${commodity.subsidiaryRisks.join(", ")})` : "";
        const technical = commodity.technicalName ? ` [${commodity.technicalName}]` : "";
        const instruction = commodity.packingInstruction ? ` · PI ${commodity.packingInstruction}` : "";
        const cao = commodity.cargoAircraftOnly ? " · CARGO AIRCRAFT ONLY" : "";
        const name = [commodity.unNumber, commodity.properShippingName].filter(Boolean).join(" ") || "not yet classified";
        lines.push(`    ${name}${technical} · class ${commodity.hazardClass || "?"}${risks} · PG ${commodity.packingGroup || "?"} · ${formatQuantity(commodity.quantity)}${instruction}${cao}`);
      });
    });
  }

  if (documents.length > 0) {
    lines.push("");
    lines.push("ATTACHED");
    documents.forEach((document) => {
      lines.push(`  ${document.documentType}: ${document.fileName}`);
    });
  }

  if (shipment.dgPreferredPickupDate) {
    lines.push("");
    lines.push(`COLLECTION AGREED: ${shipment.dgPreferredPickupDate}`);
  }

  lines.push("");
  // Three questions, because all three are things only the carrier can answer and all three
  // are needed before the client can be quoted: will you take it, what does it cost, and when
  // can you collect it.
  lines.push("Please confirm acceptance, the all-in charge for this movement, and the earliest");
  lines.push("date you can collect.");

  return lines.join("\n");
}

/** Default expiry for a quote an operator enters without naming one. */
export function defaultDangerousGoodsQuoteExpiry(from: Date = new Date()): Date {
  const expiry = new Date(from);
  expiry.setDate(expiry.getDate() + DANGEROUS_GOODS_QUOTE_DEFAULT_VALIDITY_DAYS);
  return expiry;
}

/** One-line description of the declaration, for audit entries and ops list rows. */
export function describeDangerousGoodsShipment(declaration: DangerousGoodsDraftDeclaration | null): string {
  return declaration ? summarizeDangerousGoods(declaration) : "Dangerous goods declaration unavailable";
}
