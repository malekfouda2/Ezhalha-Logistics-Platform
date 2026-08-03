import { afterEach, describe, expect, it, vi } from "vitest";
import { storage } from "../server/storage";
import { ZohoService, type ZohoInvoiceParams } from "../server/integrations/zoho";

const invoiceParams: ZohoInvoiceParams = {
  customerId: "contact-123",
  customerName: "Regression Customer",
  customerEmail: "customer@example.com",
  invoiceNumber: "INV-REGRESSION",
  date: "2026-06-01",
  dueDate: "2026-06-30",
  lineItems: [{
    name: "Shipment EZH123",
    quantity: 1,
    rate: 125,
  }],
};

afterEach(() => {
  for (const key of [
    "ZOHO_CLIENT_ID",
    "ZOHO_CLIENT_SECRET",
    "ZOHO_REFRESH_TOKEN",
    "ZOHO_ORGANIZATION_ID",
    "ZOHO_ACCOUNTS_BASE_URL",
    "ZOHO_API_BASE_URL",
    "ZOHO_VAT_TAX_ID",
  ]) {
    delete process.env[key];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Zoho regional invoice synchronization", () => {
  it("uses the configured regional hosts when updating an invoice", async () => {
    process.env.ZOHO_CLIENT_ID = "client-id";
    process.env.ZOHO_CLIENT_SECRET = "client-secret";
    process.env.ZOHO_REFRESH_TOKEN = "refresh-token";
    process.env.ZOHO_ORGANIZATION_ID = "organization-id";
    process.env.ZOHO_ACCOUNTS_BASE_URL = "https://accounts.zoho.eu";
    process.env.ZOHO_API_BASE_URL = "https://www.zohoapis.eu";
    // Provide the VAT tax id so the update path does not make a live /settings/taxes
    // lookup — keeps the mocked fetch sequence to token + PUT.
    process.env.ZOHO_VAT_TAX_ID = "vat-tax-id";

    vi.spyOn(storage, "createIntegrationLog").mockResolvedValue({} as any);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "regional-access-token",
        expires_in: 3600,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const service = new ZohoService();
    expect(await service.updateInvoice("zoho-invoice-1", invoiceParams)).toBe(true);

    // Invoice deletion is performed manually in Zoho, not through our system, so it is
    // intentionally not exercised here.
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://accounts.zoho.eu/oauth/v2/token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://www.zohoapis.eu/books/v3/invoices/zoho-invoice-1?organization_id=organization-id",
      expect.objectContaining({ method: "PUT" }),
    );
  });
});
