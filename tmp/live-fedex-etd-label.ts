import "../server/load-env";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Shipment } from "@shared/schema";
import { fedexAdapter } from "../server/integrations/fedex";
import { buildFedExShipmentRequestFromShipment } from "../server/services/fedex-shipment";
import { renderCommercialInvoicePdfBuffer } from "../server/services/commercial-invoice";

function buildTestShipment(): Shipment {
  const trackingNumber = `EZHFEDEXETD${Date.now().toString().slice(-8)}`;

  return {
    id: `manual-fedex-etd-${Date.now()}`,
    trackingNumber,
    clientAccountId: "manual-fedex-etd-client",
    senderName: "Origin Sender",
    senderCompanyName: null,
    senderEmail: "origin@example.com",
    senderPhone: "+1 555 111 2222",
    senderCountry: "US",
    senderStateOrProvince: "Texas",
    senderCity: "Houston",
    senderPostalCode: "77001",
    senderAddress: "100 Export Way",
    senderAddressLine2: null,
    senderShortAddress: null,
    recipientName: "Saudi Receiver",
    recipientCompanyName: null,
    recipientEmail: "receiver@example.com",
    recipientPhone: "+966 555 123 456",
    recipientCountry: "SA",
    recipientStateOrProvince: "Riyadh",
    recipientCity: "Riyadh",
    recipientPostalCode: "13314",
    recipientAddress: "3885 Al Bandariyyah Street",
    recipientAddressLine2: "8118 Al Falah",
    recipientShortAddress: "RYFD3885",
    weight: "2",
    dimensions: "20x15x10",
    length: "20",
    width: "15",
    height: "10",
    weightUnit: "KG",
    dimensionUnit: "CM",
    packageType: "FEDEX_10KG_BOX",
    shipmentType: "outbound",
    isDdp: false,
    itemsData: JSON.stringify([
      {
        itemName: "Wireless Keyboard",
        itemDescription: "Wireless Keyboard",
        category: "electronics",
        material: "plastic",
        price: 200,
        quantity: 1,
        hsCode: "847160",
        countryOfOrigin: "US",
      },
      {
        itemName: "USB-C Charger",
        itemDescription: "USB-C Charger",
        category: "electronics",
        material: "plastic",
        price: 50,
        quantity: 1,
        hsCode: "850440",
        countryOfOrigin: "US",
      },
    ]),
    tradeDocumentsData: null,
    packagesData: JSON.stringify([
      {
        weight: 2,
        length: 20,
        width: 15,
        height: 10,
      },
    ]),
    baseRate: "0",
    margin: "0",
    finalPrice: "250",
    currency: "USD",
    serviceType: "FEDEX_INTERNATIONAL_PRIORITY",
    carrierCode: "FEDEX",
    carrierName: "FedEx",
    carrierServiceType: "FEDEX_INTERNATIONAL_PRIORITY",
    carrierTrackingNumber: null,
    status: "payment_pending",
    estimatedDelivery: null,
    actualDelivery: null,
    paymentStatus: "paid",
    paymentMethod: "tap",
    paymentIntentId: null,
    labelUrl: null,
    carrierLabelBase64: null,
    carrierLabelMimeType: "application/pdf",
    carrierLabelFormat: "PDF",
    carrierStatus: null,
    carrierRawResponse: null,
    carrierErrorCode: null,
    carrierErrorMessage: null,
    carrierLastAttemptAt: null,
    clientPaidAt: null,
    clientPaymentReference: null,
    clientPaymentNotes: null,
    clientPaidByUserId: null,
    clientPaymentStatus: "UNPAID",
    carrierPaidAt: null,
    carrierPaymentReference: null,
    carrierPaymentNotes: null,
    carrierPaidByUserId: null,
    carrierPaymentStatus: "UNPAID",
    clientTotalAmountSar: "250",
    clientSellAmountSar: "250",
    clientSellTaxAmountSar: "0",
    clientSubtotalAmountSar: "250",
    systemCostAmountSar: "250",
    systemCostTaxAmountSar: "0",
    systemCostTotalAmountSar: "250",
    systemNetProfitAmountSar: "0",
    extraFeesAmountSar: null,
    extraFeesType: null,
    extraFeesDescription: null,
    extraFeesAppliedAt: null,
    extraFeesInvoiceId: null,
    extraWeightFeeAmountSar: null,
    extraWeightAmountKg: null,
    extraCostAmountSar: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  } as Shipment;
}

async function main() {
  const shipment = buildTestShipment();
  const prepared = await buildFedExShipmentRequestFromShipment(shipment, fedexAdapter);
  const response = await fedexAdapter.createShipment(prepared.carrierRequest);

  if (!response.labelData) {
    throw new Error("FedEx response did not include labelData");
  }

  const outDir = join(process.cwd(), "tmp", "live-fedex-etd");
  await mkdir(outDir, { recursive: true });

  const labelPath = join(outDir, `fedex-awb-${response.trackingNumber}.pdf`);
  const commercialInvoicePath = join(
    outDir,
    `fedex-etd-commercial-invoice-${shipment.trackingNumber}.pdf`,
  );
  const requestPath = join(outDir, `fedex-etd-request-${response.trackingNumber}.json`);
  const metadataPath = join(outDir, `fedex-etd-metadata-${response.trackingNumber}.json`);

  await writeFile(labelPath, Buffer.from(response.labelData, "base64"));
  await writeFile(commercialInvoicePath, renderCommercialInvoicePdfBuffer(shipment));
  await writeFile(
    requestPath,
    JSON.stringify(
      {
        trackingNumber: shipment.trackingNumber,
        carrierRequest: prepared.carrierRequest,
        tradeDocumentsData: prepared.tradeDocumentsData,
      },
      null,
      2,
    ),
  );
  await writeFile(
    metadataPath,
    JSON.stringify(
      {
        shipmentReference: shipment.trackingNumber,
        fedexTrackingNumber: response.trackingNumber,
        carrierTrackingNumber: response.carrierTrackingNumber,
        serviceType: response.serviceType,
        labelPath,
        commercialInvoicePath,
        requestPath,
        tradeDocumentsData: prepared.tradeDocumentsData
          ? JSON.parse(prepared.tradeDocumentsData)
          : [],
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        shipmentReference: shipment.trackingNumber,
        fedexTrackingNumber: response.trackingNumber,
        labelPath,
        commercialInvoicePath,
        requestPath,
        metadataPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
