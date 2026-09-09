import { apiRequest } from "@/api/client";
import { Address, CustomsItem, PackageItem, TradeDocument } from "@/store/createExpressShipmentStore";
import { DgDocument, DgDraftPackage, DgShipmentDirection } from "@/store/createDangerousGoodsStore";
import { DgRegulationValue, DgContentKindValue } from "@shared/dangerous-goods";

export interface DangerousGoodsExtractionCommodity {
  unNumber: string;
  properShippingName?: string;
  technicalName?: string;
  hazardClass: string;
  packingGroup?: string;
  packingInstruction?: string;
  missingFields: string[];
}

export interface DangerousGoodsExtractionResponse {
  commodities: DangerousGoodsExtractionCommodity[];
  productName: string;
  notDangerousGoods: boolean;
  warnings: string[];
}

export async function extractDangerousGoods(payload: {
  fileName: string;
  objectPath: string;
  contentType: string;
}) {
  return apiRequest<DangerousGoodsExtractionResponse>(
    "/api/client/shipments/extract-dangerous-goods",
    { method: "POST", body: payload },
  );
}

export interface DangerousGoodsSubmitPayload {
  shipmentType: DgShipmentDirection;
  shipper: Address;
  recipient: Address;
  packages: Array<Pick<PackageItem, "weight" | "length" | "width" | "height">>;
  weightUnit: "LB" | "KG";
  dimensionUnit: "IN" | "CM";
  packageType: string;
  currency: string;
  items: CustomsItem[];
  tradeDocuments: TradeDocument[];
  dangerousGoods: {
    regulation: DgRegulationValue;
    contentKind: DgContentKindValue;
    dryIceWeightKg?: number;
    packages: DgDraftPackage[];
  };
  dangerousGoodsDocuments: DgDocument[];
  preferredPickupDate?: string;
  specialInstructions?: string;
}

export interface DangerousGoodsSubmitResponse {
  shipmentId: string;
  trackingNumber: string;
  status: string;
}

export async function submitDangerousGoodsShipment(
  payload: DangerousGoodsSubmitPayload,
  idempotencyKey: string,
) {
  return apiRequest<DangerousGoodsSubmitResponse>("/api/client/shipments/dangerous-goods", {
    method: "POST",
    body: payload,
    idempotencyKey,
  });
}

// Idempotency keys only need to be unique per submission attempt, not cryptographically
// random, so a lightweight RFC4122-shaped v4 avoids pulling in an expo-crypto dependency.
export function generateIdempotencyKey(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
