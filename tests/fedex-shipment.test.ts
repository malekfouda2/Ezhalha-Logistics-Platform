import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import type { Shipment } from "@shared/schema";
import { CarrierError } from "../server/integrations/fedex";
import {
  buildFedExShipmentRequestFromShipment,
  parseShipmentTradeDocuments,
} from "../server/services/fedex-shipment";

const createdUploadPaths = new Set<string>();

function makeShipment(overrides: Partial<Shipment> = {}): Shipment {
  return {
    id: "shipment-id",
    trackingNumber: "EZH123456789",
    clientAccountId: "client-account-id",
    senderName: "Sender",
    senderAddress: "100 Export Way",
    senderAddressLine2: null,
    senderCity: "Houston",
    senderStateOrProvince: "Texas",
    senderPostalCode: "77001",
    senderCountry: "US",
    senderPhone: "5551112222",
    senderEmail: "sender@example.com",
    senderShortAddress: null,
    recipientName: "Recipient",
    recipientAddress: "200 Import Road",
    recipientAddressLine2: null,
    recipientCity: "Riyadh",
    recipientStateOrProvince: null,
    recipientPostalCode: "11564",
    recipientCountry: "SA",
    recipientPhone: "5553334444",
    recipientEmail: "recipient@example.com",
    recipientShortAddress: null,
    weight: "2.00",
    weightUnit: "KG",
    length: "20.00",
    width: "15.00",
    height: "10.00",
    dimensionUnit: "CM",
    dimensions: null,
    packageType: "YOUR_PACKAGING",
    numberOfPackages: 1,
    packagesData: JSON.stringify([{ weight: 2, length: 20, width: 15, height: 10 }]),
    shipmentType: "outbound",
    isDdp: false,
    serviceType: "FEDEX_INTERNATIONAL_PRIORITY",
    currency: "SAR",
    status: "payment_pending",
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
    carrierPayoutBatchId: null,
    carrierStatus: "pending",
    carrierErrorCode: null,
    carrierErrorMessage: null,
    carrierLastAttemptAt: null,
    carrierAttempts: 0,
    carrierLabelBase64: null,
    carrierLabelMimeType: "application/pdf",
    carrierLabelFormat: null,
    labelUrl: null,
    shipDate: null,
    paymentIntentId: null,
    paymentMethod: "PAY_NOW",
    paymentStatus: "pending",
    itemsData: JSON.stringify([{
      itemName: "Wireless Keyboard",
      price: 200,
      quantity: 1,
      hsCode: "847160",
      countryOfOrigin: "US",
    }]),
    tradeDocumentsData: null,
    estimatedDelivery: null,
    actualDelivery: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as Shipment;
}

async function createLocalTradeDocument(fileName: string, content: string): Promise<string> {
  const uploadDir = path.resolve("uploads");
  await mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, fileName);
  await writeFile(filePath, content);
  createdUploadPaths.add(filePath);
  return `/uploads/${fileName}`;
}

afterEach(async () => {
  await Promise.all(Array.from(createdUploadPaths).map(async (filePath) => {
    await rm(filePath, { force: true });
  }));
  createdUploadPaths.clear();
  vi.restoreAllMocks();
});

describe("FedEx Shipment Builder", () => {
  it("parses empty trade documents as an empty list", () => {
    expect(parseShipmentTradeDocuments(null)).toEqual([]);
    expect(parseShipmentTradeDocuments(undefined)).toEqual([]);
  });

  it("rejects malformed stored trade document JSON", () => {
    expect(() => parseShipmentTradeDocuments("{not-json")).toThrowError(CarrierError);
    expect(() => parseShipmentTradeDocuments("{not-json")).toThrow(
      "Stored trade document data could not be parsed",
    );
  });

  it("ignores stored trade documents for domestic shipments", async () => {
    const uploader = {
      uploadTradeDocument: vi.fn(),
    };

    const shipment = makeShipment({
      shipmentType: "domestic",
      senderCountry: "SA",
      recipientCountry: "SA",
      tradeDocumentsData: "{bad-json-that-should-be-ignored}",
    });

    const result = await buildFedExShipmentRequestFromShipment(shipment, uploader);

    expect(result.tradeDocumentsData).toBeNull();
    expect(result.carrierRequest.tradeDocuments).toBeUndefined();
    expect(uploader.uploadTradeDocument).not.toHaveBeenCalled();
  });

  it("reuses existing uploaded document ids without re-uploading", async () => {
    const uploader = {
      uploadTradeDocument: vi.fn(),
    };

    const shipment = makeShipment({
      tradeDocumentsData: JSON.stringify([{
        fileName: "commercial-invoice.pdf",
        objectPath: "/uploads/commercial-invoice.pdf",
        contentType: "application/pdf",
        size: 128,
        documentType: "COMMERCIAL_INVOICE",
        uploadedDocumentId: "doc-existing-123",
        uploadedAt: "2026-04-14T10:00:00.000Z",
      }]),
    });

    const result = await buildFedExShipmentRequestFromShipment(shipment, uploader);

    expect(uploader.uploadTradeDocument).not.toHaveBeenCalled();
    expect(result.carrierRequest.tradeDocuments).toEqual([
      {
        documentType: "COMMERCIAL_INVOICE",
        uploadedDocumentId: "doc-existing-123",
      },
    ]);
    expect(result.tradeDocumentsData).toContain("doc-existing-123");
  });

  it("uploads missing local trade documents and stores returned doc ids", async () => {
    const objectPath = await createLocalTradeDocument(
      "trade-upload.pdf",
      "%PDF-1.4 unit test trade document",
    );
    const uploader = {
      uploadTradeDocument: vi.fn().mockResolvedValue({
        documentId: "doc-new-456",
        fileName: "trade-upload.pdf",
        documentType: "COMMERCIAL_INVOICE",
      }),
    };

    const shipment = makeShipment({
      tradeDocumentsData: JSON.stringify([{
        fileName: "trade-upload.pdf",
        objectPath,
        contentType: "application/pdf",
        size: 32,
        documentType: "COMMERCIAL_INVOICE",
      }]),
    });

    const result = await buildFedExShipmentRequestFromShipment(shipment, uploader);

    expect(uploader.uploadTradeDocument).toHaveBeenCalledTimes(1);
    expect(uploader.uploadTradeDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "trade-upload.pdf",
        contentType: "application/pdf",
        documentType: "COMMERCIAL_INVOICE",
        originCountryCode: "US",
        destinationCountryCode: "SA",
        fileBuffer: expect.any(Buffer),
      }),
    );
    expect(result.carrierRequest.tradeDocuments).toEqual([
      {
        documentType: "COMMERCIAL_INVOICE",
        uploadedDocumentId: "doc-new-456",
      },
    ]);
    expect(result.tradeDocumentsData).toContain("doc-new-456");
  });

  it("rejects stored trade documents with unsupported content types", async () => {
    const shipment = makeShipment({
      tradeDocumentsData: JSON.stringify([{
        fileName: "malware.exe",
        objectPath: "/uploads/malware.exe",
        contentType: "application/octet-stream",
        size: 32,
        documentType: "COMMERCIAL_INVOICE",
      }]),
    });

    await expect(
      buildFedExShipmentRequestFromShipment(shipment, {
        uploadTradeDocument: vi.fn(),
      }),
    ).rejects.toThrow("Stored trade document data is invalid");
  });

  it("rejects missing local trade document files", async () => {
    const shipment = makeShipment({
      tradeDocumentsData: JSON.stringify([{
        fileName: "missing.pdf",
        objectPath: "/uploads/missing.pdf",
        contentType: "application/pdf",
        size: 32,
        documentType: "COMMERCIAL_INVOICE",
      }]),
    });

    await expect(
      buildFedExShipmentRequestFromShipment(shipment, {
        uploadTradeDocument: vi.fn(),
      }),
    ).rejects.toThrow("Trade document file was not found for path /uploads/missing.pdf");
  });
});
