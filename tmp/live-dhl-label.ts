import "../server/load-env";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DhlAdapter } from "../server/integrations/dhl";

async function main() {
  const adapter = new DhlAdapter();

  const response = await adapter.createShipment({
    shipper: {
      name: "Egypt Shipper",
      streetLine1: "Mahdy Arafa Street",
      city: "Nasr City",
      stateOrProvince: "Cairo",
      postalCode: "4450113",
      countryCode: "EG",
      phone: "+201226076000",
      email: "shipper@example.com",
    },
    recipient: {
      name: "Saudi Receiver",
      streetLine1: "3885 Al Bandariyyah Street",
      streetLine2: "8118 Al Falah",
      streetLine3: "RYFD3885",
      city: "Riyadh",
      stateOrProvince: "Riyadh",
      postalCode: "13314",
      countryCode: "SA",
      phone: "+966555123456",
      email: "receiver@example.com",
    },
    packages: [
      {
        weight: 1.2,
        weightUnit: "KG",
        dimensions: {
          length: 20,
          width: 15,
          height: 10,
          unit: "CM",
        },
        packageType: "YOUR_PACKAGING",
      },
    ],
    serviceType: "P",
    currency: "USD",
    commodityDescription: "Bambu Lab H2S and Engineering Plate",
    declaredValue: 2158.99,
    commercialInvoiceNumber: "EZI-CI-DHL-LABEL-TEST",
    commercialInvoiceDate: "2026-05-04",
    incoterm: "DAP",
    items: [
      {
        description: "Bambu Lab H2S",
        quantity: 1,
        unitPrice: 2099,
        hsCode: "847759",
        countryOfOrigin: "EG",
        currency: "USD",
      },
      {
        description: "Bambu Engineering Plate",
        quantity: 1,
        unitPrice: 59.99,
        hsCode: "844399",
        countryOfOrigin: "EG",
        currency: "USD",
      },
    ],
  });

  if (!response.labelData) {
    throw new Error("DHL response did not include labelData");
  }

  const outDir = join(process.cwd(), "tmp", "live-dhl-labels");
  await mkdir(outDir, { recursive: true });

  const pdfPath = join(outDir, `dhl-label-${response.trackingNumber}.pdf`);
  const jsonPath = join(outDir, `dhl-label-${response.trackingNumber}.json`);

  await writeFile(pdfPath, Buffer.from(response.labelData, "base64"));
  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        trackingNumber: response.trackingNumber,
        carrierTrackingNumber: response.carrierTrackingNumber,
        serviceType: response.serviceType,
        labelPath: pdfPath,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify({
      ok: true,
      trackingNumber: response.trackingNumber,
      pdfPath,
      jsonPath,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
