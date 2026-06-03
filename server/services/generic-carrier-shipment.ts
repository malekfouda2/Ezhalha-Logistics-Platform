import { type Shipment } from "@shared/schema";
import { type CreateShipmentRequest, type ShipmentItem } from "../integrations/fedex";
import { buildCommercialInvoiceDocument } from "./commercial-invoice";

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
        weightUnit: (shipment.weightUnit || "KG") as "LB" | "KG",
        dimensions: {
          length: Number(pkg.length),
          width: Number(pkg.width),
          height: Number(pkg.height),
          unit: (shipment.dimensionUnit || "CM") as "IN" | "CM",
        },
        packageType: shipment.packageType,
      }));
    } catch {
      // Fall back to primary package fields.
    }
  }

  return [
    {
      weight: Number(shipment.weight),
      weightUnit: (shipment.weightUnit || "KG") as "LB" | "KG",
      dimensions:
        shipment.length && shipment.width && shipment.height
          ? {
              length: Number(shipment.length),
              width: Number(shipment.width),
              height: Number(shipment.height),
              unit: (shipment.dimensionUnit || "CM") as "IN" | "CM",
            }
          : undefined,
      packageType: shipment.packageType,
    },
  ];
}

function buildItems(shipment: Shipment): ShipmentItem[] | undefined {
  if (!shipment.itemsData) {
    return undefined;
  }

  try {
    const items = JSON.parse(shipment.itemsData) as Array<{
      itemName: string;
      itemDescription?: string;
      category?: string;
      material?: string;
      price: number;
      quantity: number;
      hsCode?: string;
      hsCodeCandidates?: Array<{ code: string; description: string; confidence: number }>;
      countryOfOrigin?: string;
    }>;

    return items.map((item) => ({
      description: item.itemDescription || item.itemName,
      hsCode: item.hsCode || item.hsCodeCandidates?.[0]?.code,
      category: item.category,
      material: item.material,
      countryOfOrigin: item.countryOfOrigin || shipment.senderCountry,
      quantity: item.quantity,
      unitPrice: item.price,
      currency: shipment.currency || "SAR",
    }));
  } catch {
    return undefined;
  }
}

function buildCommoditySummary(items?: ShipmentItem[]) {
  if (!items || items.length === 0) {
    return {};
  }

  return {
    commodityDescription: items.map((item) => item.description).join(", ").slice(0, 150),
    declaredValue: items.reduce(
      (sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0),
      0,
    ),
  };
}

export async function buildGenericCarrierShipmentRequestFromShipment(
  shipment: Shipment,
): Promise<{ carrierRequest: CreateShipmentRequest; tradeDocumentsData: string | null }> {
  const packages = buildPackages(shipment);
  const items = buildItems(shipment);
  const { commodityDescription, declaredValue } = buildCommoditySummary(items);
  const isInternational = shipment.senderCountry !== shipment.recipientCountry;
  const internalCommercialInvoice = buildCommercialInvoiceDocument(shipment);

  return {
    carrierRequest: {
      shipper: {
        name: shipment.senderName,
        streetLine1: shipment.senderAddress,
        streetLine2: shipment.senderAddressLine2 || undefined,
        streetLine3: shipment.senderShortAddress || undefined,
        city: shipment.senderCity,
        stateOrProvince: shipment.senderStateOrProvince || undefined,
        postalCode: shipment.senderPostalCode || "",
        countryCode: shipment.senderCountry,
        phone: shipment.senderPhone,
        email: shipment.senderEmail || undefined,
      },
      recipient: {
        name: shipment.recipientName,
        streetLine1: shipment.recipientAddress,
        streetLine2: shipment.recipientAddressLine2 || undefined,
        streetLine3: shipment.recipientShortAddress || undefined,
        city: shipment.recipientCity,
        stateOrProvince: shipment.recipientStateOrProvince || undefined,
        postalCode: shipment.recipientPostalCode || "",
        countryCode: shipment.recipientCountry,
        phone: shipment.recipientPhone,
        email: shipment.recipientEmail || undefined,
      },
      packages,
      serviceType: shipment.carrierServiceType || shipment.serviceType || (isInternational ? "PPX" : "ONP"),
      packagingType: shipment.packageType || "YOUR_PACKAGING",
      labelFormat: "PDF",
      commodityDescription,
      declaredValue,
      currency: shipment.currency || "SAR",
      shipDate: shipment.shipDate || undefined,
      commercialInvoiceNumber: internalCommercialInvoice.invoiceNumber,
      commercialInvoiceDate: internalCommercialInvoice.issueDate,
      incoterm: shipment.isDdp ? "DDP" : "DAP",
      items,
    },
    tradeDocumentsData: shipment.tradeDocumentsData ?? null,
  };
}
