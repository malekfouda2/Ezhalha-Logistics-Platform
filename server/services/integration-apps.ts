import crypto from "crypto";
import nodemailer from "nodemailer";
import { storage } from "../storage";
import type { IntegrationAccount } from "@shared/schema";

export type IntegrationCategory = "shipping" | "payment" | "ai" | "accounting" | "notifications" | "storage";

export interface IntegrationCredentialField {
  key: string;
  label: string;
  required?: boolean;
  secret?: boolean;
  placeholder?: string;
  helpText?: string;
}

export interface IntegrationAppDefinition {
  key: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  credentialFields: IntegrationCredentialField[];
  settingsFields?: IntegrationCredentialField[];
  capabilities: string[];
  docsSummary: string;
}

const ALLOWED_PROVIDER_HOSTS: Record<string, Set<string>> = {
  fedex: new Set(["apis.fedex.com", "apis-sandbox.fedex.com", "documentapi.prod.fedex.com", "documentapitest.prod.fedex.com"]),
  dhl: new Set(["express.api.dhl.com"]),
  aramex: new Set(["ws.aramex.net", "ws.dev.aramex.net"]),
  tap: new Set(["api.tap.company"]),
  zoho: new Set([
    "accounts.zoho.com",
    "accounts.zoho.eu",
    "accounts.zoho.in",
    "accounts.zoho.com.au",
    "accounts.zoho.jp",
    "accounts.zohocloud.ca",
    "accounts.zoho.sa",
    "www.zohoapis.com",
    "www.zohoapis.eu",
    "www.zohoapis.in",
    "www.zohoapis.com.au",
    "www.zohoapis.jp",
    "www.zohoapis.ca",
    "www.zohoapis.sa",
  ]),
};

export const INTEGRATION_APP_DEFINITIONS: IntegrationAppDefinition[] = [
  {
    key: "fedex",
    name: "FedEx",
    category: "shipping",
    description: "Rates, shipment booking, tracking, labels, ETD document upload, HS lookup, and webhooks.",
    capabilities: ["Rates", "Shipments", "Tracking", "Labels", "ETD", "Webhooks"],
    docsSummary:
      "FedEx APIs use OAuth client credentials, an account number for rates/shipments, sandbox and production API hosts, and optional webhook/document settings.",
    credentialFields: [
      { key: "FEDEX_API_KEY", label: "API Key / Client ID", required: true, secret: true },
      { key: "FEDEX_SECRET_KEY", label: "Secret Key / Client Secret", required: true, secret: true },
      { key: "FEDEX_ACCOUNT_NUMBER", label: "Account Number", required: true },
      { key: "FEDEX_BASE_URL", label: "API Base URL", placeholder: "https://apis-sandbox.fedex.com" },
      { key: "FEDEX_DOCUMENT_BASE_URL", label: "Document Upload Base URL", placeholder: "https://documentapitest.prod.fedex.com" },
      { key: "FEDEX_WEBHOOK_SECRET", label: "Webhook Secret", secret: true },
    ],
    settingsFields: [
      { key: "FEDEX_REQUIRE_HS", label: "Require HS Codes For International Shipments", placeholder: "false" },
      { key: "FEDEX_STRICT_ADDRESS", label: "Strict Address Validation", placeholder: "false" },
    ],
  },
  {
    key: "dhl",
    name: "DHL Express",
    category: "shipping",
    description: "MyDHL API rates, shipment booking, tracking, labels, and commercial invoice data.",
    capabilities: ["Rates", "Shipments", "Tracking", "Labels", "Commercial Invoice"],
    docsSummary:
      "DHL MyDHL API uses an API key, API secret, shipper account number, and test/production MyDHL base URLs.",
    credentialFields: [
      { key: "DHL_API_KEY", label: "API Key", required: true, secret: true },
      { key: "DHL_API_SECRET", label: "API Secret", required: true, secret: true },
      { key: "DHL_ACCOUNT_NUMBER", label: "Account Number", required: true },
      { key: "DHL_BASE_URL", label: "Base URL", placeholder: "https://express.api.dhl.com/mydhlapi/test" },
    ],
  },
  {
    key: "aramex",
    name: "Aramex",
    category: "shipping",
    description: "Shipping Services API rates, shipment creation, tracking, and labels.",
    capabilities: ["Rates", "Shipments", "Tracking", "Labels"],
    docsSummary:
      "Aramex SOAP APIs use ClientInfo credentials: username, password, account number, account PIN, account entity, country code, and endpoint host.",
    credentialFields: [
      { key: "ARAMEX_USERNAME", label: "Username", required: true },
      { key: "ARAMEX_PASSWORD", label: "Password", required: true, secret: true },
      { key: "ARAMEX_ACCOUNT_NUMBER", label: "Account Number", required: true },
      { key: "ARAMEX_ACCOUNT_PIN", label: "Account PIN", required: true, secret: true },
      { key: "ARAMEX_ACCOUNT_ENTITY", label: "Account Entity", required: true, placeholder: "RUH" },
      { key: "ARAMEX_ACCOUNT_COUNTRY_CODE", label: "Account Country Code", required: true, placeholder: "SA" },
      { key: "ARAMEX_BASE_URL", label: "Base URL", placeholder: "https://ws.dev.aramex.net" },
    ],
    settingsFields: [
      { key: "ARAMEX_MOCK_MODE", label: "Allow Mock Responses", placeholder: "false" },
    ],
  },
  {
    key: "tap",
    name: "Tap Payments",
    category: "payment",
    description: "Embedded card payments, hosted fallback checkout, payment redirects, and saved-card phase support.",
    capabilities: ["Payments", "Embedded Card", "Hosted Checkout", "Saved Cards"],
    docsSummary:
      "Tap uses secret/public API keys, merchant ID for production embedded card flows, API base URL, and saved-card enablement flags.",
    credentialFields: [
      { key: "TAP_SECRET_KEY", label: "Secret Key", required: true, secret: true },
      { key: "TAP_PUBLIC_KEY", label: "Public Key", required: true },
      { key: "TAP_MERCHANT_ID", label: "Merchant ID", secret: true },
      { key: "TAP_BASE_URL", label: "Base URL", placeholder: "https://api.tap.company/v2" },
    ],
    settingsFields: [
      { key: "TAP_ENABLE_SAVED_CARDS", label: "Enable Saved Cards", placeholder: "false" },
    ],
  },
  {
    key: "gemini",
    name: "Gemini",
    category: "ai",
    description: "AI-assisted invoice item extraction and package list extraction.",
    capabilities: ["Invoice Extraction", "Package Extraction", "HS Assist"],
    docsSummary:
      "Gemini invoice/package extraction uses an API key and model selection. The current default model is gemini-2.5-flash-lite.",
    credentialFields: [
      { key: "GEMINI_API_KEY", label: "API Key", required: true, secret: true },
      { key: "GEMINI_INVOICE_EXTRACTION_MODEL", label: "Extraction Model", placeholder: "gemini-2.5-flash-lite" },
    ],
    settingsFields: [
      { key: "GEMINI_INVOICE_FALLBACK_ON_WARNING", label: "Fallback On Warning", placeholder: "false" },
    ],
  },
  {
    key: "zoho",
    name: "Zoho Books",
    category: "accounting",
    description: "Accounting and invoice synchronization.",
    capabilities: ["Accounting", "Invoice Sync"],
    docsSummary:
      "Zoho Books uses OAuth client credentials, refresh token, and organization ID.",
    credentialFields: [
      { key: "ZOHO_CLIENT_ID", label: "Client ID", required: true, secret: true },
      { key: "ZOHO_CLIENT_SECRET", label: "Client Secret", required: true, secret: true },
      { key: "ZOHO_REFRESH_TOKEN", label: "Refresh Token", required: true, secret: true },
      { key: "ZOHO_ORGANIZATION_ID", label: "Organization ID", required: true },
      { key: "ZOHO_ACCOUNTS_BASE_URL", label: "OAuth Accounts Base URL", placeholder: "https://accounts.zoho.sa" },
      { key: "ZOHO_API_BASE_URL", label: "API Base URL", placeholder: "https://www.zohoapis.sa" },
      { key: "ZOHO_VAT_TAX_ID", label: "VAT 15% Tax ID (optional)", placeholder: "auto-resolved from org if blank" },
      { key: "ZOHO_ZERO_TAX_ID", label: "Zero-rated Tax ID (optional)", placeholder: "auto-resolved from org if blank" },
      { key: "ZOHO_EXPENSE_ACCOUNT_ID", label: "Expense Account ID (operational expenses)" },
      { key: "ZOHO_CARRIER_EXPENSE_ACCOUNT_ID", label: "Carrier Expense Account ID" },
      { key: "ZOHO_PAID_THROUGH_ACCOUNT_ID", label: "Paid-Through Account ID (for expenses)" },
    ],
  },
  {
    key: "smtp",
    name: "SMTP Email",
    category: "notifications",
    description: "Transactional email delivery for applications, invoices, reminders, and shipment notices.",
    capabilities: ["Transactional Email", "Reminders", "Notifications"],
    docsSummary:
      "SMTP delivery uses a host, port, secure transport flag, username, password, and sender address.",
    credentialFields: [
      { key: "SMTP_HOST", label: "SMTP Host", required: true },
      { key: "SMTP_PORT", label: "SMTP Port", required: true, placeholder: "587" },
      { key: "SMTP_USER", label: "SMTP Username", required: true },
      { key: "SMTP_PASS", label: "SMTP Password", required: true, secret: true },
      { key: "SMTP_FROM", label: "Sender Address", required: true, placeholder: "noreply@example.com" },
    ],
    settingsFields: [
      { key: "SMTP_SECURE", label: "Use Secure SMTP", placeholder: "false" },
    ],
  },
  {
    key: "object-storage",
    name: "Object Storage",
    category: "storage",
    description: "Private document storage used for invoices, package sheets, labels, and trade documents.",
    capabilities: ["Private Uploads", "Trade Documents", "Invoice Documents"],
    docsSummary:
      "Object storage uses private and public object paths provisioned by the hosting environment. Restart the application after changing this account because upload routing is selected during startup.",
    credentialFields: [
      { key: "PRIVATE_OBJECT_DIR", label: "Private Object Directory", required: true },
      { key: "PUBLIC_OBJECT_SEARCH_PATHS", label: "Public Object Search Paths", required: true },
      { key: "DEFAULT_OBJECT_STORAGE_BUCKET_ID", label: "Default Bucket ID" },
    ],
  },
];

const managedIntegrationEnvKeys = new Set(
  INTEGRATION_APP_DEFINITIONS.flatMap((definition) => [
    ...definition.credentialFields.map((field) => field.key),
    ...(definition.settingsFields || []).map((field) => field.key),
  ]),
);
const initialIntegrationEnv = new Map(
  [...managedIntegrationEnvKeys].map((key) => [key, process.env[key]] as const),
);

export function getIntegrationDefinition(appKey: string) {
  return INTEGRATION_APP_DEFINITIONS.find((definition) => definition.key === appKey);
}

function getEncryptionKey() {
  if (process.env.NODE_ENV === "production" && !process.env.INTEGRATION_CONFIG_SECRET) {
    throw new Error("INTEGRATION_CONFIG_SECRET is required in production");
  }

  const secret =
    process.env.INTEGRATION_CONFIG_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.DATABASE_URL ||
    "development-integration-secret";
  return crypto.createHash("sha256").update(secret).digest();
}

function getCredentialFieldKeys(definition: IntegrationAppDefinition) {
  return new Set(definition.credentialFields.map((field) => field.key));
}

function getSettingsFieldKeys(definition: IntegrationAppDefinition) {
  return new Set((definition.settingsFields || []).map((field) => field.key));
}

function getAllowedFieldKeys(definition: IntegrationAppDefinition) {
  return new Set([...getCredentialFieldKeys(definition), ...getSettingsFieldKeys(definition)]);
}

function validateProviderUrl(appKey: string, key: string, value: string) {
  if (!key.endsWith("_BASE_URL") || !value.trim()) return;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL`);
  }

  const allowedHosts = ALLOWED_PROVIDER_HOSTS[appKey];
  if (parsed.protocol !== "https:" || !allowedHosts?.has(parsed.hostname.toLowerCase())) {
    throw new Error(`${key} must use an approved HTTPS provider host`);
  }
}

export function sanitizeIntegrationValues(
  definition: IntegrationAppDefinition,
  values: Record<string, string>,
  allowedKeys = getAllowedFieldKeys(definition),
) {
  return Object.fromEntries(
    Object.entries(values).map(([key, rawValue]) => {
      if (!allowedKeys.has(key)) {
        throw new Error(`Unsupported integration field: ${key}`);
      }

      const value = String(rawValue ?? "").trim();
      validateProviderUrl(definition.key, key, value);
      return [key, value];
    }),
  );
}

export function sanitizeIntegrationCredentials(
  definition: IntegrationAppDefinition,
  values: Record<string, string>,
) {
  return sanitizeIntegrationValues(definition, values, getCredentialFieldKeys(definition));
}

export function sanitizeIntegrationSettings(
  definition: IntegrationAppDefinition,
  values: Record<string, string>,
) {
  return sanitizeIntegrationValues(definition, values, getSettingsFieldKeys(definition));
}

export function encryptIntegrationPayload(payload: Record<string, string>) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptIntegrationPayload(value: string): Record<string, string> {
  const [ivText, tagText, encryptedText] = value.split(".");
  if (!ivText || !tagText || !encryptedText) {
    return {};
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivText, "base64"));
  decipher.setAuthTag(Buffer.from(tagText, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64")),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8"));
}

export function maskSecret(value?: string | null) {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export function serializeIntegrationAccount(account: IntegrationAccount, reveal = false) {
  const definition = getIntegrationDefinition(account.appKey);
  const credentials = decryptIntegrationPayload(account.credentialsEncrypted);
  const secretKeys = new Set(definition?.credentialFields.filter((field) => field.secret).map((field) => field.key) || []);

  return {
    ...account,
    credentials: Object.fromEntries(
      Object.entries(credentials).map(([key, value]) => [
        key,
        reveal || !secretKeys.has(key) ? value : maskSecret(value),
      ]),
    ),
    settings: account.settings ? JSON.parse(account.settings) : {},
    capabilities: account.capabilities ? JSON.parse(account.capabilities) : definition?.capabilities || [],
    credentialsEncrypted: undefined,
  };
}

export function serializeIntegrationAccountSafely(account: IntegrationAccount, reveal = false) {
  try {
    return serializeIntegrationAccount(account, reveal);
  } catch {
    const definition = getIntegrationDefinition(account.appKey);
    return {
      ...account,
      credentials: {},
      settings: {},
      capabilities: definition?.capabilities || [],
      credentialsEncrypted: undefined,
      lastTestSuccess: false,
      lastTestMessage: "Stored credentials could not be decrypted. Re-enter the credentials and save this account.",
    };
  }
}

export function buildEnvAccount(appKey: string) {
  const definition = getIntegrationDefinition(appKey);
  if (!definition) return null;

  // Use the .env-file snapshot taken at startup (initialIntegrationEnv), NOT live
  // process.env — otherwise credentials loaded from a default DB account at boot
  // (loadDefaultIntegrationAccountsIntoEnv) would make the env account appear
  // configured even after its .env keys were removed.
  const credentials: Record<string, string> = {};
  const settings: Record<string, string> = {};
  for (const field of definition.credentialFields) {
    const value = initialIntegrationEnv.get(field.key);
    if (value) credentials[field.key] = value;
  }
  for (const field of definition.settingsFields || []) {
    const value = initialIntegrationEnv.get(field.key);
    if (value) settings[field.key] = value;
  }

  const requiredFields = definition.credentialFields.filter((field) => field.required);
  const configured = requiredFields.every((field) => Boolean(credentials[field.key]));

  return {
    id: `env:${appKey}`,
    appKey,
    appName: definition.name,
    category: definition.category,
    accountName: configured ? "Environment default" : "Not configured",
    environment: process.env.NODE_ENV === "production" ? "production" : "sandbox",
    countryCode: credentials.ARAMEX_ACCOUNT_COUNTRY_CODE || null,
    region: null,
    priority: 100,
    isActive: configured,
    isDefault: true,
    credentials: Object.fromEntries(
      Object.entries(credentials).map(([key, value]) => {
        const field = [...definition.credentialFields, ...(definition.settingsFields || [])].find((candidate) => candidate.key === key);
        return [key, field?.secret ? maskSecret(value) : value];
      }),
    ),
    settings,
    capabilities: definition.capabilities,
    source: "environment",
    createdAt: null,
    updatedAt: null,
    lastTestedAt: null,
    lastTestSuccess: null,
    lastTestMessage: configured ? "Configured from environment variables" : "Missing required environment variables",
  };
}

export function applyIntegrationAccountToEnv(account: IntegrationAccount) {
  const definition = getIntegrationDefinition(account.appKey);
  if (!definition) return;

  const credentials = sanitizeIntegrationCredentials(
    definition,
    decryptIntegrationPayload(account.credentialsEncrypted),
  );
  const settings = sanitizeIntegrationSettings(
    definition,
    account.settings ? JSON.parse(account.settings) : {},
  );

  for (const [key, value] of Object.entries({ ...credentials, ...settings })) {
    if (typeof value === "string") {
      process.env[key] = value;
    }
  }
}

export async function loadDefaultIntegrationAccountsIntoEnv() {
  try {
    const accounts = await storage.getIntegrationAccounts();
    for (const key of managedIntegrationEnvKeys) {
      const initialValue = initialIntegrationEnv.get(key);
      if (initialValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = initialValue;
      }
    }
    accounts
      .filter((account) => account.isActive && account.isDefault && !account.countryCode)
      .forEach((account) => {
        try {
          applyIntegrationAccountToEnv(account);
        } catch {
          // Ignore invalid legacy records. Admins can correct them from the Apps page.
        }
      });
  } catch {
    // Database may not be initialized on first boot. Environment variables remain the fallback.
  }
}

export interface IntegrationAccountTestResult {
  success: boolean;
  message: string;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readProviderMessage(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return "";

  try {
    const json = JSON.parse(text);
    return json.message || json.error_description || json.error || json.title || JSON.stringify(json).slice(0, 240);
  } catch {
    return text.slice(0, 240);
  }
}

function normalizeBaseUrl(value: string | undefined, fallback: string) {
  return (value || fallback).replace(/\/+$/, "");
}

function providerStatusMessage(provider: string, response: Response, detail: string) {
  return `${provider} responded with HTTP ${response.status}${detail ? `: ${detail}` : ""}`;
}

function looksLikeAuthenticationFailure(detail: string) {
  return /auth|credential|invalid.+(?:account|password|user|pin|key)|unauthori[sz]ed|access denied/i.test(detail);
}

async function testFedEx(credentials: Record<string, string>, environment: string): Promise<IntegrationAccountTestResult> {
  const baseUrl = normalizeBaseUrl(
    credentials.FEDEX_BASE_URL,
    environment === "production" ? "https://apis.fedex.com" : "https://apis-sandbox.fedex.com",
  );
  const clientId = credentials.FEDEX_CLIENT_ID || credentials.FEDEX_API_KEY;
  const clientSecret = credentials.FEDEX_CLIENT_SECRET || credentials.FEDEX_SECRET_KEY;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId || "",
    client_secret: clientSecret || "",
  });

  const response = await fetchWithTimeout(`${baseUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const detail = await readProviderMessage(response);

  if (response.ok) {
    return { success: true, message: "FedEx OAuth validation succeeded. The account can authenticate with FedEx." };
  }

  return {
    success: false,
    message: providerStatusMessage("FedEx OAuth validation failed", response, detail),
  };
}

async function testDhl(credentials: Record<string, string>, environment: string): Promise<IntegrationAccountTestResult> {
  const baseUrl = normalizeBaseUrl(
    credentials.DHL_BASE_URL,
    environment === "production" ? "https://express.api.dhl.com/mydhlapi" : "https://express.api.dhl.com/mydhlapi/test",
  );
  const auth = Buffer.from(`${credentials.DHL_API_KEY}:${credentials.DHL_API_SECRET}`).toString("base64");

  const response = await fetchWithTimeout(`${baseUrl}/rates?accountNumber=${encodeURIComponent(credentials.DHL_ACCOUNT_NUMBER || "")}`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });
  const detail = await readProviderMessage(response);

  if (response.status === 401 || response.status === 403 || looksLikeAuthenticationFailure(detail)) {
    return {
      success: false,
      message: providerStatusMessage("DHL authentication failed", response, detail),
    };
  }

  if (response.status < 500 && response.status !== 404) {
    return {
      success: true,
      message: "DHL endpoint responded. Credentials are reachable; full validation happens during rate or shipment requests.",
    };
  }

  return {
    success: false,
    message: providerStatusMessage("DHL connectivity failed", response, detail),
  };
}

async function testAramex(credentials: Record<string, string>, environment: string): Promise<IntegrationAccountTestResult> {
  const baseUrl = normalizeBaseUrl(
    credentials.ARAMEX_BASE_URL,
    environment === "production" ? "https://ws.aramex.net" : "https://ws.dev.aramex.net",
  );
  const response = await fetchWithTimeout(`${baseUrl}/ShippingAPI.V2/RateCalculator/Service_1_0.svc/json/CalculateRate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      ClientInfo: {
        UserName: credentials.ARAMEX_USERNAME,
        Password: credentials.ARAMEX_PASSWORD,
        Version: "v1",
        AccountNumber: credentials.ARAMEX_ACCOUNT_NUMBER,
        AccountPin: credentials.ARAMEX_ACCOUNT_PIN,
        AccountEntity: credentials.ARAMEX_ACCOUNT_ENTITY,
        AccountCountryCode: credentials.ARAMEX_ACCOUNT_COUNTRY_CODE,
      },
      Transaction: { Reference1: "integration-account-test" },
      OriginAddress: { City: "Riyadh", CountryCode: credentials.ARAMEX_ACCOUNT_COUNTRY_CODE || "SA" },
      DestinationAddress: { City: "Riyadh", CountryCode: credentials.ARAMEX_ACCOUNT_COUNTRY_CODE || "SA" },
      ShipmentDetails: {
        PaymentType: "P",
        ProductGroup: "EXP",
        ProductType: "PDX",
        ActualWeight: { Unit: "KG", Value: 1 },
        ChargeableWeight: { Unit: "KG", Value: 1 },
        NumberOfPieces: 1,
      },
    }),
  });
  const detail = await readProviderMessage(response);

  if (response.status === 401 || response.status === 403 || looksLikeAuthenticationFailure(detail)) {
    return {
      success: false,
      message: providerStatusMessage("Aramex authentication failed", response, detail),
    };
  }

  if (response.status < 500 && response.status !== 404) {
    return {
      success: true,
      message: "Aramex endpoint responded. Credentials are reachable; full validation happens during rate or shipment requests.",
    };
  }

  return {
    success: false,
    message: providerStatusMessage("Aramex connectivity failed", response, detail),
  };
}

async function testTap(credentials: Record<string, string>): Promise<IntegrationAccountTestResult> {
  const baseUrl = normalizeBaseUrl(credentials.TAP_BASE_URL, "https://api.tap.company/v2");
  // Tap has no charge-list endpoint (GET /charges 404s), so probe the GET
  // charge-by-id endpoint with a sentinel id. A valid secret key is accepted
  // (Tap replies 400/404 for the bad id); an invalid key returns 401/403.
  const response = await fetchWithTimeout(`${baseUrl}/charges/chg_connectivity_probe`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${credentials.TAP_SECRET_KEY}`,
      Accept: "application/json",
    },
  });
  const detail = await readProviderMessage(response);

  if (response.status === 401 || response.status === 403 || looksLikeAuthenticationFailure(detail)) {
    return {
      success: false,
      message: providerStatusMessage("Tap authentication failed", response, detail),
    };
  }

  if (response.status < 500) {
    return { success: true, message: "Tap API reachable and the secret key was accepted." };
  }

  return {
    success: false,
    message: providerStatusMessage("Tap validation failed", response, detail),
  };
}

async function testGemini(credentials: Record<string, string>): Promise<IntegrationAccountTestResult> {
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(credentials.GEMINI_API_KEY || "")}`,
    { method: "GET", headers: { Accept: "application/json" } },
  );
  const detail = await readProviderMessage(response);

  if (response.ok) {
    return { success: true, message: "Gemini API key validation succeeded. Model listing is reachable." };
  }

  return {
    success: false,
    message: providerStatusMessage("Gemini validation failed", response, detail),
  };
}

async function testZoho(credentials: Record<string, string>): Promise<IntegrationAccountTestResult> {
  const body = new URLSearchParams({
    refresh_token: credentials.ZOHO_REFRESH_TOKEN || "",
    client_id: credentials.ZOHO_CLIENT_ID || "",
    client_secret: credentials.ZOHO_CLIENT_SECRET || "",
    grant_type: "refresh_token",
  });

  const accountsBaseUrl = (credentials.ZOHO_ACCOUNTS_BASE_URL || "https://accounts.zoho.sa").replace(/\/+$/, "");
  const response = await fetchWithTimeout(`${accountsBaseUrl}/oauth/v2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const detail = await readProviderMessage(response);

  if (response.ok) {
    return { success: true, message: "Zoho OAuth validation succeeded. The refresh token can generate access tokens." };
  }

  return {
    success: false,
    message: providerStatusMessage("Zoho validation failed", response, detail),
  };
}

async function testSmtp(
  credentials: Record<string, string>,
  settings: Record<string, string>,
): Promise<IntegrationAccountTestResult> {
  const port = Number.parseInt(credentials.SMTP_PORT || "", 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return { success: false, message: "SMTP Port must be a valid port number between 1 and 65535." };
  }

  const transporter = nodemailer.createTransport({
    host: credentials.SMTP_HOST,
    port,
    secure: settings.SMTP_SECURE === "true",
    auth: {
      user: credentials.SMTP_USER,
      pass: credentials.SMTP_PASS,
    },
  });
  await transporter.verify();

  return { success: true, message: "SMTP validation succeeded. The mail server accepted the configured credentials." };
}

function testObjectStorage(): IntegrationAccountTestResult {
  return {
    success: true,
    message: "Storage paths are structurally complete. Restart the application after storage changes so upload routing uses the new account.",
  };
}

export async function runIntegrationAccountTest(account: IntegrationAccount): Promise<IntegrationAccountTestResult> {
  const definition = getIntegrationDefinition(account.appKey);

  if (!definition) {
    return { success: false, message: "Unsupported app integration." };
  }

  try {
    const credentials = sanitizeIntegrationValues(
      definition,
      decryptIntegrationPayload(account.credentialsEncrypted),
    );
    const settings = sanitizeIntegrationSettings(
      definition,
      account.settings ? JSON.parse(account.settings) : {},
    );
    const missing = definition.credentialFields
      .filter((field) => field.required)
      .filter((field) => !credentials[field.key]?.trim())
      .map((field) => field.label);

    if (missing.length > 0) {
      return { success: false, message: `Missing required credentials: ${missing.join(", ")}` };
    }

    if (account.appKey === "fedex") return await testFedEx(credentials, account.environment);
    if (account.appKey === "dhl") return await testDhl(credentials, account.environment);
    if (account.appKey === "aramex") return await testAramex(credentials, account.environment);
    if (account.appKey === "tap") return await testTap(credentials);
    if (account.appKey === "gemini") return await testGemini(credentials);
    if (account.appKey === "zoho") return await testZoho(credentials);
    if (account.appKey === "smtp") return await testSmtp(credentials, settings);
    if (account.appKey === "object-storage") return testObjectStorage();

    return {
      success: true,
      message: "Credentials are structurally complete. Live validation is not available for this integration yet.",
    };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Provider validation timed out. Check the base URL and network access."
      : error instanceof Error
        ? error.message
        : "Provider validation failed.";

    return { success: false, message };
  }
}
