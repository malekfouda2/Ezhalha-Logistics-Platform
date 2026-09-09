import {
  dangerousGoodsDeclarationSchema,
  dangerousGoodsDraftDeclarationSchema,
  type Shipment,
} from "@shared/schema";
import type {
  DangerousGoodsDeclaration,
  DangerousGoodsDraftDeclaration,
} from "@shared/dangerous-goods";

/**
 * Read a stored dangerous goods declaration back off a shipment, complete or not.
 *
 * Most declarations in the system are INCOMPLETE for most of their life. A client submits a
 * content kind and a safety data sheet; operations fills in the emergency contact, the
 * signatory and the net quantities before the carrier ever sees it. So this parses the draft
 * shape, which the full shape satisfies too — a complete declaration parses here unchanged.
 *
 * Never throws. The declaration drives operator review and audit text; a shipment whose JSON
 * somehow failed to parse must still open in the ops hub rather than take the page down. It
 * returns null in that case, and the handover gate then refuses to send the shipment to a
 * carrier — which is the safe direction to fail.
 */
export function parseDangerousGoodsDeclaration(
  raw?: string | null,
): DangerousGoodsDraftDeclaration | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = dangerousGoodsDraftDeclarationSchema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as DangerousGoodsDraftDeclaration) : null;
  } catch {
    return null;
  }
}

/**
 * The same declaration, but only if it is complete enough to put on a carrier request.
 *
 * Deliberately strict where the reader above is lenient. A draft missing its emergency contact
 * is perfectly fine sitting in an operator's queue and completely unacceptable on a Shipper's
 * Declaration, so the two callers get two different answers from two different schemas rather
 * than sharing one and hoping.
 */
export function parseCompleteDangerousGoodsDeclaration(
  raw?: string | null,
): DangerousGoodsDeclaration | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = dangerousGoodsDeclarationSchema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as DangerousGoodsDeclaration) : null;
  } catch {
    return null;
  }
}

/**
 * The declaration to send to the carrier for this shipment, if it carries regulated goods.
 *
 * Returns undefined for a draft. That is what stops a half-finished declaration reaching an
 * airline: the carrier guard refuses to book a dangerous goods shipment it cannot describe.
 */
export function shipmentDangerousGoods(shipment: Shipment): DangerousGoodsDeclaration | undefined {
  if (!shipment.hasDangerousGoods) return undefined;
  return parseCompleteDangerousGoodsDeclaration(shipment.dangerousGoodsData) || undefined;
}
