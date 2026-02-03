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
      
      if (data.error) {
        console.error("Zoho token refresh error:", data.error);
        return null;
      }
      
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
      
      if (data.api_domain) {
        this.apiDomain = data.api_domain;
      }
      
      console.log("Zoho access token refreshed successfully");
      return this.accessToken || null;
    } catch (error) {
      console.error("Zoho token refresh failed:", error);
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
      
      if (data.code !== 0) {
        console.error("Zoho invoice creation error:", data.message);
        return null;
      }
      
      console.log("Zoho invoice created:", data.invoice?.invoice_id);
      return {
        zohoInvoiceId: data.invoice.invoice_id,
        invoiceUrl: data.invoice.invoice_url || "",
      };
    } catch (error) {
      console.error("Zoho invoice creation failed:", error);
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
        contactPayload.contact_name_in_secondary_language = params.nameAr.substring(0, 99);
      }
      if (params.companyNameAr) {
        contactPayload.company_name_in_secondary_language = params.companyNameAr.substring(0, 99);
      }
      
      // Build billing address in secondary language (Arabic)
      // Zoho KSA has strict limits - only include essential fields
      const billingAddressAr: Record<string, string> = {};
      if (params.shippingContactNameAr) billingAddressAr.attention = params.shippingContactNameAr.substring(0, 50);
      if (params.shippingAddressLine1Ar) billingAddressAr.address = params.shippingAddressLine1Ar.substring(0, 50);
      if (params.shippingAddressLine2Ar) billingAddressAr.street2 = params.shippingAddressLine2Ar.substring(0, 50);
      if (params.shippingCityAr) billingAddressAr.city = params.shippingCityAr.substring(0, 50);
      if (params.shippingStateOrProvinceAr) billingAddressAr.state = params.shippingStateOrProvinceAr.substring(0, 50);
      
      if (Object.keys(billingAddressAr).length > 0) {
        contactPayload.billing_address_in_secondary_language = billingAddressAr;
      }
      
      // Build shipping address in secondary language (Arabic)
      const shippingAddressAr: Record<string, string> = {};
      if (params.shippingContactNameAr) shippingAddressAr.attention = params.shippingContactNameAr.substring(0, 50);
      if (params.shippingAddressLine1Ar) shippingAddressAr.address = params.shippingAddressLine1Ar.substring(0, 50);
      if (params.shippingAddressLine2Ar) shippingAddressAr.street2 = params.shippingAddressLine2Ar.substring(0, 50);
      if (params.shippingCityAr) shippingAddressAr.city = params.shippingCityAr.substring(0, 50);
      if (params.shippingStateOrProvinceAr) shippingAddressAr.state = params.shippingStateOrProvinceAr.substring(0, 50);
      
      if (Object.keys(shippingAddressAr).length > 0) {
        contactPayload.shipping_address_in_secondary_language = shippingAddressAr;
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
      
      if (data.code !== 0) {
        console.error("Zoho customer creation error:", data.message);
        return null;
      }
      
      console.log("Zoho customer created:", data.contact?.contact_id);
      return data.contact.contact_id;
    } catch (error) {
      console.error("Zoho customer creation failed:", error);
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

    try {
      // DEBUG: Log incoming params to verify data
      console.log("=== ZOHO UPDATE DEBUG ===");
      console.log("English fields received:");
      console.log("  shippingContactName:", params.shippingContactName);
      console.log("  shippingAddressLine1:", params.shippingAddressLine1);
      console.log("  shippingCity:", params.shippingCity);
      console.log("  shippingStateOrProvince:", params.shippingStateOrProvince);
      console.log("Arabic fields received:");
      console.log("  shippingContactNameAr:", params.shippingContactNameAr);
      console.log("  shippingAddressLine1Ar:", params.shippingAddressLine1Ar);
      console.log("  shippingCityAr:", params.shippingCityAr);
      console.log("  nameAr:", params.nameAr);
      console.log("=========================");
      
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
      if (params.nameAr) {
        contactPayload.contact_name_in_secondary_language = params.nameAr.substring(0, 99);
      }
      if (params.companyNameAr) {
        contactPayload.company_name_in_secondary_language = params.companyNameAr.substring(0, 99);
      }
      
      // Build billing address in secondary language (Arabic)
      // Zoho KSA has strict limits - only include essential fields
      const billingAddressAr: Record<string, string> = {};
      if (params.shippingContactNameAr) billingAddressAr.attention = params.shippingContactNameAr.substring(0, 50);
      if (params.shippingAddressLine1Ar) billingAddressAr.address = params.shippingAddressLine1Ar.substring(0, 50);
      if (params.shippingAddressLine2Ar) billingAddressAr.street2 = params.shippingAddressLine2Ar.substring(0, 50);
      if (params.shippingCityAr) billingAddressAr.city = params.shippingCityAr.substring(0, 50);
      if (params.shippingStateOrProvinceAr) billingAddressAr.state = params.shippingStateOrProvinceAr.substring(0, 50);
      
      if (Object.keys(billingAddressAr).length > 0) {
        contactPayload.billing_address_in_secondary_language = billingAddressAr;
      }
      
      // Build shipping address in secondary language (Arabic)
      const shippingAddressAr: Record<string, string> = {};
      if (params.shippingContactNameAr) shippingAddressAr.attention = params.shippingContactNameAr.substring(0, 50);
      if (params.shippingAddressLine1Ar) shippingAddressAr.address = params.shippingAddressLine1Ar.substring(0, 50);
      if (params.shippingAddressLine2Ar) shippingAddressAr.street2 = params.shippingAddressLine2Ar.substring(0, 50);
      if (params.shippingCityAr) shippingAddressAr.city = params.shippingCityAr.substring(0, 50);
      if (params.shippingStateOrProvinceAr) shippingAddressAr.state = params.shippingStateOrProvinceAr.substring(0, 50);
      
      if (Object.keys(shippingAddressAr).length > 0) {
        contactPayload.shipping_address_in_secondary_language = shippingAddressAr;
      }
      
      // DEBUG: Log full payload being sent
      console.log("=== ZOHO API PAYLOAD ===");
      console.log("billing_address:", JSON.stringify(contactPayload.billing_address, null, 2));
      console.log("shipping_address:", JSON.stringify(contactPayload.shipping_address, null, 2));
      console.log("billing_address_in_secondary_language:", JSON.stringify(contactPayload.billing_address_in_secondary_language, null, 2));
      console.log("shipping_address_in_secondary_language:", JSON.stringify(contactPayload.shipping_address_in_secondary_language, null, 2));
      console.log("========================");
      
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
      
      if (data.code !== 0) {
        console.error("Zoho customer update error:", data.message, "Response:", JSON.stringify(data, null, 2));
        return false;
      }
      
      console.log("Zoho customer updated successfully:", zohoCustomerId);
      return true;
    } catch (error) {
      console.error("Zoho customer update failed:", error);
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
