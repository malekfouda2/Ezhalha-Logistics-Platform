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
}

export interface ZohoInvoiceResult {
  zohoInvoiceId: string;
  invoiceUrl: string;
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

export class ZohoService {
  private accessToken: string | undefined;
  private tokenExpiry: number = 0;
  private tokenCredentialFingerprint: string | undefined;
  private tokenApiDomain: string | undefined;

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

  private buildInvoicePayload(params: ZohoInvoiceParams) {
    return {
      customer_id: params.customerId,
      invoice_number: params.invoiceNumber,
      date: params.date,
      due_date: params.dueDate,
      line_items: params.lineItems.map(item => ({
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        rate: item.rate,
      })),
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
        `${this.apiDomain}/books/v3/invoices?organization_id=${this.organizationId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(this.buildInvoicePayload(params)),
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
          body: JSON.stringify(this.buildInvoicePayload(params)),
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
        contact_name: params.name,
        contact_type: 'customer',
        customer_sub_type: params.customerType === 'individual' ? 'individual' : 'business',
        company_name: params.companyName || '',
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
        contact_name: params.name,
        customer_sub_type: params.customerType === 'individual' ? 'individual' : 'business',
        company_name: params.companyName || '',
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

    const result = await this.createCustomer(params);
    return result || "";
  }
}

export const zohoService = new ZohoService();
