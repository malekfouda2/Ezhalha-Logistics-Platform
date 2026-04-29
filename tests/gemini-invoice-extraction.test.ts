import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractInvoiceItemsWithGemini } from "../server/services/gemini-invoice-extraction";

describe("Gemini Invoice Extraction", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GEMINI_INVOICE_EXTRACTION_MODEL = "gemini-2.5-flash-lite";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      items: [
                        {
                          itemName: "Wireless Keyboard",
                          itemDescription: "Wireless Keyboard",
                          category: "electronics",
                          material: "",
                          countryOfOrigin: "CN",
                          hsCode: "",
                          price: 125,
                          currency: "USD",
                          quantity: 2,
                        },
                      ],
                      warnings: ["Review the quantity if the invoice is ambiguous."],
                      detectedCurrency: "USD",
                    }),
                  },
                ],
              },
            },
          ],
        }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_INVOICE_EXTRACTION_MODEL;
  });

  it("extracts invoice items from image input with Gemini structured output", async () => {
    const result = await extractInvoiceItemsWithGemini({
      document: {
        fileName: "invoice.jpg",
        objectPath: "/uploads/invoice.jpg",
        contentType: "image/jpeg",
      },
      buffer: Buffer.from([1, 2, 3]),
      fallbackCountryOfOrigin: "US",
      fallbackCurrency: "SAR",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].itemName).toBe("Wireless Keyboard");
    expect(result.items[0].countryOfOrigin).toBe("CN");
    expect(result.items[0].currency).toBe("USD");
    expect(result.warnings).toContain("Review the quantity if the invoice is ambiguous.");

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("models/gemini-2.5-flash-lite:generateContent");
    const payload = JSON.parse(String(requestInit?.body));
    expect(payload.generationConfig.responseMimeType).toBe("application/json");
    expect(payload.contents[0].parts[1].inline_data.mime_type).toBe("image/jpeg");
  });
});
