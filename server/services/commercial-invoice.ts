import type { Shipment } from "@shared/schema";

export const INTERNAL_COMMERCIAL_INVOICE_OBJECT_PATH = "internal://commercial-invoice";

export interface CommercialInvoiceItemLine {
  itemName: string;
  itemDescription?: string;
  category?: string;
  material?: string;
  countryOfOrigin: string;
  hsCode?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface CommercialInvoiceDocument {
  invoiceNumber: string;
  issueDate: string;
  shipmentReference: string;
  carrierCode: string;
  carrierName: string;
  serviceType: string;
  incoterm: string;
  currency: string;
  packageCount: number;
  grossWeight: number;
  weightUnit: string;
  dimensionSummary?: string;
  shipper: {
    name: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    stateOrProvince?: string;
    postalCode?: string;
    country: string;
    phone: string;
    email?: string;
  };
  consignee: {
    name: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    stateOrProvince?: string;
    postalCode?: string;
    country: string;
    phone: string;
    email?: string;
  };
  items: CommercialInvoiceItemLine[];
  commodityDescription: string;
  declaredValue: number;
}

type CommercialInvoiceShipmentItem = {
  itemName: string;
  itemDescription?: string;
  category?: string;
  material?: string;
  countryOfOrigin?: string;
  hsCode?: string;
  price: number;
  quantity: number;
};

function safeNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function formatMoney(value: number): string {
  return value.toFixed(2);
}

function compactParts(parts: Array<string | null | undefined>): string[] {
  return parts.map((part) => String(part || "").trim()).filter(Boolean);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r/g, "")
    .replace(/\n/g, " ");
}

function wrapText(value: string, maxLength: number): string[] {
  const text = value.trim();
  if (!text) return [""];
  if (text.length <= maxLength) return [text];

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    }

    if (word.length > maxLength) {
      let remaining = word;
      while (remaining.length > maxLength) {
        lines.push(remaining.slice(0, maxLength));
        remaining = remaining.slice(maxLength);
      }
      current = remaining;
      continue;
    }

    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function parseShipmentItems(shipment: Shipment): CommercialInvoiceItemLine[] {
  if (!shipment.itemsData) {
    return [];
  }

  try {
    const parsedItems = JSON.parse(shipment.itemsData) as CommercialInvoiceShipmentItem[];
    const normalizedItems: CommercialInvoiceItemLine[] = [];

    for (const item of parsedItems) {
      const quantity = Math.max(1, safeNumber(item.quantity, 1));
      const unitPrice = Math.max(0, safeNumber(item.price, 0));
      const itemName = String(item.itemName || "").trim();

      if (!itemName) {
        continue;
      }

      normalizedItems.push({
        itemName,
        itemDescription: item.itemDescription?.trim() || undefined,
        category: item.category?.trim() || undefined,
        material: item.material?.trim() || undefined,
        countryOfOrigin: item.countryOfOrigin?.trim() || shipment.senderCountry,
        hsCode: item.hsCode?.trim() || undefined,
        quantity,
        unitPrice,
        lineTotal: Number((quantity * unitPrice).toFixed(2)),
      });
    }

    return normalizedItems;
  } catch {
    return [];
  }
}

function buildDimensionSummary(shipment: Shipment): string | undefined {
  if (shipment.packagesData) {
    try {
      const parsedPackages = JSON.parse(shipment.packagesData) as Array<{
        length?: number;
        width?: number;
        height?: number;
      }>;

      const firstWithDimensions = parsedPackages.find(
        (pkg) =>
          Number.isFinite(Number(pkg.length)) &&
          Number.isFinite(Number(pkg.width)) &&
          Number.isFinite(Number(pkg.height)),
      );

      if (firstWithDimensions) {
        return `${safeNumber(firstWithDimensions.length).toFixed(0)} x ${safeNumber(firstWithDimensions.width).toFixed(0)} x ${safeNumber(firstWithDimensions.height).toFixed(0)} ${shipment.dimensionUnit || "CM"}`;
      }
    } catch {
      // Fall back to the single-package dimensions below.
    }
  }

  if (shipment.length && shipment.width && shipment.height) {
    return `${safeNumber(shipment.length).toFixed(0)} x ${safeNumber(shipment.width).toFixed(0)} x ${safeNumber(shipment.height).toFixed(0)} ${shipment.dimensionUnit || "CM"}`;
  }

  return undefined;
}

function buildIncoterm(shipment: Shipment): string {
  if (shipment.senderCountry === shipment.recipientCountry) {
    return "DOMESTIC";
  }
  return shipment.isDdp ? "DDP" : "DAP";
}

export function buildCommercialInvoiceNumber(shipment: Shipment): string {
  return `EZI-CI-${shipment.trackingNumber}`;
}

export function buildCommercialInvoiceFileName(shipment: Shipment): string {
  return `${buildCommercialInvoiceNumber(shipment).toLowerCase()}.pdf`;
}

export function hasCommercialInvoiceData(shipment: Shipment): boolean {
  return parseShipmentItems(shipment).length > 0;
}

export function buildCommercialInvoiceDocument(shipment: Shipment): CommercialInvoiceDocument {
  const items = parseShipmentItems(shipment);
  const declaredValue = Number(
    items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2),
  );

  return {
    invoiceNumber: buildCommercialInvoiceNumber(shipment),
    issueDate: new Date(shipment.createdAt).toISOString().slice(0, 10),
    shipmentReference: shipment.trackingNumber,
    carrierCode: shipment.carrierCode || shipment.carrierName || "UNKNOWN",
    carrierName: shipment.carrierName || shipment.carrierCode || "Carrier",
    serviceType: shipment.carrierServiceType || shipment.serviceType || "STANDARD",
    incoterm: buildIncoterm(shipment),
    currency: shipment.currency || "SAR",
    packageCount: shipment.numberOfPackages || 1,
    grossWeight: safeNumber(shipment.weight),
    weightUnit: shipment.weightUnit || "KG",
    dimensionSummary: buildDimensionSummary(shipment),
    shipper: {
      name: shipment.senderName,
      addressLine1: shipment.senderAddress,
      addressLine2: compactParts([
        shipment.senderAddressLine2,
        shipment.senderShortAddress,
      ]).join(" | ") || undefined,
      city: shipment.senderCity,
      stateOrProvince: shipment.senderStateOrProvince || undefined,
      postalCode: shipment.senderPostalCode || undefined,
      country: shipment.senderCountry,
      phone: shipment.senderPhone,
      email: shipment.senderEmail || undefined,
    },
    consignee: {
      name: shipment.recipientName,
      addressLine1: shipment.recipientAddress,
      addressLine2: compactParts([
        shipment.recipientAddressLine2,
        shipment.recipientShortAddress,
      ]).join(" | ") || undefined,
      city: shipment.recipientCity,
      stateOrProvince: shipment.recipientStateOrProvince || undefined,
      postalCode: shipment.recipientPostalCode || undefined,
      country: shipment.recipientCountry,
      phone: shipment.recipientPhone,
      email: shipment.recipientEmail || undefined,
    },
    items,
    commodityDescription:
      items.map((item) => item.itemName).join(", ").slice(0, 180) || "Commercial goods",
    declaredValue,
  };
}

function buildPdfLines(document: CommercialInvoiceDocument): string[] {
  const lines: string[] = [];

  const pushWrapped = (label: string, value?: string, width = 88) => {
    if (!value) return;
    const wrapped = wrapText(`${label}${value}`, width);
    lines.push(...wrapped);
  };

  lines.push("EZHALHA LOGISTICS");
  lines.push("INTERNAL COMMERCIAL INVOICE");
  lines.push("");
  lines.push(`Invoice No: ${document.invoiceNumber}`);
  lines.push(`Issue Date: ${document.issueDate}`);
  lines.push(`Shipment Ref: ${document.shipmentReference}`);
  lines.push(`Carrier: ${document.carrierName} (${document.carrierCode})`);
  lines.push(`Service: ${document.serviceType}`);
  lines.push(`Incoterm: ${document.incoterm}`);
  lines.push(`Currency: ${document.currency}`);
  lines.push("");
  lines.push("SHIPPER");
  lines.push(document.shipper.name);
  lines.push(document.shipper.addressLine1);
  if (document.shipper.addressLine2) lines.push(document.shipper.addressLine2);
  lines.push(compactParts([
    document.shipper.city,
    document.shipper.stateOrProvince,
    document.shipper.postalCode,
    document.shipper.country,
  ]).join(", "));
  lines.push(`Phone: ${document.shipper.phone}`);
  if (document.shipper.email) lines.push(`Email: ${document.shipper.email}`);
  lines.push("");
  lines.push("CONSIGNEE");
  lines.push(document.consignee.name);
  lines.push(document.consignee.addressLine1);
  if (document.consignee.addressLine2) lines.push(document.consignee.addressLine2);
  lines.push(compactParts([
    document.consignee.city,
    document.consignee.stateOrProvince,
    document.consignee.postalCode,
    document.consignee.country,
  ]).join(", "));
  lines.push(`Phone: ${document.consignee.phone}`);
  if (document.consignee.email) lines.push(`Email: ${document.consignee.email}`);
  lines.push("");
  lines.push("SHIPMENT SUMMARY");
  lines.push(`Packages: ${document.packageCount}`);
  lines.push(`Gross Weight: ${document.grossWeight.toFixed(2)} ${document.weightUnit}`);
  if (document.dimensionSummary) lines.push(`Dimensions: ${document.dimensionSummary}`);
  lines.push(`Commodity: ${document.commodityDescription}`);
  lines.push("");
  lines.push("LINE ITEMS");
  lines.push("--------------------------------------------------------------------------------");

  document.items.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${item.itemName} | Qty ${item.quantity} | Unit ${formatMoney(item.unitPrice)} ${document.currency} | Total ${formatMoney(item.lineTotal)} ${document.currency}`,
    );
    pushWrapped("    Description: ", item.itemDescription || item.itemName);
    if (item.category) lines.push(`    Category: ${item.category}`);
    if (item.material) lines.push(`    Material: ${item.material}`);
    lines.push(`    Origin: ${item.countryOfOrigin}`);
    if (item.hsCode) lines.push(`    HS Code: ${item.hsCode}`);
    lines.push("");
  });

  lines.push("TOTALS");
  lines.push(`Declared Value: ${formatMoney(document.declaredValue)} ${document.currency}`);
  lines.push("Freight On Invoice: 0.00");
  lines.push("Insurance: 0.00");
  lines.push(`Total For Customs: ${formatMoney(document.declaredValue)} ${document.currency}`);
  lines.push("");
  lines.push("DECLARATION");
  lines.push(
    "We certify that the information contained in this invoice is true and correct and that",
  );
  lines.push("the contents of this shipment are as stated above.");
  lines.push("");
  lines.push("Generated by ezhalha Logistics Platform");

  return lines;
}

function buildPdfContentStream(lines: string[]): string {
  const operations: string[] = [
    "BT",
    "/F1 10 Tf",
    "40 800 Td",
  ];

  lines.forEach((line, index) => {
    if (index > 0) {
      operations.push("0 -14 Td");
    }
    operations.push(`(${escapePdfText(line)}) Tj`);
  });

  operations.push("ET");
  return operations.join("\n");
}

function buildMinimalPdf(pageLines: string[][]): Buffer {
  const objectEntries: Array<string | null> = [null];
  objectEntries[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objectEntries[2] = "<< /Type /Pages /Count 0 /Kids [] >>";
  objectEntries[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>";

  const pageIds: number[] = [];
  let nextObjectId = 4;

  for (const lines of pageLines) {
    const contentId = nextObjectId++;
    const pageId = nextObjectId++;
    const stream = buildPdfContentStream(lines);
    const streamLength = Buffer.byteLength(stream, "utf8");

    objectEntries[contentId] = `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`;
    objectEntries[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    pageIds.push(pageId);
  }

  objectEntries[2] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (let id = 1; id < objectEntries.length; id += 1) {
    const objectBody = objectEntries[id];
    if (!objectBody) continue;
    offsets[id] = Buffer.byteLength(pdf, "utf8");
    pdf += `${id} 0 obj\n${objectBody}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objectEntries.length}\n`;
  pdf += "0000000000 65535 f \n";

  for (let id = 1; id < objectEntries.length; id += 1) {
    const offset = offsets[id] || 0;
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objectEntries.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

export function renderCommercialInvoicePdfBuffer(shipment: Shipment): Buffer {
  const document = buildCommercialInvoiceDocument(shipment);
  const lines = buildPdfLines(document);
  const maxLinesPerPage = 48;
  const pages: string[][] = [];

  for (let index = 0; index < lines.length; index += maxLinesPerPage) {
    pages.push(lines.slice(index, index + maxLinesPerPage));
  }

  return buildMinimalPdf(pages);
}

export function renderCommercialInvoiceHtml(shipment: Shipment): string {
  const document = buildCommercialInvoiceDocument(shipment);
  const rows = document.items
    .map((item, index) => {
      const metadata = compactParts([
        item.category ? `Category: ${item.category}` : undefined,
        item.material ? `Material: ${item.material}` : undefined,
        `Origin: ${item.countryOfOrigin}`,
        item.hsCode ? `HS: ${item.hsCode}` : undefined,
      ]).join(" | ");

      return `
        <tr>
          <td>${index + 1}</td>
          <td>
            <strong>${escapeHtml(item.itemName)}</strong><br>
            <span class="muted">${escapeHtml(item.itemDescription || item.itemName)}</span><br>
            <span class="micro">${escapeHtml(metadata)}</span>
          </td>
          <td class="text-right">${item.quantity}</td>
          <td class="text-right">${formatMoney(item.unitPrice)} ${escapeHtml(document.currency)}</td>
          <td class="text-right">${formatMoney(item.lineTotal)} ${escapeHtml(document.currency)}</td>
        </tr>
      `;
    })
    .join("");

  const shipperAddress = compactParts([
    document.shipper.addressLine1,
    document.shipper.addressLine2,
    compactParts([
      document.shipper.city,
      document.shipper.stateOrProvince,
      document.shipper.postalCode,
      document.shipper.country,
    ]).join(", "),
    `Phone: ${document.shipper.phone}`,
    document.shipper.email ? `Email: ${document.shipper.email}` : undefined,
  ]);

  const consigneeAddress = compactParts([
    document.consignee.addressLine1,
    document.consignee.addressLine2,
    compactParts([
      document.consignee.city,
      document.consignee.stateOrProvince,
      document.consignee.postalCode,
      document.consignee.country,
    ]).join(", "),
    `Phone: ${document.consignee.phone}`,
    document.consignee.email ? `Email: ${document.consignee.email}` : undefined,
  ]);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(document.invoiceNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #1f2937; margin: 32px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 2px solid #fe5200; padding-bottom: 18px; margin-bottom: 24px; }
    .brand { font-size: 28px; font-weight: 700; color: #fe5200; }
    .muted { color: #6b7280; }
    .micro { color: #6b7280; font-size: 12px; }
    .meta { text-align: right; }
    .meta strong { display: block; font-size: 22px; margin-bottom: 6px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    .panel { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
    .panel h3 { margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; }
    .panel p { margin: 4px 0; line-height: 1.5; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .summary-card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; }
    .summary-card .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin-bottom: 8px; }
    .summary-card .value { font-size: 18px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th, td { padding: 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    th { background: #f9fafb; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; text-align: left; }
    .text-right { text-align: right; }
    .totals { margin-left: auto; width: 320px; }
    .totals-row { display: flex; justify-content: space-between; padding: 8px 0; }
    .totals-row.total { font-weight: 700; font-size: 18px; border-top: 2px solid #111827; margin-top: 4px; padding-top: 12px; }
    .declaration { margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 18px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">ezhalha</div>
      <div class="muted">Internal Commercial Invoice</div>
    </div>
    <div class="meta">
      <strong>${escapeHtml(document.invoiceNumber)}</strong>
      <div>Issue Date: ${escapeHtml(document.issueDate)}</div>
      <div>Shipment Ref: ${escapeHtml(document.shipmentReference)}</div>
      <div>Carrier: ${escapeHtml(document.carrierName)} (${escapeHtml(document.carrierCode)})</div>
      <div>Service: ${escapeHtml(document.serviceType)}</div>
    </div>
  </div>

  <div class="grid">
    <div class="panel">
      <h3>Shipper</h3>
      <p><strong>${escapeHtml(document.shipper.name)}</strong></p>
      ${shipperAddress.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
    </div>
    <div class="panel">
      <h3>Consignee</h3>
      <p><strong>${escapeHtml(document.consignee.name)}</strong></p>
      ${consigneeAddress.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
    </div>
  </div>

  <div class="summary">
    <div class="summary-card">
      <div class="label">Packages</div>
      <div class="value">${document.packageCount}</div>
    </div>
    <div class="summary-card">
      <div class="label">Gross Weight</div>
      <div class="value">${document.grossWeight.toFixed(2)} ${escapeHtml(document.weightUnit)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Incoterm</div>
      <div class="value">${escapeHtml(document.incoterm)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Commodity</div>
      <div class="value">${escapeHtml(document.commodityDescription)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Description</th>
        <th class="text-right">Qty</th>
        <th class="text-right">Unit Value</th>
        <th class="text-right">Line Total</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-row"><span>Declared Value</span><span>${formatMoney(document.declaredValue)} ${escapeHtml(document.currency)}</span></div>
    <div class="totals-row"><span>Freight On Invoice</span><span>0.00</span></div>
    <div class="totals-row"><span>Insurance</span><span>0.00</span></div>
    <div class="totals-row total"><span>Total For Customs</span><span>${formatMoney(document.declaredValue)} ${escapeHtml(document.currency)}</span></div>
  </div>

  <div class="declaration">
    We hereby certify that the information contained in this invoice is true and correct and
    that the contents of this shipment are as stated above. This commercial invoice was generated
    internally by ezhalha from the shipment item data supplied in the booking flow.
  </div>
</body>
</html>
  `;
}
