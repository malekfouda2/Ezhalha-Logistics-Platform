/**
 * Zoho Books Integration for ezhalha
 * 
 * This module provides Zoho Books invoice synchronization.
 * Configure the following environment variables:
 * - ZOHO_CLIENT_ID
 * - ZOHO_CLIENT_SECRET
 * - ZOHO_REFRESH_TOKEN
 * - ZOHO_ORGANIZATION_ID
 */

import "../load-env";
import { storage } from "../storage";
import { getIntegrationEnv } from "../services/integration-runtime";

export interface ZohoInvoiceParams {
  customerId?: string;
  customerName: string;
  customerEmail: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  lineItems: Array<{
    name: string;
    description?: string;
    quantity: number;
    rate: number;
  }>;
  notes?: string;
  // Total VAT already embedded in the line totals (mirrors our computed VAT). The
  // service splits the line items into a taxable portion (so Zoho's VAT equals this)
  // plus a non-taxable remainder. When 0/undefined the invoice is zero-rated.
  taxAmountSar?: number;
  taxScenario?: string;
  currency?: string;
  referenceNumber?: string;
}

export interface ZohoInvoiceResult {
  zohoInvoiceId: string;
  invoiceUrl: string;
}

export interface ZohoPaymentParams {
  customerId: string;
  invoiceId: string;
  amount: number;
  date: string;
  paymentMode?: string;
  referenceNumber?: string;
}

export interface ZohoCreditNoteParams {
  customerId: string;
  invoiceId: string;
  creditNoteNumber: string;
  date: string;
  reason?: string;
  lineItems: Array<{ name: string; quantity: number; rate: number }>;
  taxAmountSar?: number;
  currency?: string;
}

export interface ZohoExpenseParams {
  accountId: string;
  paidThroughAccountId?: string;
  amount: number;
  date: string;
  description?: string;
  referenceNumber?: string;
  customerId?: string;
  currency?: string;
}

export interface ZohoCustomerParams {
  name: string;
  email: string;
  phone?: string;
  companyName?: string;
  country?: string;
  // Billing address fields (legacy)
  billingCity?: string;
  billingState?: string;
  billingPostalCode?: string;
  billingStreet?: string;
  billingStreet2?: string;
  // Account type
  customerType?: 'business' | 'individual';
  // Shipping Address fields (Primary Language - English)
  shippingContactName?: string;
  shippingContactPhone?: string;
  shippingCountryCode?: string;
  shippingStateOrProvince?: string;
  shippingCity?: string;
  shippingPostalCode?: string;
  shippingAddressLine1?: string;
  shippingAddressLine2?: string;
  shippingShortAddress?: string;
  // Tax registration (VAT) + commercial registration — required for compliant B2B invoices
  taxRegNo?: string;
  crNumber?: string;
  // Arabic (Secondary Language) fields
  nameAr?: string;
  companyNameAr?: string;
  // Shipping Address Arabic fields
  shippingContactNameAr?: string;
  shippingContactPhoneAr?: string;
  shippingCountryCodeAr?: string;
  shippingStateOrProvinceAr?: string;
  shippingCityAr?: string;
  shippingPostalCodeAr?: string;
  shippingAddressLine1Ar?: string;
  shippingAddressLine2Ar?: string;
  shippingShortAddressAr?: string;
}

const VAT_RATE = 0.15;

export class ZohoService {
  private accessToken: string | undefined;
  private tokenExpiry: number = 0;
  private tokenCredentialFingerprint: string | undefined;
  private tokenApiDomain: string | undefined;
  // Cache of resolved tax ids per org (1h TTL).
  private taxCache: { vatTaxId?: string; zeroTaxId?: string; expiry: number; org?: string } = { expiry: 0 };

  private get clientId() {
    return getIntegrationEnv("ZOHO_CLIENT_ID");
  }

  private get clientSecret() {
    return getIntegrationEnv("ZOHO_CLIENT_SECRET");
  }

  private get refreshToken() {
    return getIntegrationEnv("ZOHO_REFRESH_TOKEN");
  }

  private get organizationId() {
    return getIntegrationEnv("ZOHO_ORGANIZATION_ID");
  }

  private get accountsBaseUrl() {
    return (getIntegrationEnv("ZOHO_ACCOUNTS_BASE_URL") || "https://accounts.zoho.sa").replace(/\/+$/, "");
  }

  private get apiDomain() {
    return (this.tokenApiDomain || getIntegrationEnv("ZOHO_API_BASE_URL") || "https://www.zohoapis.sa").replace(/\/+$/, "");
  }

  private getCredentialFingerprint() {
    return `${this.clientId || ""}:${this.refreshToken || ""}:${this.organizationId || ""}:${this.accountsBaseUrl}:${getIntegrationEnv("ZOHO_API_BASE_URL") || ""}`;
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  // Zoho caps reference_number at 50 characters; truncate to stay within the limit.
  private capRef(value?: string): string | undefined {
    if (!value) return undefined;
    return value.length > 49 ? value.slice(0, 49) : value;
  }

  // Authed JSON request helper for the newer endpoints (token + org auto-applied).
  private async zohoFetch(accessToken: string, path: string, init?: RequestInit & { query?: Record<string, string> }) {
    const sep = path.includes("?") ? "&" : "?";
    const query = init?.query ? "&" + new URLSearchParams(init.query).toString() : "";
    const url = `${this.apiDomain}${path}${sep}organization_id=${this.organizationId}${query}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  // Resolve the org's 15% VAT tax id and a 0% (zero-rated) tax id, honoring env
  // overrides ZOHO_VAT_TAX_ID / ZOHO_ZERO_TAX_ID; otherwise discover from the org.
  private async resolveTaxIds(accessToken: string): Promise<{ vatTaxId?: string; zeroTaxId?: string }> {
    const envVat = getIntegrationEnv("ZOHO_VAT_TAX_ID");
    const envZero = getIntegrationEnv("ZOHO_ZERO_TAX_ID");
    if (envVat) {
      return { vatTaxId: envVat, zeroTaxId: envZero || undefined };
    }
    if (this.taxCache.org === this.organizationId && Date.now() < this.taxCache.expiry && this.taxCache.vatTaxId) {
      return { vatTaxId: this.taxCache.vatTaxId, zeroTaxId: this.taxCache.zeroTaxId };
    }
    try {
      const { data } = await this.zohoFetch(accessToken, "/books/v3/settings/taxes");
      const taxes: Array<{ tax_id: string; tax_percentage: number; tax_name?: string }> = data?.taxes || [];
      const vat = taxes.find((t) => Number(t.tax_percentage) === 15);
      const zero = taxes.find((t) => Number(t.tax_percentage) === 0);
      this.taxCache = {
        vatTaxId: vat?.tax_id,
        zeroTaxId: envZero || zero?.tax_id,
        org: this.organizationId,
        expiry: Date.now() + 60 * 60 * 1000,
      };
      return { vatTaxId: this.taxCache.vatTaxId, zeroTaxId: this.taxCache.zeroTaxId };
    } catch {
      return { vatTaxId: undefined, zeroTaxId: envZero || undefined };
    }
  }

  // Build invoice/credit-note line items that reproduce our exact VAT: a taxable
  // portion (inclusive 15%) sized so Zoho's VAT == taxAmountSar, plus a non-taxable
  // remainder. taxAmountSar = 0 → fully zero-rated.
  private buildTaxedLineItems(
    name: string,
    grossAmount: number,
    taxAmountSar: number | undefined,
    taxIds: { vatTaxId?: string; zeroTaxId?: string },
  ) {
    const gross = this.roundMoney(grossAmount);
    const tax = this.roundMoney(Math.max(taxAmountSar || 0, 0));
    const lines: Array<Record<string, unknown>> = [];

    if (tax > 0 && taxIds.vatTaxId) {
      const taxableInclusive = Math.min(this.roundMoney((tax * (1 + VAT_RATE)) / VAT_RATE), gross);
      const remainder = this.roundMoney(gross - taxableInclusive);
      // When the cost is split off as a non-taxable remainder (cross-border: only the
      // margin is taxed), the taxable portion is Ezhalha's aggregation/service fee.
      const taxableName = remainder > 0 ? `${name} — Aggregation fees` : name;
      lines.push({
        name: taxableName,
        quantity: 1,
        rate: taxableInclusive,
        tax_id: taxIds.vatTaxId,
        is_inclusive_tax: true,
      });
      if (remainder > 0) {
        lines.push({
          name: `${name} (non-taxable)`,
          quantity: 1,
          rate: remainder,
          ...(taxIds.zeroTaxId ? { tax_id: taxIds.zeroTaxId } : {}),
        });
      }
    } else {
      // Zero-rated / no resolvable VAT tax → single non-taxable line.
      lines.push({
        name,
        quantity: 1,
        rate: gross,
        ...(taxIds.zeroTaxId ? { tax_id: taxIds.zeroTaxId } : {}),
      });
    }
    return lines;
  }

  private async buildInvoicePayload(params: ZohoInvoiceParams, accessToken: string) {
    const taxIds = await this.resolveTaxIds(accessToken);
    const gross = params.lineItems.reduce((sum, item) => sum + item.quantity * item.rate, 0);
    const primaryName = params.lineItems[0]?.name || params.invoiceNumber;
    const lineItems = this.buildTaxedLineItems(primaryName, gross, params.taxAmountSar, taxIds);
    return {
      customer_id: params.customerId,
      // Invoice number is left to Zoho's own auto-numbering sequence/frequency. Our
      // internal number is kept in reference_number for traceability.
      date: params.date,
      due_date: params.dueDate,
      reference_number: this.capRef(params.referenceNumber || params.invoiceNumber),
      // is_inclusive_tax is an invoice-level flag in Zoho (per-line is ignored): line
      // rates already include VAT, so Zoho extracts it instead of adding on top.
      is_inclusive_tax: true,
      ...(params.currency ? { currency_code: params.currency } : {}),
      line_items: lineItems,
      notes: params.notes,
    };
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret && this.refreshToken && this.organizationId);
  }

  private async refreshAccessToken(): Promise<string | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const credentialFingerprint = this.getCredentialFingerprint();
    if (this.accessToken && Date.now() < this.tokenExpiry && this.tokenCredentialFingerprint === credentialFingerprint) {
      return this.accessToken;
    }
    if (this.tokenCredentialFingerprint !== credentialFingerprint) {
      this.tokenApiDomain = undefined;
    }

    const startTime = Date.now();
    try {
      const response = await fetch(`${this.accountsBaseUrl}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: this.refreshToken!,
          client_id: this.clientId!,
          client_secret: this.clientSecret!,
          grant_type: 'refresh_token',
        }),
      });
      
      const data = await response.json();
      const duration = Date.now() - startTime;
      
      if (data.error) {
        console.error("Zoho token refresh error:", data.error);
        await storage.createIntegrationLog({
          serviceName: "zoho",
          operation: "token_refresh",
          success: false,
          statusCode: response.status,
          errorMessage: data.error,
          duration,
        });
        return null;
      }
      
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
      this.tokenCredentialFingerprint = credentialFingerprint;
      
      if (data.api_domain) {
        this.tokenApiDomain = data.api_domain;
      }
      
      await storage.createIntegrationLog({
        serviceName: "zoho",
        operation: "token_refresh",
        success: true,
        statusCode: response.status,
        duration,
      });
      
      console.log("Zoho access token refreshed successfully");
      return this.accessToken || null;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error("Zoho token refresh failed:", error);
      await storage.createIntegrationLog({
        serviceName: "zoho",
        operation: "token_refresh",
        success: false,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        duration,
      });
      return null;
    }
  }

  async createInvoice(params: ZohoInvoiceParams): Promise<ZohoInvoiceResult | null> {
    if (!this.isConfigured()) {
      console.log("Zoho not configured, skipping invoice creation");
      return null;
    }

    const accessToken = await this.refreshAccessToken();
    if (!accessToken) {
      console.log("Zoho access token not available, skipping invoice creation");
      return null;
    }

    const startTime = Date.now();
    try {
      const response = await fetch(
        // No invoice_number is sent, so Zoho assigns the next number from its own
        // configured sequence/frequency.
        `${this.apiDomain}/books/v3/invoices?organization_id=${this.organizationId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(await this.buildInvoicePayload(params, accessToken)),
        }
      );

      const data = await response.json();
      const duration = Date.now() - startTime;

      if (data.code !== 0) {
        console.error("Zoho invoice creation error:", data.message);
        await storage.createIntegrationLog({
          serviceName: "zoho",
          operation: "create_invoice",
          success: false,
          statusCode: response.status,
          errorMessage: data.message,
          duration,
          requestPayload: JSON.stringify({ invoiceNumber: params.invoiceNumber }),
        });
        return null;
      }
      
      await storage.createIntegrationLog({
        serviceName: "zoho",
        operation: "create_invoice",
        success: true,
        statusCode: response.status,
        duration,
        requestPayload: JSON.stringify({ invoiceNumber: params.invoiceNumber }),
        responsePayload: JSON.stringify({ invoiceId: data.invoice?.invoice_id }),
      });
      
      console.log("Zoho invoice created:", data.invoice?.invoice_id);
      return {
        zohoInvoiceId: data.invoice.invoice_id,
        invoiceUrl: data.invoice.invoice_url || "",
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error("Zoho invoice creation failed:", error);
      await storage.createIntegrationLog({
        serviceName: "zoho",
        operation: "create_invoice",
        success: false,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        duration,
        requestPayload: JSON.stringify({ invoiceNumber: params.invoiceNumber }),
      });
      return null;
    }
  }

  async updateInvoice(zohoInvoiceId: string, params: ZohoInvoiceParams): Promise<boolean> {
    if (!this.isConfigured()) {
      console.log("Zoho not configured, skipping invoice update");
      return false;
    }

    const accessToken = await this.refreshAccessToken();
    if (!accessToken) {
      console.log("Zoho access token not available, skipping invoice update");
      return false;
    }

    const startTime = Date.now();
    try {
      const response = await fetch(
        `${this.apiDomain}/books/v3/invoices/${encodeURIComponent(zohoInvoiceId)}?organization_id=${this.organizationId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(await this.buildInvoicePayload(params, accessToken)),
        },
      );
      const data = await response.json();
      const duration = Date.now() - startTime;

      if (data.code !== 0) {
        await storage.createIntegrationLog({
          serviceName: "zoho",
          operation: "update_invoice",
          success: false,
          statusCode: response.status,
          errorMessage: data.message,
          duration,
          requestPayload: JSON.stringify({ invoiceNumber: params.invoiceNumber, zohoInvoiceId }),
        });
        return false;
      }

      await storage.createIntegrationLog({
        serviceName: "zoho",
        operation: "update_invoice",
        success: true,
        statusCode: response.status,
        duration,
        requestPayload: JSON.stringify({ invoiceNumber: params.invoiceNumber, zohoInvoiceId }),
      });
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      await storage.createIntegrationLog({
        serviceName: "zoho",
        operation: "update_invoice",
        success: false,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        duration,
        requestPayload: JSON.stringify({ invoiceNumber: params.invoiceNumber, zohoInvoiceId }),
      });
      return false;
    }
  }

  async deleteInvoice(zohoInvoiceId: string): Promise<boolean> {
    if (!this.isConfigured()) {
      console.log("Zoho not configured, skipping invoice deletion");
      return false;
    }

    const accessToken = await this.refreshAccessToken();
    if (!accessToken) {
      console.log("Zoho access token not available, skipping invoice deletion");
      return false;
    }

    const startTime = Date.now();
    try {
      const response = await fetch(
        `${this.apiDomain}/books/v3/invoices/${encodeURIComponent(zohoInvoiceId)}?organization_id=${this.organizationId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        },
      );
      const data = await response.json();
      const duration = Date.now() - startTime;
      const success = data.code === 0;

      await storage.createIntegrationLog({
        serviceName: "zoho",
        operation: "delete_invoice",
        success,
        statusCode: response.status,
        errorMessage: success ? undefined : data.message,
        duration,
        requestPayload: JSON.stringify({ zohoInvoiceId }),
      });
      return success;
    } catch (error) {
      const duration = Date.now() - startTime;
      await storage.createIntegrationLog({
        serviceName: "zoho",
        operation: "delete_invoice",
        success: false,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        duration,
        requestPayload: JSON.stringify({ zohoInvoiceId }),
      });
      return false;
    }
  }

  async createCustomer(params: ZohoCustomerParams): Promise<string | null> {
    if (!this.isConfigured()) {
      console.log("Zoho not configured, skipping customer creation");
      return null;
    }

    const accessToken = await this.refreshAccessToken();
    if (!accessToken) {
      console.log("Zoho access token not available, skipping customer creation");
      return null;
    }

    const startTime = Date.now();
    try {
      // Split name into first and last name for contact persons
      const nameParts = params.name.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      // Build billing address (Primary Language - English)
      const billingAddress: Record<string, string> = {};
      if (params.shippingContactName) billingAddress.attention = params.shippingContactName;
      if (params.shippingAddressLine1) billingAddress.address = params.shippingAddressLine1;
      if (params.shippingAddressLine2) billingAddress.street2 = params.shippingAddressLine2;
      if (params.shippingCity) billingAddress.city = params.shippingCity;
      if (params.shippingStateOrProvince) billingAddress.state = params.shippingStateOrProvince;
      if (params.shippingPostalCode) billingAddress.zip = params.shippingPostalCode;
      if (params.country) billingAddress.country = params.country;
      if (params.shippingContactPhone) billingAddress.phone = params.shippingContactPhone;
      
      // Add Arabic address fields with _sec_lang suffix (Zoho's secondary language format)
      if (params.shippingContactNameAr) billingAddress.attention_sec_lang = params.shippingContactNameAr.substring(0, 90);
      if (params.shippingAddressLine1Ar) billingAddress.address_sec_lang = params.shippingAddressLine1Ar.substring(0, 90);
      if (params.shippingAddressLine2Ar) billingAddress.street2_sec_lang = params.shippingAddressLine2Ar.substring(0, 90);
      if (params.shippingCityAr) billingAddress.city_sec_lang = params.shippingCityAr.substring(0, 50);
      if (params.shippingStateOrProvinceAr) billingAddress.state_sec_lang = params.shippingStateOrProvinceAr.substring(0, 50);
      
      // Build shipping address (same as billing)
      const shippingAddress = { ...billingAddress };
      
      // Build contact payload with Primary Language data
      const contactPayload: Record<string, any> = {
        // Business accounts invoice under the company name; individuals under the person.
        contact_name: (params.customerType === 'business' && params.companyName) ? params.companyName : params.name,
        contact_type: 'customer',
        customer_sub_type: params.customerType === 'individual' ? 'individual' : 'business',
        company_name: params.companyName || '',
        ...(params.taxRegNo ? { tax_reg_no: params.taxRegNo, is_taxable: true } : {}),
        ...(params.crNumber ? { cr_no: params.crNumber } : {}),
        email: params.email,
        phone: params.phone,
        billing_address: Object.keys(billingAddress).length > 0 ? billingAddress : undefined,
        shipping_address: Object.keys(shippingAddress).length > 0 ? shippingAddress : undefined,
        contact_persons: [{
          first_name: firstName,
          last_name: lastName,
          email: params.email,
          phone: params.phone,
          is_primary_contact: true,
        }],
      };
      
      // Add Secondary Language (Arabic) fields for KSA e-invoicing
      if (params.nameAr) {
        contactPayload.contact_name_sec_lang = params.nameAr.substring(0, 99);
      }
      if (params.companyNameAr) {
        contactPayload.company_name_sec_lang = params.companyNameAr.substring(0, 99);
      }
      
      const response = await fetch(
        `${this.apiDomain}/books/v3/contacts?organization_id=${this.organizationId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(contactPayload),
        }
      );
      
      const data = await response.json();
      const duration = Date.now() - startTime;
      
      if (data.code !== 0) {
        console.error("Zoho customer creation error:", data.message);
        await storage.createIntegrationLog({
          serviceName: "zoho",
          operation: "create_customer",
          success: false,
          statusCode: response.status,
          errorMessage: data.message,
          duration,
          requestPayload: JSON.stringify({ email: params.email, name: params.name }),
        });
        return null;
      }
      
      await storage.createIntegrationLog({
        serviceName: "zoho",
        operation: "create_customer",
        success: true,
        statusCode: response.status,
        duration,
        requestPayload: JSON.stringify({ email: params.email, name: params.name }),
        responsePayload: JSON.stringify({ customerId: data.contact?.contact_id }),
      });
      
      console.log("Zoho customer created:", data.contact?.contact_id);
      return data.contact.contact_id;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error("Zoho customer creation failed:", error);
      await storage.createIntegrationLog({
        serviceName: "zoho",
        operation: "create_customer",
        success: false,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        duration,
        requestPayload: JSON.stringify({ email: params.email, name: params.name }),
      });
      return null;
    }
  }

  async updateCustomer(zohoCustomerId: string, params: ZohoCustomerParams): Promise<boolean> {
    if (!this.isConfigured()) {
      console.log("Zoho not configured, skipping customer update");
      return false;
    }

    const accessToken = await this.refreshAccessToken();
    if (!accessToken) {
      console.log("Zoho access token not available, skipping customer update");
      return false;
    }

    const startTime = Date.now();
    try {
      // Split name into first and last name for contact persons
      const nameParts = params.name.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      // Build billing address with both English (primary) and Arabic (secondary) fields
      // Zoho embeds Arabic fields INSIDE the address object with _arabic suffix
      const billingAddress: Record<string, string> = {};
      if (params.shippingContactName) billingAddress.attention = params.shippingContactName;
      if (params.shippingAddressLine1) billingAddress.address = params.shippingAddressLine1;
      if (params.shippingAddressLine2) billingAddress.street2 = params.shippingAddressLine2;
      if (params.shippingCity) billingAddress.city = params.shippingCity;
      if (params.shippingStateOrProvince) billingAddress.state = params.shippingStateOrProvince;
      if (params.shippingPostalCode) billingAddress.zip = params.shippingPostalCode;
      if (params.country) billingAddress.country = params.country;
      if (params.shippingContactPhone) billingAddress.phone = params.shippingContactPhone;
      
      // Add Arabic address fields with _sec_lang suffix (Zoho's secondary language format)
      if (params.shippingContactNameAr) billingAddress.attention_sec_lang = params.shippingContactNameAr.substring(0, 90);
      if (params.shippingAddressLine1Ar) billingAddress.address_sec_lang = params.shippingAddressLine1Ar.substring(0, 90);
      if (params.shippingAddressLine2Ar) billingAddress.street2_sec_lang = params.shippingAddressLine2Ar.substring(0, 90);
      if (params.shippingCityAr) billingAddress.city_sec_lang = params.shippingCityAr.substring(0, 50);
      if (params.shippingStateOrProvinceAr) billingAddress.state_sec_lang = params.shippingStateOrProvinceAr.substring(0, 50);
      
      // Build shipping address (same as billing)
      const shippingAddress = { ...billingAddress };
      
      // Build contact payload with Primary Language data
      const contactPayload: Record<string, any> = {
        // Business accounts invoice under the company name; individuals under the person.
        contact_name: (params.customerType === 'business' && params.companyName) ? params.companyName : params.name,
        customer_sub_type: params.customerType === 'individual' ? 'individual' : 'business',
        company_name: params.companyName || '',
        ...(params.taxRegNo ? { tax_reg_no: params.taxRegNo, is_taxable: true } : {}),
        ...(params.crNumber ? { cr_no: params.crNumber } : {}),
        email: params.email,
        phone: params.phone,
        billing_address: Object.keys(billingAddress).length > 0 ? billingAddress : undefined,
        shipping_address: Object.keys(shippingAddress).length > 0 ? shippingAddress : undefined,
        contact_persons: [{
          first_name: firstName,
          last_name: lastName,
          email: params.email,
          phone: params.phone,
          is_primary_contact: true,
        }],
      };
      
      // Add Secondary Language (Arabic) fields for KSA e-invoicing
      // Use _sec_lang suffix (matching Zoho's secondary language pattern)
      if (params.nameAr) {
        contactPayload.contact_name_sec_lang = params.nameAr.substring(0, 99);
      }
      if (params.companyNameAr) {
        contactPayload.company_name_sec_lang = params.companyNameAr.substring(0, 99);
      }
      
      const response = await fetch(
        `${this.apiDomain}/books/v3/contacts/${zohoCustomerId}?organization_id=${this.organizationId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(contactPayload),
        }
      );
      
      const data = await response.json();
      const duration = Date.now() - startTime;
      
      if (data.code !== 0) {
        console.error("Zoho customer update error:", data.message);
        await storage.createIntegrationLog({
          serviceName: "zoho",
          operation: "update_customer",
          success: false,
          statusCode: response.status,
          errorMessage: data.message,
          duration,
          requestPayload: JSON.stringify({ customerId: zohoCustomerId, email: params.email }),
        });
        return false;
      }
      
      await storage.createIntegrationLog({
        serviceName: "zoho",
        operation: "update_customer",
        success: true,
        statusCode: response.status,
        duration,
        requestPayload: JSON.stringify({ customerId: zohoCustomerId, email: params.email }),
        responsePayload: JSON.stringify({ contactId: data.contact?.contact_id }),
      });
      
      console.log("Zoho customer updated successfully:", zohoCustomerId);
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error("Zoho customer update failed:", error);
      await storage.createIntegrationLog({
        serviceName: "zoho",
        operation: "update_customer",
        success: false,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        duration,
        requestPayload: JSON.stringify({ customerId: zohoCustomerId, email: params.email }),
      });
      return false;
    }
  }

  // Record a customer payment against an invoice (marks it paid in Zoho).
  async recordPayment(params: ZohoPaymentParams): Promise<string | null> {
    if (!this.isConfigured()) return null;
    const accessToken = await this.refreshAccessToken();
    if (!accessToken) return null;
    const startTime = Date.now();
    try {
      const { response, data } = await this.zohoFetch(accessToken, "/books/v3/customerpayments", {
        method: "POST",
        body: JSON.stringify({
          customer_id: params.customerId,
          payment_mode: params.paymentMode || "banktransfer",
          amount: this.roundMoney(params.amount),
          date: params.date,
          reference_number: this.capRef(params.referenceNumber),
          invoices: [{ invoice_id: params.invoiceId, amount_applied: this.roundMoney(params.amount) }],
        }),
      });
      const duration = Date.now() - startTime;
      const success = data.code === 0;
      await storage.createIntegrationLog({
        serviceName: "zoho",
        operation: "record_payment",
        success,
        statusCode: response.status,
        errorMessage: success ? undefined : data.message,
        duration,
        requestPayload: JSON.stringify({ invoiceId: params.invoiceId, amount: params.amount }),
        responsePayload: success ? JSON.stringify({ paymentId: data.payment?.payment_id }) : undefined,
      });
      return success ? data.payment?.payment_id || null : null;
    } catch (error) {
      await storage.createIntegrationLog({
        serviceName: "zoho",
        operation: "record_payment",
        success: false,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        duration: Date.now() - startTime,
        requestPayload: JSON.stringify({ invoiceId: params.invoiceId }),
      });
      return null;
    }
  }

  // Issue a credit note for an invoice (ZATCA-compliant alternative to deletion).
  async createCreditNote(params: ZohoCreditNoteParams): Promise<string | null> {
    if (!this.isConfigured()) return null;
    const accessToken = await this.refreshAccessToken();
    if (!accessToken) return null;
    const startTime = Date.now();
    try {
      const taxIds = await this.resolveTaxIds(accessToken);
      const gross = params.lineItems.reduce((sum, item) => sum + item.quantity * item.rate, 0);
      const name = params.lineItems[0]?.name || `Credit note ${params.creditNoteNumber}`;
      const lineItems = this.buildTaxedLineItems(name, gross, params.taxAmountSar, taxIds);
      const { response, data } = await this.zohoFetch(accessToken, "/books/v3/creditnotes", {
        method: "POST",
        body: JSON.stringify({
          customer_id: params.customerId,
          // Credit-note number left to Zoho's own sequence; our invoice id kept as reference.
          date: params.date,
          reference_number: this.capRef(params.invoiceId),
          reason: params.reason,
          is_inclusive_tax: true,
          ...(params.currency ? { currency_code: params.currency } : {}),
          line_items: lineItems,
        }),
      });
      const duration = Date.now() - startTime;
      const creditNoteId = data.creditnote?.creditnote_id as string | undefined;
      const success = data.code === 0 && Boolean(creditNoteId);

      // Apply the credit note to the original invoice.
      if (success && creditNoteId) {
        await this.zohoFetch(accessToken, `/books/v3/creditnotes/${encodeURIComponent(creditNoteId)}/invoices`, {
          method: "POST",
          body: JSON.stringify({
            invoices: [{ invoice_id: params.invoiceId, amount_applied: this.roundMoney(gross) }],
          }),
        }).catch(() => undefined);
      }

      await storage.createIntegrationLog({
        serviceName: "zoho",
        operation: "create_credit_note",
        success,
        statusCode: response.status,
        errorMessage: success ? undefined : data.message,
        duration,
        requestPayload: JSON.stringify({ invoiceId: params.invoiceId, creditNoteNumber: params.creditNoteNumber }),
        responsePayload: success ? JSON.stringify({ creditNoteId }) : undefined,
      });
      return success ? creditNoteId! : null;
    } catch (error) {
      await storage.createIntegrationLog({
        serviceName: "zoho",
        operation: "create_credit_note",
        success: false,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        duration: Date.now() - startTime,
        requestPayload: JSON.stringify({ invoiceId: params.invoiceId }),
      });
      return null;
    }
  }

  // Record a cost as a Zoho expense (operational expenses, carrier payouts).
  async createExpense(params: ZohoExpenseParams): Promise<string | null> {
    if (!this.isConfigured()) return null;
    if (!params.accountId) {
      console.log("Zoho expense account not configured, skipping expense");
      return null;
    }
    const accessToken = await this.refreshAccessToken();
    if (!accessToken) return null;
    const startTime = Date.now();
    try {
      const { response, data } = await this.zohoFetch(accessToken, "/books/v3/expenses", {
        method: "POST",
        body: JSON.stringify({
          account_id: params.accountId,
          paid_through_account_id: params.paidThroughAccountId,
          amount: this.roundMoney(params.amount),
          date: params.date,
          description: params.description,
          reference_number: this.capRef(params.referenceNumber),
          customer_id: params.customerId,
          ...(params.currency ? { currency_code: params.currency } : {}),
        }),
      });
      const duration = Date.now() - startTime;
      const success = data.code === 0;
      await storage.createIntegrationLog({
        serviceName: "zoho",
        operation: "create_expense",
        success,
        statusCode: response.status,
        errorMessage: success ? undefined : data.message,
        duration,
        requestPayload: JSON.stringify({ amount: params.amount, reference: params.referenceNumber }),
        responsePayload: success ? JSON.stringify({ expenseId: data.expense?.expense_id }) : undefined,
      });
      return success ? data.expense?.expense_id || null : null;
    } catch (error) {
      await storage.createIntegrationLog({
        serviceName: "zoho",
        operation: "create_expense",
        success: false,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        duration: Date.now() - startTime,
        requestPayload: JSON.stringify({ amount: params.amount }),
      });
      return null;
    }
  }

  async deleteExpense(zohoExpenseId: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    const accessToken = await this.refreshAccessToken();
    if (!accessToken) return false;
    try {
      const { data } = await this.zohoFetch(accessToken, `/books/v3/expenses/${encodeURIComponent(zohoExpenseId)}`, {
        method: "DELETE",
      });
      return data.code === 0;
    } catch {
      return false;
    }
  }

  // Find an existing contact by email (for dedup before creating).
  async findContactByEmail(email: string): Promise<string | null> {
    if (!this.isConfigured() || !email) return null;
    const accessToken = await this.refreshAccessToken();
    if (!accessToken) return null;
    try {
      const { data } = await this.zohoFetch(accessToken, "/books/v3/contacts", {
        method: "GET",
        query: { email },
      });
      const contacts: Array<{ contact_id: string }> = data?.contacts || [];
      return contacts[0]?.contact_id || null;
    } catch {
      return null;
    }
  }

  async syncInvoice(invoiceId: string, params: ZohoInvoiceParams, zohoInvoiceId?: string): Promise<ZohoInvoiceResult> {
    if (!this.isConfigured()) {
      console.log("Zoho not configured, skipping invoice sync");
      return { zohoInvoiceId: "", invoiceUrl: "" };
    }

    if (zohoInvoiceId) {
      const updated = await this.updateInvoice(zohoInvoiceId, params);
      return updated ? { zohoInvoiceId, invoiceUrl: "" } : { zohoInvoiceId: "", invoiceUrl: "" };
    }

    const result = await this.createInvoice(params);
    return result || { zohoInvoiceId: "", invoiceUrl: "" };
  }
  
  async syncCustomer(params: ZohoCustomerParams): Promise<string> {
    if (!this.isConfigured()) {
      console.log("Zoho not configured, skipping customer sync");
      return "";
    }

    // Dedup: reuse an existing Zoho contact with the same email and refresh its
    // details instead of creating a duplicate.
    const existingId = await this.findContactByEmail(params.email);
    if (existingId) {
      await this.updateCustomer(existingId, params);
      return existingId;
    }

    const result = await this.createCustomer(params);
    return result || "";
  }
}

export const zohoService = new ZohoService();
