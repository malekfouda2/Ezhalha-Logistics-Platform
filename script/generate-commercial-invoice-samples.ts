import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Shipment } from "@shared/schema";
import {
  renderCommercialInvoiceHtml,
  renderCommercialInvoicePdfBuffer,
} from "../server/services/commercial-invoice";

function buildBaseShipment(): Shipment {
  return {
    id: "sample-shipment",
    trackingNumber: "EZH-SAMPLE-001",
    clientAccountId: "sample-client",
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
    serviceType: null,
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
    carrierShipmentId: null,
    carrierTrackingNumber: null,
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
    carrierLabelFormat: null,
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
        itemDescription: "Gaming Mouse Pad",
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
  };
}

function writeSampleFiles(shipment: Shipment, prefix: string, outputDir: string) {
  writeFileSync(
    path.join(outputDir, `${prefix}.pdf`),
    renderCommercialInvoicePdfBuffer(shipment),
  );
  writeFileSync(
    path.join(outputDir, `${prefix}.html`),
    renderCommercialInvoiceHtml(shipment),
  );
}

const outputDir = path.resolve("tmp/commercial-invoice-samples");
mkdirSync(outputDir, { recursive: true });

const fedexShipment = {
  ...buildBaseShipment(),
  trackingNumber: "EZH-FEDEX-SAMPLE",
  carrierCode: "FEDEX",
  carrierName: "FedEx",
  carrierServiceType: "FEDEX_INTERNATIONAL_PRIORITY",
} satisfies Shipment;

const dhlShipment = {
  ...buildBaseShipment(),
  trackingNumber: "EZH-DHL-SAMPLE",
  carrierCode: "DHL",
  carrierName: "DHL",
  carrierServiceType: "P",
  isDdp: true,
} satisfies Shipment;

writeSampleFiles(fedexShipment, "fedex-commercial-invoice-sample", outputDir);
writeSampleFiles(dhlShipment, "dhl-commercial-invoice-sample", outputDir);

console.log(outputDir);
