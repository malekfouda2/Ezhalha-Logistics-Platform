import { afterEach, describe, expect, it } from "vitest";
import XLSX from "xlsx";
import { LocalStorageService } from "../server/integrations/storage/localStorage";
import { extractInvoiceItemsFromDocument } from "../server/services/invoice-extraction";

const localStorageService = new LocalStorageService();
const createdFiles: string[] = [];

async function createUploadedInvoice(fileName: string, buffer: Buffer) {
  const reserved = await localStorageService.reserveFile(fileName);
  await localStorageService.writeFile(reserved.fileName, buffer);
  createdFiles.push(reserved.fileName);
  return reserved;
}

afterEach(async () => {
  while (createdFiles.length > 0) {
    const fileName = createdFiles.pop();
    if (fileName) {
      await localStorageService.cleanupFile(fileName);
    }
  }
});

describe("Invoice Extraction", () => {
  it("extracts shipment items from an XLSX invoice", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Item Description", "Qty", "Unit Price", "Amount", "Origin", "Currency"],
      ["Phone Charger", 3, 25, 75, "CN", "USD"],
      ["Wireless Headset", 1, 180, 180, "CN", "USD"],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Invoice");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const uploaded = await createUploadedInvoice("invoice.xlsx", buffer);

    const result = await extractInvoiceItemsFromDocument(
      {
        fileName: "invoice.xlsx",
        objectPath: uploaded.objectPath,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      {
        fallbackCountryOfOrigin: "US",
        fallbackCurrency: "SAR",
      },
    );

    expect(result.items).toHaveLength(2);
    expect(result.items[0].itemName).toBe("Phone Charger");
    expect(result.items[0].quantity).toBe(3);
    expect(result.items[0].price).toBe(25);
    expect(result.items[0].currency).toBe("USD");
    expect(result.items[0].countryOfOrigin).toBe("CN");
    expect(result.extractionMethod).toBe("deterministic");
  });
});
