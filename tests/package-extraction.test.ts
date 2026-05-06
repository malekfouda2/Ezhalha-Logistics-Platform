import { afterEach, describe, expect, it } from "vitest";
import XLSX from "xlsx";
import { LocalStorageService } from "../server/integrations/storage/localStorage";
import { extractPackageDetailsFromDocument } from "../server/services/package-extraction";

const localStorage = new LocalStorageService();
const createdFiles: string[] = [];

async function writeUploadWorkbook(fileName: string, rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "packing list");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  await localStorage.writeFile(fileName, buffer);
  createdFiles.push(fileName);
}

afterEach(async () => {
  await Promise.all(createdFiles.splice(0).map((fileName) => localStorage.cleanupFile(fileName)));
});

describe("extractPackageDetailsFromDocument", () => {
  it("extracts unique cartons from a packing list workbook and converts meter dimensions to centimeters", async () => {
    const fileName = "packing-list-sample.xlsx";
    await writeUploadWorkbook(fileName, [
      ["Packing List"],
      ["Vendor/Shipper", "", "", "", "", "Purchaser/Consignee"],
      [
        "Shipping Mark",
        "HS Code",
        "Item Name",
        "Decription of goods",
        "颜色",
        "CARTON NO",
        "",
        "",
        "S",
        "M",
        "L",
        "XL",
        "2XL",
        "CARTON QTY.",
        "Quqantity",
        "NET WEIGHT",
        "TOTAL G.W",
        "CARTONS SIZE",
        "",
        "",
        "CBM",
      ],
      ["", "50莱赛尔50棉", "OLI-10", "", "BLACK", "1", "-", "1", "", "", "30", "18", "10", "1", "58", "25.2", "26.2", "0.60", "0.35", "0.4", "0.084"],
      ["", "", "", "", "BLACK", "2", "-", "2", "20", "30", "10", "", "", "1", "60", "23.8", "24.8", "0.60", "0.35", "0.4", "0.084"],
      ["", "", "", "", "BLACK", "3", "-", "3", "7", "12", "", "8", "5", "1", "32", "23.1", "24.1", "0.60", "0.35", "0.4", "0.084"],
      ["", "", "", "", "GRAY", "3", "-", "3", "", "", "", "", "10", "", "10", "", "", "", "", "", ""],
    ]);

    const result = await extractPackageDetailsFromDocument({
      fileName,
      objectPath: `/uploads/${fileName}`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    expect(result.extractionMethod).toBe("deterministic");
    expect(result.detectedWeightUnit).toBe("KG");
    expect(result.detectedDimensionUnit).toBe("CM");
    expect(result.packages).toHaveLength(3);
    expect(result.packages[0]).toMatchObject({
      packageNumber: "1",
      weight: 26.2,
      length: 60,
      width: 35,
      height: 40,
    });
    expect(result.packages[2]).toMatchObject({
      packageNumber: "3",
      weight: 24.1,
      length: 60,
      width: 35,
      height: 40,
    });
  });

  it("expands carton ranges into one package per carton", async () => {
    const fileName = "packing-list-range.xlsx";
    await writeUploadWorkbook(fileName, [
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
      ["", "10", "-", "12", "3", "10", "40", "30", "20"],
    ]);

    const result = await extractPackageDetailsFromDocument({
      fileName,
      objectPath: `/uploads/${fileName}`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    expect(result.packages).toHaveLength(3);
    expect(result.packages.map((pkg) => pkg.packageNumber)).toEqual(["10", "11", "12"]);
    expect(result.packages.every((pkg) => pkg.weight === 10)).toBe(true);
    expect(result.packages.every((pkg) => pkg.length === 40)).toBe(true);
    expect(result.packages.every((pkg) => pkg.width === 30)).toBe(true);
    expect(result.packages.every((pkg) => pkg.height === 20)).toBe(true);
  });
});
