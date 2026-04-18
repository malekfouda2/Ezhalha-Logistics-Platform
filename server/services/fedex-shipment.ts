import path from "path";
import { z } from "zod";
import {
  FEDEX_TRADE_DOCUMENT_ALLOWED_CONTENT_TYPES,
  FEDEX_TRADE_DOCUMENT_MAX_FILES,
  shipmentTradeDocumentSchema,
  type Shipment,
  type ShipmentTradeDocument,
} from "@shared/schema";
import {
  CarrierError,
  type CreateShipmentRequest,
  type ShipmentItem,
  type TradeDocumentUploadRequest,
  type TradeDocumentUploadResponse,
} from "../integrations/fedex";
import { ObjectStorageService } from "../integrations/storage";
import { LocalStorageService } from "../integrations/storage/localStorage";

const storedTradeDocumentsSchema = z
  .array(shipmentTradeDocumentSchema)
  .max(FEDEX_TRADE_DOCUMENT_MAX_FILES);

const allowedTradeDocumentContentTypes = new Set(
  FEDEX_TRADE_DOCUMENT_ALLOWED_CONTENT_TYPES.map((contentType) => contentType.toLowerCase()),
);

const localStorageService = new LocalStorageService();
const objectStorageService = new ObjectStorageService();

function isObjectStorageAvailable(): boolean {
  return Boolean(process.env.PRIVATE_OBJECT_DIR && process.env.PUBLIC_OBJECT_SEARCH_PATHS);
}

function normalizeContentType(contentType: string): string {
  return contentType.split(";")[0].trim().toLowerCase();
}

function buildPackages(shipment: Shipment): CreateShipmentRequest["packages"] {
  if (shipment.packagesData) {
    try {
      const parsedPackages = JSON.parse(shipment.packagesData) as Array<{
        weight: number;
        length: number;
        width: number;
        height: number;
      }>;

      return parsedPackages.map((pkg) => ({
        weight: Number(pkg.weight),
        weightUnit: (shipment.weightUnit || "LB") as "LB" | "KG",
        dimensions: {
          length: Number(pkg.length),
          width: Number(pkg.width),
          height: Number(pkg.height),
          unit: (shipment.dimensionUnit || "IN") as "IN" | "CM",
        },
        packageType: shipment.packageType,
      }));
    } catch {
    }
  }

  return [{
    weight: Number(shipment.weight),
    weightUnit: (shipment.weightUnit || "LB") as "LB" | "KG",
    dimensions: shipment.length && shipment.width && shipment.height ? {
      length: Number(shipment.length),
      width: Number(shipment.width),
      height: Number(shipment.height),
      unit: (shipment.dimensionUnit || "IN") as "IN" | "CM",
    } : undefined,
    packageType: shipment.packageType,
  }];
}

function buildItems(shipment: Shipment): ShipmentItem[] {
  if (!shipment.itemsData) {
    return [];
  }

  try {
    const items = JSON.parse(shipment.itemsData) as Array<{
      itemName: string;
      price: number;
      quantity: number;
      hsCode?: string;
      countryOfOrigin?: string;
    }>;

    return items.map((item) => ({
      description: item.itemName,
      hsCode: item.hsCode,
      countryOfOrigin: item.countryOfOrigin || shipment.senderCountry,
      quantity: item.quantity,
      unitPrice: item.price,
      currency: shipment.currency || "SAR",
    }));
  } catch {
    return [];
  }
}

function buildCommoditySummary(items: ShipmentItem[]): {
  commodityDescription?: string;
  declaredValue?: number;
} {
  if (items.length === 0) {
    return {};
  }

  return {
    commodityDescription: items.map((item) => item.description).join(", ").substring(0, 450),
    declaredValue: items.reduce((sum, item) => sum + (Number(item.unitPrice) * item.quantity), 0),
  };
}

export function parseShipmentTradeDocuments(rawValue: string | null | undefined): ShipmentTradeDocument[] {
  if (!rawValue) {
    return [];
  }

  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(rawValue);
  } catch {
    throw new CarrierError(
      "TRADE_DOCUMENT_INVALID",
      "Stored trade document data could not be parsed",
    );
  }

  const parsedDocuments = storedTradeDocumentsSchema.safeParse(parsedValue);
  if (!parsedDocuments.success) {
    throw new CarrierError(
      "TRADE_DOCUMENT_INVALID",
      "Stored trade document data is invalid",
    );
  }

  return parsedDocuments.data;
}

function serializeShipmentTradeDocuments(documents: ShipmentTradeDocument[]): string | null {
  if (documents.length === 0) {
    return null;
  }

  return JSON.stringify(documents);
}

async function readTradeDocumentBuffer(objectPath: string): Promise<Buffer> {
  if (objectPath.startsWith("/uploads/")) {
    const result = await localStorageService.getFile(path.basename(objectPath));
    if (!result) {
      throw new CarrierError(
        "TRADE_DOCUMENT_NOT_FOUND",
        `Trade document file was not found for path ${objectPath}`,
      );
    }
    return result.data;
  }

  if (objectPath.startsWith("/objects/") && isObjectStorageAvailable()) {
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const [data] = await objectFile.download();
    return data;
  }

  throw new CarrierError(
    "TRADE_DOCUMENT_NOT_FOUND",
    `Trade document path is not supported: ${objectPath}`,
  );
}

function validateTradeDocument(document: ShipmentTradeDocument): void {
  const normalizedContentType = normalizeContentType(document.contentType);

  if (!allowedTradeDocumentContentTypes.has(normalizedContentType)) {
    throw new CarrierError(
      "TRADE_DOCUMENT_INVALID",
      `FedEx does not support trade document content type ${document.contentType}`,
    );
  }
}

export async function buildFedExShipmentRequestFromShipment(
  shipment: Shipment,
  tradeDocumentUploader: {
    uploadTradeDocument: (request: TradeDocumentUploadRequest) => Promise<TradeDocumentUploadResponse>;
  },
): Promise<{ carrierRequest: CreateShipmentRequest; tradeDocumentsData: string | null }> {
  const packages = buildPackages(shipment);
  const items = buildItems(shipment);
  const { commodityDescription, declaredValue } = buildCommoditySummary(items);
  const isInternational = shipment.senderCountry !== shipment.recipientCountry;
  const storedTradeDocuments = isInternational
    ? parseShipmentTradeDocuments(shipment.tradeDocumentsData)
    : [];

  const carrierRequest: CreateShipmentRequest = {
    shipper: {
      name: shipment.senderName,
      streetLine1: shipment.senderAddress,
      streetLine2: shipment.senderAddressLine2 || undefined,
      city: shipment.senderCity,
      stateOrProvince: shipment.senderStateOrProvince || "",
      postalCode: shipment.senderPostalCode || "",
      countryCode: shipment.senderCountry,
      phone: shipment.senderPhone,
      email: shipment.senderEmail || undefined,
    },
    recipient: {
      name: shipment.recipientName,
      streetLine1: shipment.recipientAddress,
      streetLine2: shipment.recipientAddressLine2 || undefined,
      city: shipment.recipientCity,
      stateOrProvince: shipment.recipientStateOrProvince || "",
      postalCode: shipment.recipientPostalCode || "",
      countryCode: shipment.recipientCountry,
      phone: shipment.recipientPhone,
      email: shipment.recipientEmail || undefined,
    },
    packages,
    serviceType: shipment.carrierServiceType || shipment.serviceType || "FEDEX_INTERNATIONAL_PRIORITY",
    packagingType: shipment.packageType || "FEDEX_BOX",
    labelFormat: "PDF",
    commodityDescription,
    declaredValue,
    currency: shipment.currency || "SAR",
    items: isInternational && items.length > 0 ? items : undefined,
  };

  if (storedTradeDocuments.length === 0) {
    return {
      carrierRequest,
      tradeDocumentsData: serializeShipmentTradeDocuments(storedTradeDocuments),
    };
  }

  const uploadedTradeDocuments: ShipmentTradeDocument[] = [];

  for (const document of storedTradeDocuments) {
    validateTradeDocument(document);

    let uploadedDocumentId = document.uploadedDocumentId;
    let uploadedAt = document.uploadedAt;

    if (!uploadedDocumentId) {
      const fileBuffer = await readTradeDocumentBuffer(document.objectPath);
      const uploadResponse = await tradeDocumentUploader.uploadTradeDocument({
        fileName: document.fileName,
        contentType: normalizeContentType(document.contentType),
        documentType: document.documentType,
        originCountryCode: shipment.senderCountry,
        destinationCountryCode: shipment.recipientCountry,
        fileBuffer,
      });

      uploadedDocumentId = uploadResponse.documentId;
      uploadedAt = new Date().toISOString();
    }

    uploadedTradeDocuments.push({
      ...document,
      uploadedDocumentId,
      uploadedAt,
    });
  }

  carrierRequest.tradeDocuments = uploadedTradeDocuments.map((document) => ({
    documentType: document.documentType,
    uploadedDocumentId: document.uploadedDocumentId!,
  }));

  return {
    carrierRequest,
    tradeDocumentsData: serializeShipmentTradeDocuments(uploadedTradeDocuments),
  };
}
