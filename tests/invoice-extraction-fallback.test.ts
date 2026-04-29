import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalStorageService } from "../server/integrations/storage/localStorage";

const mockExtractInvoiceItemsWithGemini = vi.fn();
const mockIsGeminiInvoiceExtractionConfigured = vi.fn();

vi.mock("../server/services/gemini-invoice-extraction", () => ({
  extractInvoiceItemsWithGemini: mockExtractInvoiceItemsWithGemini,
  isGeminiInvoiceExtractionConfigured: mockIsGeminiInvoiceExtractionConfigured,
}));

const { extractInvoiceItemsFromDocument } = await import("../server/services/invoice-extraction");

const localStorageService = new LocalStorageService();
const createdFiles: string[] = [];

async function createUploadedInvoice(fileName: string, buffer: Buffer) {
  const reserved = await localStorageService.reserveFile(fileName);
  await localStorageService.writeFile(reserved.fileName, buffer);
  createdFiles.push(reserved.fileName);
  return reserved;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.GEMINI_INVOICE_FALLBACK_ON_WARNING;
});

afterEach(async () => {
  while (createdFiles.length > 0) {
    const fileName = createdFiles.pop();
    if (fileName) {
      await localStorageService.cleanupFile(fileName);
    }
  }
});

describe("Invoice Extraction Fallback", () => {
  it("falls back to Gemini for image invoices when configured", async () => {
    mockIsGeminiInvoiceExtractionConfigured.mockReturnValue(true);
    mockExtractInvoiceItemsWithGemini.mockResolvedValue({
      items: [
        {
          itemName: "Scanned Keyboard",
          itemDescription: "Scanned Keyboard",
          category: "electronics",
          material: "",
          countryOfOrigin: "US",
          hsCode: "",
          hsCodeSource: "UNKNOWN",
          hsCodeConfidence: "MISSING",
          hsCodeCandidates: [],
          price: 125,
          currency: "USD",
          quantity: 2,
        },
      ],
      warnings: [],
      detectedCurrency: "USD",
    });

    const uploaded = await createUploadedInvoice("invoice.jpg", Buffer.from([1, 2, 3]));

    const result = await extractInvoiceItemsFromDocument(
      {
        fileName: "invoice.jpg",
        objectPath: uploaded.objectPath,
        contentType: "image/jpeg",
      },
      {
        fallbackCountryOfOrigin: "US",
        fallbackCurrency: "SAR",
      },
    );

    expect(mockExtractInvoiceItemsWithGemini).toHaveBeenCalledOnce();
    expect(result.extractionMethod).toBe("gemini");
    expect(result.items[0].itemName).toBe("Scanned Keyboard");
  });
});
