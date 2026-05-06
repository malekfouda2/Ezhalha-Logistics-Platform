import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import XLSX from "xlsx";
import { LocalStorageService } from "../server/integrations/storage/localStorage";

const mockExtractPackagesWithGemini = vi.fn();
const mockIsGeminiPackageExtractionConfigured = vi.fn();

vi.mock("../server/services/gemini-package-extraction", () => ({
  extractPackagesWithGemini: mockExtractPackagesWithGemini,
  isGeminiPackageExtractionConfigured: mockIsGeminiPackageExtractionConfigured,
}));

const { extractPackageDetailsFromDocument } = await import("../server/services/package-extraction");

const localStorageService = new LocalStorageService();
const createdFiles: string[] = [];

async function createUploadedWorkbook(fileName: string, rows: unknown[][]) {
  const reserved = await localStorageService.reserveFile(fileName);
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "packing list");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  await localStorageService.writeFile(reserved.fileName, buffer);
  createdFiles.push(reserved.fileName);
  return reserved;
}

async function createUploadedImage(fileName: string, buffer: Buffer) {
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

describe("Package Extraction Fallback", () => {
  it("falls back to Gemini for image packing lists when configured", async () => {
    mockIsGeminiPackageExtractionConfigured.mockReturnValue(true);
    mockExtractPackagesWithGemini.mockResolvedValue({
      packages: [
        { packageNumber: "1", weight: 12.5, length: 60, width: 40, height: 35 },
      ],
      warnings: [],
      detectedWeightUnit: "KG",
      detectedDimensionUnit: "CM",
    });

    const uploaded = await createUploadedImage("packing-list.jpg", Buffer.from([1, 2, 3]));

    const result = await extractPackageDetailsFromDocument({
      fileName: "packing-list.jpg",
      objectPath: uploaded.objectPath,
      contentType: "image/jpeg",
    });

    expect(mockExtractPackagesWithGemini).toHaveBeenCalledOnce();
    expect(result.extractionMethod).toBe("gemini");
    expect(result.packages[0].weight).toBe(12.5);
  });

  it("uses Gemini to refine warning-heavy package parsing when enabled", async () => {
    process.env.GEMINI_INVOICE_FALLBACK_ON_WARNING = "true";
    mockIsGeminiPackageExtractionConfigured.mockReturnValue(true);
    mockExtractPackagesWithGemini.mockResolvedValue({
      packages: [
        { packageNumber: "1", weight: 24.8, length: 60, width: 35, height: 40 },
      ],
      warnings: ["AI normalized missing carton dimensions."],
      detectedWeightUnit: "KG",
      detectedDimensionUnit: "CM",
    });

    const uploaded = await createUploadedWorkbook("packing-list.xlsx", [
      ["Packing List"],
      [
        "Shipping Mark",
        "CARTON NO",
        "",
        "",
        "CARTON QTY.",
        "TOTAL G.W",
        "CARTONS SIZE",
        "",
        "",
      ],
      ["", "1", "-", "1", "1", "24.8", "60", "35", "40"],
      ["", "", "", "", "1", "25.3", "", "", ""],
    ]);

    const result = await extractPackageDetailsFromDocument({
      fileName: "packing-list.xlsx",
      objectPath: uploaded.objectPath,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    expect(mockExtractPackagesWithGemini).toHaveBeenCalledOnce();
    expect(result.extractionMethod).toBe("gemini");
    expect(result.warnings.some((warning) => warning.includes("AI extraction was used to improve package parsing"))).toBe(true);
  });
});
