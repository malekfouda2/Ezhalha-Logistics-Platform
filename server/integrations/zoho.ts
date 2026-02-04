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

import { storage } from "../storage";

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
  private clientId: string | undefined;
  private clientSecret: string | undefined;
  private refreshToken: string | undefined;
  private organizationId: string | undefined;
  private accessToken: string | undefined;
  private tokenExpiry: number = 0;
  private apiDomain: string = 'https://www.zohoapis.sa';

  constructor() {
    this.clientId = process.env.ZOHO_CLIENT_ID;
    this.clientSecret = process.env.ZOHO_CLIENT_SECRET;
    this.refreshToken = process.env.ZOHO_REFRESH_TOKEN;
    this.organizationId = process.env.ZOHO_ORGANIZATION_ID;
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret && this.refreshToken && this.organizationId);
  }

  private async refreshAccessToken(): Promise<string | null> {
    if (!this.isConfigured()) {
      return null;
    }

    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const startTime = Date.now();
    try {
      const response = await fetch('https://accounts.zoho.sa/oauth/v2/token', {
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
      
      if (data.api_domain) {
        this.apiDomain = data.api_domain;
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
          body: JSON.stringify({
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
          }),
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

  async syncInvoice(invoiceId: string, params: ZohoInvoiceParams): Promise<ZohoInvoiceResult> {
    if (!this.isConfigured()) {
      console.log("Zoho not configured, skipping invoice sync");
      return { zohoInvoiceId: "", invoiceUrl: "" };
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
