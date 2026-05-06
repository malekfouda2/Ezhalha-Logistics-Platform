import { describe, expect, it } from "vitest";
import type { Shipment } from "@shared/schema";
import {
  buildCommercialInvoiceDocument,
  buildCommercialInvoiceFileName,
  buildCommercialInvoiceNumber,
  hasCommercialInvoiceData,
  renderCommercialInvoiceHtml,
  renderCommercialInvoicePdfBuffer,
} from "../server/services/commercial-invoice";

function makeShipment(overrides: Partial<Shipment> = {}): Shipment {
  return {
    id: "shipment-id",
    trackingNumber: "EZH987654321",
    clientAccountId: "client-account-id",
    senderName: "Austin Warehouse",
    senderAddress: "100 Export Way",
    senderAddressLine2: "Suite 10",
    senderCity: "Houston",
    senderStateOrProvince: "Texas",
    senderPostalCode: "77001",
    senderCountry: "US",
    senderPhone: "5551112222",
    senderEmail: "sender@example.com",
    senderShortAddress: null,
    recipientName: "Riyadh Store",
    recipientAddress: "200 Import Road",
    recipientAddressLine2: "Al Falah",
    recipientCity: "Riyadh",
    recipientStateOrProvince: "Riyadh",
    recipientPostalCode: "11564",
    recipientCountry: "SA",
    recipientPhone: "5553334444",
    recipientEmail: "recipient@example.com",
    recipientShortAddress: "RRRD2929",
    weight: "4.50",
    weightUnit: "KG",
    length: "25.00",
    width: "20.00",
    height: "18.00",
    dimensionUnit: "CM",
    dimensions: null,
    packageType: "YOUR_PACKAGING",
    numberOfPackages: 2,
    packagesData: JSON.stringify([{ weight: 4.5, length: 25, width: 20, height: 18 }]),
    shipmentType: "outbound",
    isDdp: false,
    serviceType: "FEDEX_INTERNATIONAL_PRIORITY",
    currency: "USD",
    status: "created",
    baseRate: "100.00",
    marginAmount: "20.00",
    margin: "20.00",
    finalPrice: "120.00",
    accountingCurrency: "SAR",
    taxScenario: "EXPORT",
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
    carrierCode: "FEDEX",
    carrierName: "FedEx",
    carrierServiceType: "FEDEX_INTERNATIONAL_PRIORITY",
    carrierShipmentId: "794811322510",
    carrierTrackingNumber: "794811322510",
    carrierPaymentStatus: "UNPAID",
    carrierPaidAt: null,
    carrierPaymentAmountSar: null,
    carrierPaymentReference: null,
    carrierPaymentNote: null,
    carrierPayoutBatchId: null,
    carrierStatus: "created",
    carrierErrorCode: null,
    carrierErrorMessage: null,
    carrierLastAttemptAt: null,
    carrierAttempts: 1,
    carrierLabelBase64: null,
    carrierLabelMimeType: "application/pdf",
    carrierLabelFormat: "PDF",
    labelUrl: null,
    shipDate: null,
    paymentIntentId: null,
    paymentMethod: "PAY_NOW",
    paymentStatus: "paid",
    itemsData: JSON.stringify([
      {
        itemName: "Wireless Keyboard",
        itemDescription: "Wireless Keyboard",
        category: "electronics",
        material: "plastic",
        countryOfOrigin: "US",
        hsCode: "847160",
        price: 200,
        quantity: 1,
      },
      {
        itemName: "Mouse Pad",
        category: "other",
        countryOfOrigin: "US",
        price: 15.5,
        quantity: 2,
      },
    ]),
    tradeDocumentsData: null,
    estimatedDelivery: null,
    actualDelivery: null,
    createdAt: new Date("2026-05-04T10:00:00.000Z"),
    updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  } as Shipment;
}

describe("commercial invoice service", () => {
  it("builds a stable internal invoice model from shipment items", () => {
    const shipment = makeShipment();
    const document = buildCommercialInvoiceDocument(shipment);

    expect(buildCommercialInvoiceNumber(shipment)).toBe("EZI-CI-EZH987654321");
    expect(buildCommercialInvoiceFileName(shipment)).toBe("ezi-ci-ezh987654321.pdf");
    expect(document.declaredValue).toBe(231);
    expect(document.items).toHaveLength(2);
    expect(document.items[0].hsCode).toBe("847160");
    expect(document.incoterm).toBe("DAP");
  });

  it("reports when a shipment has commercial invoice data", () => {
    expect(hasCommercialInvoiceData(makeShipment())).toBe(true);
    expect(hasCommercialInvoiceData(makeShipment({ itemsData: null }))).toBe(false);
  });

  it("renders printable html and real pdf output", () => {
    const shipment = makeShipment({ carrierCode: "DHL", carrierName: "DHL", carrierServiceType: "P", isDdp: true });
    const html = renderCommercialInvoiceHtml(shipment);
    const pdf = renderCommercialInvoicePdfBuffer(shipment);

    expect(html).toContain("Internal Commercial Invoice");
    expect(html).toContain("DHL");
    expect(html).toContain("EZI-CI-EZH987654321");
    expect(pdf.toString("utf8", 0, 8)).toBe("%PDF-1.4");
    expect(pdf.toString("utf8")).toContain("INTERNAL COMMERCIAL INVOICE");
  });
});
