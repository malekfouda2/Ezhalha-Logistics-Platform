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
  smsa: new Set(["ecomapis.smsaexpress.com", "track.smsaexpress.com", "api.smsaexpress.com"]),
  naqel: new Set(["api.naqelexpress.com", "webservices.naqelksa.com"]),
  jt: new Set(["openapi.jtexpress.com.sa", "uat-openapi.jtexpress.com.sa", "openapi.jtjms-me.com"]),
  redbox: new Set(["api.redboxsa.com", "api.redbox.global", "api.redboxglobal.com"]),
  zajil: new Set(["api.zajil-express.com"]),
  imile: new Set(["openapi.52imile.cn", "openapi.imile.com"]),
  spl: new Set([
    "api.splonline.com.sa",
    "apis.splonline.com.sa",
    "b2b.splonline.com.sa",
    "b2bapi.splonline.com.sa",
    "sandbox.splonline.com.sa",
    "uat-api.splonline.com.sa",
  ]),
  fizzpa: new Set(["rest.fizzpa.net"]),
  shipox: new Set(["prodapi.shipox.com", "api.shipox.com"]),
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

// Contact-channel settings for a carrier, keyed by the carrier's env prefix (FEDEX / DHL / ARAMEX
// …). Surfaced in the operations hub so ops can call / email / WhatsApp the carrier directly.
function carrierContactFields(prefix: string): IntegrationCredentialField[] {
  return [
    { key: `${prefix}_SUPPORT_PHONE`, label: "Support Phone", placeholder: "+9668001000530", helpText: "Carrier customer-service number. Shown as a 'Call carrier' action in the Operations Hub." },
    { key: `${prefix}_SUPPORT_EMAIL`, label: "Support Email", placeholder: "support@carrier.com", helpText: "Carrier support email for the Operations Hub contact actions." },
    { key: `${prefix}_SUPPORT_WHATSAPP`, label: "Support WhatsApp", placeholder: "+9665XXXXXXXX", helpText: "Carrier WhatsApp number (international format). Optional." },
  ];
}

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
      { key: "FEDEX_TRACK_API_KEY", label: "Track API Key (Basic Integrated Visibility)", secret: true, helpText: "FedEx requires tracking to live in its own project/key, separate from Ship/Rate. Paste the Basic Integrated Visibility key here; tracking uses it, everything else uses the keys above. Leave blank to track with the Ship/Rate key." },
      { key: "FEDEX_TRACK_SECRET_KEY", label: "Track Secret Key", secret: true },
    ],
    settingsFields: [
      { key: "FEDEX_REQUIRE_HS", label: "Require HS Codes For International Shipments", placeholder: "false" },
      { key: "FEDEX_STRICT_ADDRESS", label: "Strict Address Validation", placeholder: "false" },
      { key: "FEDEX_TRACK_BASE_URL", label: "Track API Base URL", placeholder: "https://apis.fedex.com", helpText: "Base URL for the Basic Integrated Visibility (Track) project. Production: https://apis.fedex.com" },
      ...carrierContactFields("FEDEX"),
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
    settingsFields: [
      ...carrierContactFields("DHL"),
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
      ...carrierContactFields("ARAMEX"),
    ],
  },
  {
    key: "smsa",
    name: "SMSA Express",
    category: "shipping",
    description: "Domestic KSA local shipments: booking (AWB), A6 PDF labels, and tracking.",
    capabilities: ["Local", "Shipments", "Labels", "Tracking"],
    docsSummary:
      "SMSA's REST API authenticates with an apikey header plus a customer account (and optional passkey). Leave the base URL blank to use the default host.",
    credentialFields: [
      { key: "SMSA_API_KEY", label: "API Key", required: true, secret: true },
      { key: "SMSA_ACCOUNT_NUMBER", label: "Customer Account Number", required: true },
      { key: "SMSA_PASSKEY", label: "Pass Key (if issued)", secret: true },
      { key: "SMSA_BASE_URL", label: "API Base URL", placeholder: "https://ecomapis.smsaexpress.com" },
    ],
  },
  {
    key: "naqel",
    name: "Naqel Express",
    category: "shipping",
    description: "Domestic KSA local shipments: waybill creation, PDF labels, and tracking.",
    capabilities: ["Local", "Shipments", "Labels", "Tracking"],
    docsSummary:
      "Naqel's REST API authenticates with a ClientID + Password (and account number) sent as ClientInfo on each request. Leave the base URL blank to use the default host.",
    credentialFields: [
      { key: "NAQEL_CLIENT_ID", label: "Client ID", required: true, secret: true },
      { key: "NAQEL_PASSWORD", label: "Password", required: true, secret: true },
      { key: "NAQEL_ACCOUNT_NUMBER", label: "Client Account Number", required: true },
      { key: "NAQEL_API_VERSION", label: "API Version", placeholder: "1.0" },
      { key: "NAQEL_BASE_URL", label: "API Base URL", placeholder: "https://api.naqelexpress.com" },
    ],
  },
  {
    key: "jt",
    name: "J&T Express",
    category: "shipping",
    description: "Domestic KSA local shipments: waybill creation, PDF labels, and tracking.",
    capabilities: ["Local", "Shipments", "Labels", "Tracking"],
    docsSummary:
      "J&T's Open Platform authenticates with an API account + private key: each request carries an apiAccount header and a digest = Base64(MD5(bizContent + privateKey)); the customer code travels in the payload. Leave the base URL blank to use the default host.",
    credentialFields: [
      { key: "JT_API_ACCOUNT", label: "API Account", required: true, secret: true },
      { key: "JT_PRIVATE_KEY", label: "Private Key", required: true, secret: true },
      { key: "JT_CUSTOMER_CODE", label: "Customer Code", required: true },
      { key: "JT_BASE_URL", label: "API Base URL", placeholder: "https://openapi.jtexpress.com.sa" },
    ],
  },
  {
    key: "redbox",
    name: "RedBox",
    category: "shipping",
    description: "Domestic KSA local shipments: order creation, PDF labels, and tracking.",
    capabilities: ["Local", "Shipments", "Labels", "Tracking"],
    docsSummary:
      "RedBox's REST API authenticates with a Bearer API key; the merchant id travels in the payload. Leave the base URL blank to use the default host.",
    credentialFields: [
      { key: "REDBOX_API_KEY", label: "API Key", required: true, secret: true },
      { key: "REDBOX_MERCHANT_ID", label: "Merchant ID", required: true },
      { key: "REDBOX_BASE_URL", label: "API Base URL", placeholder: "https://api.redboxsa.com" },
    ],
  },
  {
    key: "zajil",
    name: "Zajil Express",
    category: "shipping",
    description: "Domestic KSA local shipments: booking (AWB), PDF labels, and tracking.",
    capabilities: ["Local", "Shipments", "Labels", "Tracking"],
    docsSummary:
      "Zajil's Shipment Integration API authenticates with a raw API key in the Authorization header plus a numeric customer ID. Domestic Saudi lanes only — Zajil's API carries no country or customs fields. Zajil allowlists partner server IPs, so share this server's egress IP with them or requests return 403. Keep the environment on Test until Zajil signs off the integration. Zajil has no rate API (add a Zajil rate card under Local Pricing) and no cancel API (cancel through Zajil operations). Zajil accounts flagged for TGA compliance reject bookings unless the recipient has a valid Saudi National Address short code (8 characters, e.g. RQWA3237) in their short-address field.",
    credentialFields: [
      { key: "ZAJIL_API_KEY", label: "API Key", required: true, secret: true, helpText: "Sent as the raw Authorization header value." },
      { key: "ZAJIL_CUSTOMER_ID", label: "Customer ID", required: true, placeholder: "534", helpText: "Numeric customer ID issued by Zajil." },
      { key: "ZAJIL_BASE_URL", label: "API Base URL", placeholder: "https://api.zajil-express.com" },
    ],
    settingsFields: [
      { key: "ZAJIL_ENVIRONMENT", label: "Environment (test or production)", placeholder: "test", helpText: "'test' routes to Zajil's staging Odoo — no real couriers or billing. Switch to 'production' only after Zajil signs off." },
    ],
  },
  {
    key: "spl",
    name: "SPL (Saudi Post)",
    category: "shipping",
    description: "Domestic KSA local shipments via Saudi Post: shipment/waybill creation, PDF labels, and tracking.",
    capabilities: ["Local", "Shipments", "Labels", "Tracking"],
    docsSummary:
      "SPL's B2B API sits behind an Azure API Management gateway: each request carries an Ocp-Apim-Subscription-Key header plus an OAuth2 client-credentials access token (client id + secret), and the partner contract id travels in the payload. Leave the base URL blank to use the default host. SPL has no rate API — pricing is a flat contract tariff, so add an SPL rate card under Local Pricing (same as Zajil). Confirm the exact credential field names against your SPL partner onboarding pack before going live.",
    credentialFields: [
      { key: "SPL_SUBSCRIPTION_KEY", label: "Subscription Key", required: true, secret: true, helpText: "Azure APIM key sent as the Ocp-Apim-Subscription-Key header." },
      { key: "SPL_CLIENT_ID", label: "Client ID", required: true, secret: true, helpText: "OAuth2 client-credentials client id." },
      { key: "SPL_CLIENT_SECRET", label: "Client Secret", required: true, secret: true, helpText: "OAuth2 client-credentials client secret." },
      { key: "SPL_CONTRACT_ID", label: "Contract / Customer ID", required: true, helpText: "SPL partner contract number sent in the shipment payload." },
      { key: "SPL_BASE_URL", label: "API Base URL", placeholder: "https://api.splonline.com.sa", helpText: "Leave blank to use the default SPL host." },
    ],
  },
  {
    key: "imile",
    name: "iMile",
    category: "shipping",
    description: "Domestic KSA/AE and cross-border shipments via iMile: live rates, order creation, base64 PDF labels, and tracking.",
    capabilities: ["Rates", "Local", "International", "Shipments", "Labels", "Tracking"],
    docsSummary:
      "iMile's OpenAPI wraps every request in a JSON envelope { customerId, sign, signMethod, timestamp, timeZone, accessToken, param } and uses a two-step auth: grant a 2-hour access token, then repeat it on each call. The `sign` is the API secret; with signMethod 'SimpleKey' (the default) it is sent verbatim. Live rates come from iMile's shipping-fee estimate (calShippingFee); when a lane's product is not enabled the platform falls back to the iMile rate card under Local Pricing, so keep one configured. Keep the base URL on the test host (openapi.52imile.cn) until iMile signs off, then switch to openapi.imile.com.",
    credentialFields: [
      { key: "IMILE_CUSTOMER_ID", label: "Customer ID", required: true, helpText: "iMile client code, e.g. C2102175701." },
      { key: "IMILE_SIGN", label: "Sign / API Secret", required: true, secret: true, helpText: "API secret issued by iMile; sent verbatim with signMethod 'SimpleKey'." },
      { key: "IMILE_BASE_URL", label: "API Base URL", placeholder: "https://openapi.52imile.cn", helpText: "Test: https://openapi.52imile.cn · Production: https://openapi.imile.com" },
    ],
    settingsFields: [
      { key: "IMILE_TIME_ZONE", label: "Time Zone", placeholder: "+3", helpText: "Account time-zone offset sent on each request (KSA = +3, UAE = +4)." },
      { key: "IMILE_SIGN_METHOD", label: "Sign Method", placeholder: "SimpleKey", helpText: "SimpleKey (default), MD5, or SHA256 — per your iMile contract." },
    ],
  },
  {
    key: "fizzpa",
    name: "Fizzpa",
    category: "shipping",
    description: "KSA last-mile aggregator reached through client-facing virtual carriers: order creation, PDF labels, and tracking.",
    capabilities: ["Local", "Shipments", "Labels", "Tracking"],
    docsSummary:
      "Fizzpa authenticates with a raw API key in the Authorization header (NOT a Bearer token) plus a required Referer header set to the URL Fizzpa registered for this account — a wrong Referer returns 401/403. Fizzpa exposes no rate API and no downstream-carrier selection: set up client-facing virtual carriers (Admin → Virtual Carriers) mapped to this provider, each with its own rate card under Local Pricing. City IDs are numeric and come from Fizzpa's Cities.xlsx (no live cities API), so paste a JSON name→id map into City ID Map, e.g. {\"riyadh\":1,\"jeddah\":2}. The chosen virtual courier is written onto the Fizzpa order note. Cancellation only works before pickup.",
    credentialFields: [
      { key: "FIZZPA_API_KEY", label: "API Key", required: true, secret: true, helpText: "Sent as the raw Authorization header value (no Bearer prefix)." },
      { key: "FIZZPA_REFERER", label: "Referer", placeholder: "https://app.ezhalha.co", helpText: "Exact Referer value Fizzpa registered for this account." },
      { key: "FIZZPA_CITY_MAP", label: "City ID Map (JSON)", helpText: "JSON map of city name → Fizzpa numeric CityId, e.g. {\"riyadh\":1,\"jeddah\":2}." },
      { key: "FIZZPA_BASE_URL", label: "API Base URL", placeholder: "https://rest.fizzpa.net/api", helpText: "Leave blank to use the default Fizzpa host." },
    ],
  },
  {
    key: "shipox",
    name: "Shipox",
    category: "shipping",
    description: "Delivery-management aggregator reached through client-facing virtual carriers: order creation and tracking.",
    capabilities: ["Local", "Shipments", "Tracking"],
    docsSummary:
      "Shipox is a tenant/customer API: authenticate with username + password to receive a JWT that the adapter caches and refreshes on 401. Shipox's rate API returns a blended, geocode-driven tariff with an opaque delivering carrier and exposes no downstream-carrier selection, so price off a rate card instead: set up client-facing virtual carriers (Admin → Virtual Carriers) mapped to this provider, each with its own rate card under Local Pricing. The chosen virtual courier is written onto the Shipox order note. Cancellation goes through Shipox operations.",
    credentialFields: [
      { key: "SHIPOX_USERNAME", label: "Username", required: true, helpText: "Shipox customer account username/email." },
      { key: "SHIPOX_PASSWORD", label: "Password", required: true, secret: true, helpText: "Shipox customer account password." },
      { key: "SHIPOX_BASE_URL", label: "API Base URL", placeholder: "https://prodapi.shipox.com", helpText: "Leave blank to use the default Shipox host." },
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

async function testZajil(credentials: Record<string, string>): Promise<IntegrationAccountTestResult> {
  if (!/^\d+$/.test((credentials.ZAJIL_CUSTOMER_ID || "").trim())) {
    return { success: false, message: "Customer ID must be a whole number (for example 534)." };
  }

  const baseUrl = normalizeBaseUrl(credentials.ZAJIL_BASE_URL, "https://api.zajil-express.com");
  // Zajil only enforces the API key on POST /api/shipment/create, and that books a real
  // shipment — so there is no way to validate the key without side effects. Probe the
  // city list instead: it proves the base URL, network path and IP allowlist, which is
  // where Zajil integrations actually fail. The key itself is proven at first booking.
  const response = await fetchWithTimeout(`${baseUrl}/api/cities`, {
    method: "GET",
    headers: { Authorization: credentials.ZAJIL_API_KEY || "", Accept: "application/json" },
  });
  const detail = await readProviderMessage(response);

  if (response.status === 403) {
    return {
      success: false,
      message: `Zajil rejected this server with HTTP 403${detail ? `: ${detail}` : ""}. Zajil allowlists partner IPs — send them this server's egress IP address.`,
    };
  }

  if (!response.ok) {
    return { success: false, message: providerStatusMessage("Zajil connectivity failed", response, detail) };
  }

  return {
    success: true,
    message:
      "Zajil is reachable and this server's IP is accepted. Note: Zajil only checks the API key when booking, so the key is confirmed on the first live shipment.",
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
    if (account.appKey === "zajil") return await testZajil(credentials);
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
