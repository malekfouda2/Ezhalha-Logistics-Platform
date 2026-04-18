import { describe, expect, it } from "vitest";
import type { Shipment } from "@shared/schema";
import { buildDhlShipmentRequestFromShipment } from "../server/services/dhl-shipment";

function buildShipment(overrides: Partial<Shipment> = {}): Shipment {
  return {
    id: "shipment-1",
    trackingNumber: "EZH123456789",
    clientAccountId: "client-1",
    senderName: "Origin Sender",
    senderAddress: "100 Export Way",
    senderAddressLine2: "Suite 10",
    senderShortAddress: "RCTB4359",
    senderCity: "Riyadh",
    senderStateOrProvince: "Riyadh",
    senderPostalCode: "11564",
    senderCountry: "SA",
    senderPhone: "5551112222",
    senderEmail: "origin@example.com",
    recipientName: "Import Recipient",
    recipientAddress: "200 Import Road",
    recipientAddressLine2: null,
    recipientShortAddress: null,
    recipientCity: "Dubai",
    recipientStateOrProvince: "Dubai",
    recipientPostalCode: "00000",
    recipientCountry: "AE",
    recipientPhone: "5553334444",
    recipientEmail: "recipient@example.com",
    weight: "2.00",
    weightUnit: "KG",
    length: "20",
    width: "15",
    height: "10",
    dimensionUnit: "CM",
    packageType: "YOUR_PACKAGING",
    numberOfPackages: 1,
    packagesData: JSON.stringify([{ weight: 2, length: 20, width: 15, height: 10 }]),
    itemsData: JSON.stringify([
      {
        itemName: "Wireless Keyboard",
        price: 200,
        quantity: 1,
        hsCode: "847160",
        countryOfOrigin: "SA",
      },
    ]),
    tradeDocumentsData: null,
    shipmentType: "inbound",
    isDdp: true,
    serviceType: null,
    carrierCode: "DHL",
    carrierName: "DHL",
    carrierServiceType: "P",
    carrierTrackingNumber: null,
    carrierShipmentId: null,
    carrierStatus: null,
    carrierErrorCode: null,
    carrierErrorMessage: null,
    carrierAttempts: 0,
    carrierLastAttemptAt: null,
    currency: "SAR",
    accountingCurrency: "SAR",
    taxScenario: "DDP",
    baseRate: "100.00",
    marginAmount: "20.00",
    margin: "20.00",
    finalPrice: "120.00",
    costAmountSar: "100.00",
    costTaxAmountSar: "0.00",
    sellSubtotalAmountSar: "120.00",
    sellTaxAmountSar: "2.61",
    clientTotalAmountSar: "120.00",
    systemCostTotalAmountSar: "100.00",
    taxPayableAmountSar: "2.61",
    revenueExcludingTaxAmountSar: "117.39",
    extraFeesAmountSar: null,
    extraFeesType: null,
    extraFeesWeightValue: null,
    extraFeesCostAmountSar: null,
    extraFeesAddedAt: null,
    extraFeesEmailSentAt: null,
    carrierPaymentStatus: "UNPAID",
    carrierPaymentBatchId: null,
    carrierPaymentAmountSar: null,
    carrierPaymentReference: null,
    carrierPaymentNote: null,
    carrierPaidAt: null,
    shipDate: null,
    paymentIntentId: null,
    paymentMethod: "PAY_NOW",
    paymentStatus: "pending",
    estimatedDelivery: null,
    actualDelivery: null,
    labelUrl: null,
    carrierLabelBase64: null,
    carrierLabelMimeType: "application/pdf",
    carrierLabelFormat: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe("DHL Shipment Builder", () => {
  it("should build a DDP shipment request with short-address support", async () => {
    const shipment = buildShipment();

    const result = await buildDhlShipmentRequestFromShipment(shipment);

    expect(result.tradeDocumentsData).toBeNull();
    expect(result.carrierRequest.serviceType).toBe("P");
    expect(result.carrierRequest.incoterm).toBe("DDP");
    expect(result.carrierRequest.shipper.streetLine3).toBe("RCTB4359");
    expect(result.carrierRequest.recipient.countryCode).toBe("AE");
    expect(result.carrierRequest.items?.[0].hsCode).toBe("847160");
    expect(result.carrierRequest.declaredValue).toBe(200);
  });

  it("should default to domestic DHL product code for same-country shipments", async () => {
    const shipment = buildShipment({
      senderCountry: "SA",
      recipientCountry: "SA",
      isDdp: false,
      carrierServiceType: null,
      itemsData: null,
    });

    const result = await buildDhlShipmentRequestFromShipment(shipment);

    expect(result.carrierRequest.serviceType).toBe("N");
    expect(result.carrierRequest.incoterm).toBe("DAP");
    expect(result.carrierRequest.items).toBeUndefined();
  });
});
