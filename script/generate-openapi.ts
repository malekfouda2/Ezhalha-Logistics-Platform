/**
 * Generates docs/openapi.json from the Express route registrations.
 *
 * Why extraction rather than a decorator/registry rewrite: the API is ~291 routes living
 * in one 20k-line server/routes.ts, and re-plumbing all of them to feed a spec builder is
 * a refactor with real regression risk on payment and RBAC paths. Reading the source
 * instead gives a complete and always-current inventory — every path, method, auth
 * requirement and rate limit — without touching runtime behaviour.
 *
 * Coverage has two tiers:
 *   1. Every route is listed, with security and parameters derived from its middleware.
 *   2. Routes named in `DETAILED_OPERATIONS` also carry request/response schemas.
 *
 * Tier 2 is hand-maintained and starts with the endpoints mobile needs first. Anything not
 * in it is still discoverable, just without a body schema — and is reported as a coverage
 * number at the end of the run so the gap stays visible.
 *
 * Usage: npx tsx script/generate-openapi.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const SOURCE_FILES = [
  "server/routes.ts",
  "server/integrations/storage/routes.ts",
];

const OUTPUT = resolve(repoRoot, "docs/openapi.json");

// ── Route extraction ─────────────────────────────────────────────────────────

interface ExtractedRoute {
  method: string;
  path: string;
  middleware: string[];
  source: string;
  line: number;
  /** ClientPermission.X required by requireClientPermission(...) */
  clientPermission?: string;
  /** resource:action required by requireAdminPermission("resource", "action") */
  adminPermission?: string;
  /** permission required by requireOperationsPermission(...) */
  operationsPermission?: string;
  /** handler checks isPrimaryContact */
  primaryContactOnly: boolean;
  /** handler participates in the idempotency-key flow */
  idempotent: boolean;
  /** status codes the handler can return */
  statusCodes: string[];
  /** req.query.<name> read by the handler */
  queryParams: string[];
  /** handler streams a file rather than JSON */
  producesFile?: string;
}

const ROUTE_PATTERN =
  /\bapp\.(get|post|patch|put|delete)\(\s*"(\/api\/[^"]*)"\s*,?([^\n]*)/g;

/**
 * Everything below is read out of the handler source rather than hand-maintained, so the
 * generated docs cannot drift from the code the way API_DOCS.md did. Only prose summaries
 * and request/response schemas are authored by hand (see DETAILED_OPERATIONS).
 */
function extractRoutes(): ExtractedRoute[] {
  const routes: ExtractedRoute[] = [];
  const seen = new Set<string>();

  for (const relativePath of SOURCE_FILES) {
    const absolute = resolve(repoRoot, relativePath);
    const source = readFileSync(absolute, "utf8");
    const lines = source.split("\n");

    // Index every registration first, so each handler body can be bounded by the next one.
    //
    // Registrations come in two shapes: everything on one line, or `app.post(` with the
    // path and middleware wrapped onto following lines. Both must be captured — six of the
    // wrapped form exist, three of them client endpoints — so the signature is accumulated
    // until the handler arrow rather than read from a single line.
    const registrations: { lineIndex: number; method: string; path: string; rest: string }[] = [];
    lines.forEach((line, lineIndex) => {
      const opener = line.match(/\bapp\.(get|post|patch|put|delete)\(/);
      if (!opener) return;

      let signature = line;
      for (let ahead = 1; ahead <= 10 && !/=>\s*\{/.test(signature); ahead += 1) {
        signature += ` ${(lines[lineIndex + ahead] ?? "").trim()}`;
      }

      const match = signature.match(/\bapp\.(get|post|patch|put|delete)\(\s*"(\/api\/[^"]*)"\s*,?([\s\S]*)/);
      if (!match) return;

      registrations.push({
        lineIndex,
        method: match[1],
        // Only the signature is joined, so middleware on wrapped lines is still visible.
        path: match[2],
        rest: (match[3] ?? "").split(/=>\s*\{/)[0],
      });
    });

    registrations.forEach((registration, index) => {
      const key = `${registration.method.toUpperCase()} ${registration.path}`;
      if (seen.has(key)) {
        return; // same route registered twice (storage routes mount per driver)
      }
      seen.add(key);

      const bodyEnd = registrations[index + 1]?.lineIndex ?? lines.length;
      const body = lines.slice(registration.lineIndex, bodyEnd).join("\n");

      const middleware = registration.rest
        .split(",")
        .map((token) => token.trim().match(/^([a-zA-Z_][\w]*)/)?.[1] ?? "")
        .filter((token) => token && !["async", "req", "res"].includes(token));

      const fileType = body.match(/res\.setHeader\("Content-Type",\s*([^)]+)\)/)?.[1];

      routes.push({
        method: registration.method.toLowerCase(),
        path: registration.path,
        middleware,
        source: relativePath,
        line: registration.lineIndex + 1,
        clientPermission: registration.rest.match(/ClientPermission\.(\w+)/)?.[1],
        adminPermission: registration.rest
          .match(/requireAdminPermission\(\s*"([^"]+)"\s*,\s*"([^"]+)"/)
          ?.slice(1, 3)
          .join(":"),
        operationsPermission: registration.rest.match(/requireOperationsPermission\(\s*"([^"]+)"/)?.[1],
        // Usually the requirePrimaryContact middleware; a few handlers check inline instead.
        primaryContactOnly:
          /requirePrimaryContact/.test(registration.rest) || /!user\.isPrimaryContact/.test(body),
        idempotent: /idempotenc/i.test(body),
        statusCodes: [...new Set([...body.matchAll(/res\.status\((\d{3})\)/g)].map((m) => m[1]))].sort(),
        queryParams: [...new Set([...body.matchAll(/req\.query\.(\w+)/g)].map((m) => m[1]))],
        producesFile: fileType?.includes("pdf")
          ? "application/pdf"
          : fileType?.includes("html")
            ? "text/html"
            : undefined,
      });
    });
  }

  return routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

// ── Classification ───────────────────────────────────────────────────────────

const PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/config/branding",
  "/api/auth/login",
  "/api/auth/token",
  "/api/auth/token/otp",
  "/api/auth/refresh",
  "/api/auth/revoke",
  "/api/auth/logout",
  "/api/auth/otp/request",
  "/api/auth/otp/verify",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/applications",
]);

function classify(route: ExtractedRoute) {
  const middleware = route.middleware;
  const isPublic =
    PUBLIC_PATHS.has(route.path) ||
    route.path.startsWith("/api/public/") ||
    route.path.startsWith("/api/webhooks/") ||
    route.path.startsWith("/api/auth/reset-password");

  let audience = "shared";
  if (route.path.startsWith("/api/admin")) audience = "admin";
  else if (route.path.startsWith("/api/client")) audience = "client";
  else if (route.path.startsWith("/api/operations")) audience = "operations";
  else if (route.path.startsWith("/api/webhooks")) audience = "webhooks";
  else if (route.path.startsWith("/api/auth")) audience = "auth";

  const permission = middleware.find((m) => m.startsWith("require")) ?? null;
  const rateLimiter = middleware.find((m) => m.endsWith("Limiter")) ?? null;

  return { isPublic, audience, permission, rateLimiter };
}

function toOperationId(method: string, path: string): string {
  const cleaned = path
    .replace(/^\/api\//, "")
    .replace(/:([a-zA-Z]+)/g, "By-$1")
    .split(/[/\-_]/)
    .filter(Boolean)
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join("");
  return `${method}${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
}

function pathParameters(path: string) {
  return [...path.matchAll(/:([a-zA-Z][\w]*)/g)].map((match) => ({
    name: match[1],
    in: "path" as const,
    required: true,
    schema: { type: "string" as const },
  }));
}

function toOpenApiPath(path: string): string {
  return path.replace(/:([a-zA-Z][\w]*)/g, "{$1}");
}

// ── Hand-authored detail (tier 2) ────────────────────────────────────────────

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown) => ({ content: { "application/json": { schema } } });

const DETAILED_OPERATIONS: Record<string, Record<string, unknown>> = {
  "POST /api/auth/token": {
    summary: "Exchange credentials for an access + refresh token pair",
    description:
      "Native-client login. `username` accepts a username, an email address, or a phone " +
      "number. Sets no cookie. Rate limited to 5 failed attempts per 15 minutes per IP.",
    requestBody: { required: true, ...json(ref("TokenRequest")) },
    responses: {
      "200": { description: "Token pair issued", ...json(ref("TokenPair")) },
      "400": { description: "Validation error", ...json(ref("Error")) },
      "401": { description: "Invalid credentials", ...json(ref("Error")) },
      "403": { description: "Account or client account deactivated", ...json(ref("Error")) },
      "429": { description: "Too many failed attempts", ...json(ref("Error")) },
    },
  },
  "POST /api/auth/token/otp": {
    summary: "Exchange a verified email login code for a token pair",
    description: "Passwordless equivalent of POST /api/auth/token. Codes come from /api/auth/otp/request.",
    requestBody: { required: true, ...json(ref("OtpTokenRequest")) },
    responses: {
      "200": { description: "Token pair issued", ...json(ref("TokenPair")) },
      "401": { description: "Invalid or expired code", ...json(ref("Error")) },
    },
  },
  "POST /api/auth/refresh": {
    summary: "Rotate a refresh token",
    description:
      "Returns a new pair and invalidates the presented refresh token. Presenting an " +
      "already-rotated token is treated as a leaked chain: the entire token family is " +
      "revoked and the response carries code `refresh_reused`. Clients must single-flight " +
      "this call — concurrent refreshes will sign the user out.",
    requestBody: { required: true, ...json(ref("RefreshRequest")) },
    responses: {
      "200": { description: "New token pair", ...json(ref("TokenPair")) },
      "401": {
        description: "refresh_invalid | refresh_expired | refresh_reused",
        ...json(ref("Error")),
      },
    },
  },
  "POST /api/auth/revoke": {
    summary: "Revoke a refresh token (mobile sign-out)",
    description:
      "Deliberately unauthenticated so a client whose access token already expired can " +
      "still sign out. Always returns success, even for an unknown token.",
    requestBody: { required: true, ...json(ref("RefreshRequest")) },
    responses: { "200": { description: "Revoked", ...json(ref("Success")) } },
  },
  "GET /api/auth/devices": {
    summary: "List the signed-in devices for the current user",
    responses: {
      "200": { description: "Device list", ...json(ref("DeviceList")) },
      "401": { description: "Not authenticated", ...json(ref("Error")) },
    },
  },
  "DELETE /api/auth/devices/:id": {
    summary: "Sign out one device",
    description: "Revokes the whole token family for that device.",
    responses: {
      "200": { description: "Revoked", ...json(ref("Success")) },
      "404": { description: "Device not found", ...json(ref("Error")) },
    },
  },
  "GET /api/auth/me": {
    summary: "Current authenticated user",
    responses: {
      "200": { description: "Current user", ...json(ref("UserEnvelope")) },
      "401": { description: "Not authenticated", ...json(ref("Error")) },
    },
  },
  "POST /api/auth/login": {
    summary: "Cookie-session login (web app)",
    description: "Used by the web SPA. Native clients should use POST /api/auth/token instead.",
    responses: { "200": { description: "Session established", ...json(ref("UserEnvelope")) } },
  },
  "POST /api/auth/otp/request": {
    summary: "Send a 6-digit email login code",
    description: "Always returns success — never reveals whether the address exists.",
    responses: { "200": { description: "Accepted", ...json(ref("Success")) } },
  },
  "GET /api/health": {
    summary: "Liveness probe",
    responses: { "200": { description: "Service healthy" } },
  },

  // ── Client portal ──────────────────────────────────────────────────────────
  // The surface the mobile app builds against first. Guards, permissions,
  // primary-contact checks, idempotency and status codes are derived from the source;
  // the summaries and request schemas below are authored.

  "GET /api/client/account": { summary: "The signed-in user's client account" },
  "PATCH /api/client/account": {
    summary: "Update the client account profile",
    description: "Primary contact only. Bilingual (EN/AR) fields are accepted.",
  },
  "GET /api/client/fx-rate": {
    summary: "Display currency and the SAR conversion rate for this account",
    description:
      "Returns SAR for non-client sessions. Money is stored in SAR; this is the display " +
      "layer. Never convert on the client — send what the API returns.",
  },
  "GET /api/client/stats": { summary: "Dashboard counters for the account" },
  "GET /api/client/my-permissions": { summary: "Effective ClientPermission list for the caller" },

  "GET /api/client/users": { summary: "Users on the account" },
  "POST /api/client/users": { summary: "Invite a user to the account" },
  "PATCH /api/client/users/:userId/permissions": { summary: "Set a user's permissions" },
  "DELETE /api/client/users/:userId": { summary: "Remove a user from the account" },

  "GET /api/client/shipments": { summary: "List shipments" },
  "GET /api/client/shipments/recent": { summary: "Most recent shipments, for the dashboard" },
  "GET /api/client/shipments/:id": { summary: "One shipment, with items, documents and tracking" },
  "PATCH /api/client/shipments/:id": {
    summary: "Edit a shipment that has not been paid yet",
  },
  "POST /api/client/shipments": {
    summary: "Create a shipment directly (legacy flat form)",
    description:
      "The simple non-carrier path. The express flow is rates → checkout → pay → confirm.",
    requestBody: { required: true, ...json(ref("LegacyShipmentRequest")) },
  },
  "POST /api/client/shipments/rates": {
    summary: "Step 1 — quote carrier rates",
    description:
      "Returns rate options, each with a `quoteId` that step 2 consumes. Quotes expire. " +
      "A 502 means the carrier API failed, not that the request was invalid.",
    requestBody: { required: true, ...json(ref("ShipmentRateRequest")) },
    responses: {
      "200": { description: "Rate options with quote ids" },
      "400": { description: "Validation error", ...json(ref("Error")) },
      "502": { description: "Carrier API unavailable or rejected the lane", ...json(ref("Error")) },
    },
  },
  "POST /api/client/shipments/checkout": {
    summary: "Step 2 — turn a quote into a pending shipment",
    description:
      "Consumes a `quoteId` from step 1 and creates the shipment in a pending state. " +
      "Commercial-invoice items and a pickup preference may be attached here.",
    requestBody: { required: true, ...json(ref("CheckoutRequest")) },
  },
  "GET /api/client/shipments/:id/checkout-summary": {
    summary: "Priced summary of a pending shipment before payment",
  },
  "POST /api/client/shipments/pay": {
    summary: "Step 3 — pay for a pending shipment",
    description:
      "Charges through Tap. `tapTokenId` comes from the Tap SDK; omit it to charge the " +
      "account's default saved card. Browser clients are redirected; native clients must " +
      "use the mobile payment path (Workstream D) rather than following the redirect.",
    requestBody: { required: true, ...json(ref("ShipmentPaymentRequest")) },
  },
  "POST /api/client/shipments/confirm": {
    summary: "Step 4 — book with the carrier after payment settles",
    description: "Produces the label, tracking number and commercial invoice.",
    requestBody: { required: true, ...json(ref("ConfirmRequest")) },
  },
  "POST /api/client/shipments/:id/cancel": {
    summary: "Cancel a shipment",
    description:
      "A still-booked cancellation auto-issues a Tap refund and cancels any carrier " +
      "pickup. DHL exposes no cancel API, so the carrier-side cancel is a no-op there.",
  },
  "POST /api/client/shipments/:id/pay-later": {
    summary: "Place a shipment on credit terms instead of charging a card",
    description: "Requires an approved credit limit with sufficient available balance.",
  },
  "GET /api/client/shipments/:id/track": { summary: "Carrier tracking checkpoints" },
  "GET /api/client/shipments/:id/label.pdf": {
    summary: "Shipping label (PDF)",
    description:
      "Binary behind the auth guard. Native clients must fetch this with the " +
      "Authorization header and write it to a file — a plain URL open will 401.",
  },
  "GET /api/client/shipments/:id/commercial-invoice.pdf": { summary: "Commercial invoice (PDF)" },
  "GET /api/client/shipments/:id/commercial-invoice.html": { summary: "Commercial invoice (HTML)" },

  "POST /api/client/quick-quote": {
    summary: "Indicative price without creating a quote",
    description: "Read-only estimate for a price-check screen. Produces no `quoteId`.",
    requestBody: { required: true, ...json(ref("QuickQuoteRequest")) },
  },
  "GET /api/client/quotations/:id": { summary: "An admin-prepared quotation" },
  "PATCH /api/client/quotations/:id": { summary: "Amend a quotation before accepting it" },
  "POST /api/client/quotations/:id/accept-terms": { summary: "Accept a quotation's terms" },

  "GET /api/client/ddp/lanes": { summary: "Available Door-to-Door Freight lanes" },
  "POST /api/client/ddp/rates": {
    summary: "Quote a DDP (Door-to-Door Freight) shipment",
    requestBody: { required: true, ...json(ref("DdpRateRequest")) },
  },
  "POST /api/client/ddp/checkout": { summary: "Create a pending DDP shipment from a quote" },

  "POST /api/client/local/rates": { summary: "Quote a domestic shipment via local carriers" },
  "POST /api/client/local/checkout": { summary: "Create a pending domestic shipment" },

  "GET /api/client/sales-channels": { summary: "Connected storefronts" },
  "POST /api/client/sales-channels": { summary: "Connect a storefront" },
  "PATCH /api/client/sales-channels/:id": { summary: "Update a storefront connection" },
  "DELETE /api/client/sales-channels/:id": { summary: "Disconnect a storefront" },
  "POST /api/client/sales-channels/:id/sync": { summary: "Pull orders from the storefront now" },
  "GET /api/client/orders": { summary: "Storefront orders awaiting fulfilment" },
  "GET /api/client/orders/:id": { summary: "One storefront order" },
  "GET /api/client/orders/:id/rates": { summary: "Rate options for fulfilling an order" },
  "POST /api/client/orders/:id/fulfill": {
    summary: "Fulfil an order as a shipment",
    description: "409 means the order was already fulfilled.",
  },
  "GET /api/client/carrier-rules": { summary: "Automatic carrier-assignment rules" },
  "POST /api/client/carrier-rules": { summary: "Create a carrier-assignment rule" },
  "PATCH /api/client/carrier-rules/:id": { summary: "Update a carrier-assignment rule" },
  "DELETE /api/client/carrier-rules/:id": { summary: "Delete a carrier-assignment rule" },

  "GET /api/client/invoices": { summary: "Invoices" },
  "GET /api/client/invoices/:id/pdf": { summary: "Invoice (PDF)" },
  "GET /api/client/credit-invoices": { summary: "Credit (pay-later) invoices, 30-day terms" },
  "GET /api/client/credit-invoices/:id": { summary: "One credit invoice" },
  "GET /api/client/credit-access": { summary: "Credit status and available balance" },
  "POST /api/client/credit-access/request": { summary: "Request credit access" },
  "GET /api/client/sales-features": { summary: "Sales-feature entitlement status" },
  "POST /api/client/sales-features/request": { summary: "Request sales features" },
  "GET /api/client/extra-fees": { summary: "Extra charges raised against the account" },

  "GET /api/client/payments": { summary: "Payment history" },
  "GET /api/client/payments/tap/config": { summary: "Public Tap config for the checkout SDK" },
  "GET /api/client/payments/tap/saved-cards": { summary: "Saved cards" },
  "POST /api/client/payments/tap/saved-cards/:id/default": { summary: "Make a saved card the default" },
  "DELETE /api/client/payments/tap/saved-cards/:id": { summary: "Delete a saved card" },
  "POST /api/client/payments/create-charge": { summary: "Charge an outstanding invoice" },
  "POST /api/client/payments/create-intent": { summary: "Create a payment intent for an invoice" },

  "GET /api/client/abandoned-recovery/offers": { summary: "Recovery offers on abandoned shipments" },
  "POST /api/client/hs-code/confirm": { summary: "Confirm the HS code chosen for an item" },
  "GET /api/client/address-book": { summary: "Saved sender and recipient addresses" },
  "POST /api/client/shipments/extract-invoice-items": {
    summary: "Extract commercial-invoice line items from an uploaded invoice",
    description:
      "AI extraction (Gemini). Upload the file through the signed-URL flow first and pass " +
      "its reference. Returns items shaped for the `items` array on checkout.",
  },
  "POST /api/client/shipments/extract-package-details": {
    summary: "Extract package dimensions and weight from an uploaded document",
    description: "AI extraction (Gemini). Same upload-first pattern as invoice extraction.",
  },
};

const COMPONENT_SCHEMAS = {
  Error: {
    type: "object",
    properties: {
      error: { type: "string", description: "Human-readable message" },
      code: {
        type: "string",
        description:
          "Machine-readable code. Auth values: token_expired, token_invalid, " +
          "token_revoked, refresh_invalid, refresh_expired, refresh_reused.",
      },
    },
  },
  Success: {
    type: "object",
    properties: { success: { type: "boolean" } },
  },
  Device: {
    type: "object",
    required: ["deviceId"],
    properties: {
      deviceId: { type: "string", maxLength: 200, description: "Stable per-install id" },
      deviceName: { type: "string", maxLength: 200 },
      platform: { type: "string", enum: ["ios", "android", "unknown"], default: "unknown" },
      appVersion: { type: "string", maxLength: 50 },
    },
  },
  TokenRequest: {
    allOf: [
      ref("Device"),
      {
        type: "object",
        required: ["username", "password"],
        properties: {
          username: { type: "string", description: "Username, email, or phone number" },
          password: { type: "string", format: "password" },
        },
      },
    ],
  },
  OtpTokenRequest: {
    allOf: [
      ref("Device"),
      {
        type: "object",
        required: ["email", "code"],
        properties: {
          email: { type: "string", format: "email" },
          code: { type: "string", pattern: "^\\d{6}$" },
        },
      },
    ],
  },
  RefreshRequest: {
    type: "object",
    required: ["refreshToken"],
    properties: { refreshToken: { type: "string", minLength: 20 } },
  },
  TokenPair: {
    type: "object",
    properties: {
      accessToken: { type: "string", description: "JWT (HS256). Send as Authorization: Bearer." },
      refreshToken: {
        type: "string",
        description: "Opaque, rotating. Store in Keychain/Keystore, never AsyncStorage.",
      },
      expiresIn: { type: "integer", description: "Access-token lifetime in seconds" },
      tokenType: { type: "string", enum: ["Bearer"] },
      user: ref("User"),
    },
  },
  User: {
    type: "object",
    description: "Public user shape. Never includes the password hash.",
    properties: {
      id: { type: "string" },
      username: { type: "string" },
      email: { type: "string", format: "email" },
      phone: { type: "string", nullable: true },
      fullName: { type: "string", nullable: true },
      userType: { type: "string", enum: ["admin", "client", "operations"] },
      clientAccountId: { type: "string", nullable: true },
      isPrimaryContact: { type: "boolean" },
      isAccountManager: { type: "boolean" },
      mustChangePassword: { type: "boolean" },
      isActive: { type: "boolean" },
      lastLoginAt: { type: "string", format: "date-time", nullable: true },
      createdAt: { type: "string", format: "date-time" },
    },
  },
  UserEnvelope: {
    type: "object",
    properties: { user: ref("User") },
  },
  // ── Client portal request shapes ───────────────────────────────────────────
  // Transcribed from the Zod schemas in server/routes.ts. Keep in step with them.

  Address: {
    type: "object",
    required: ["name", "phone", "countryCode", "city", "postalCode", "addressLine1"],
    description:
      "stateOrProvince becomes required for countries in COUNTRIES_REQUIRING_STATE.",
    properties: {
      name: { type: "string", minLength: 1 },
      company: { type: "string" },
      phone: { type: "string", minLength: 1 },
      email: { type: "string", format: "email" },
      countryCode: { type: "string", minLength: 2, maxLength: 2, description: "ISO 3166-1 alpha-2" },
      city: { type: "string", minLength: 1 },
      postalCode: { type: "string", minLength: 1 },
      addressLine1: { type: "string", minLength: 1 },
      addressLine2: { type: "string" },
      stateOrProvince: { type: "string" },
      shortAddress: { type: "string", description: "Saudi national short address" },
    },
  },
  Package: {
    type: "object",
    required: ["weight", "length", "width", "height"],
    description: "Units are set by weightUnit and dimensionUnit on the enclosing request.",
    properties: {
      weight: { type: "number", exclusiveMinimum: 0 },
      length: { type: "number", exclusiveMinimum: 0 },
      width: { type: "number", exclusiveMinimum: 0 },
      height: { type: "number", exclusiveMinimum: 0 },
    },
  },
  ShipmentItem: {
    type: "object",
    required: ["itemName", "category", "countryOfOrigin", "price", "quantity"],
    description: "Commercial-invoice line. Required for cross-border shipments.",
    properties: {
      itemName: { type: "string", minLength: 1 },
      itemDescription: { type: "string" },
      category: { type: "string", minLength: 1 },
      material: { type: "string" },
      countryOfOrigin: { type: "string", minLength: 2, maxLength: 2 },
      hsCode: { type: "string" },
      hsCodeSource: { type: "string", enum: ["USER", "FEDEX", "HISTORY", "UNKNOWN"] },
      hsCodeConfidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW", "MISSING"] },
      price: { type: "number", minimum: 0 },
      quantity: { type: "integer", exclusiveMinimum: 0 },
      currency: { type: "string" },
    },
  },
  Pickup: {
    type: "object",
    description:
      "Carrier pickup preference. Booked after the shipment is booked; a pickup failure " +
      "sets pickupStatus=failed and never fails the shipment.",
    properties: {
      requested: { type: "boolean", default: false },
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      readyTime: { type: "string", pattern: "^\\d{2}:\\d{2}$", default: "09:00" },
      closeTime: { type: "string", pattern: "^\\d{2}:\\d{2}$", default: "17:00" },
      location: { type: "string", maxLength: 120 },
      instructions: { type: "string", maxLength: 500 },
    },
  },
  ShipmentRateRequest: {
    type: "object",
    required: ["shipmentType", "shipper", "recipient", "packages"],
    properties: {
      shipmentType: { type: "string", enum: ["domestic", "inbound", "outbound"] },
      isDdp: { type: "boolean", default: false },
      carrier: { type: "string" },
      serviceType: { type: "string" },
      shipper: ref("Address"),
      recipient: ref("Address"),
      packages: { type: "array", minItems: 1, items: ref("Package") },
      weightUnit: { type: "string", enum: ["LB", "KG"], default: "KG" },
      dimensionUnit: { type: "string", enum: ["IN", "CM"], default: "CM" },
      packageType: { type: "string", default: "YOUR_PACKAGING" },
      currency: { type: "string", default: "SAR" },
      shipDate: { type: "string" },
      items: { type: "array", items: ref("ShipmentItem") },
      tradeDocuments: { type: "array", maxItems: 5, items: { type: "object" } },
    },
  },
  CheckoutRequest: {
    type: "object",
    required: ["quoteId"],
    properties: {
      quoteId: { type: "string", format: "uuid", description: "From POST /api/client/shipments/rates" },
      items: { type: "array", items: ref("ShipmentItem") },
      tradeDocuments: { type: "array", maxItems: 5, items: { type: "object" } },
      pickup: ref("Pickup"),
    },
  },
  ShipmentPaymentRequest: {
    type: "object",
    required: ["shipmentId"],
    properties: {
      shipmentId: { type: "string", format: "uuid" },
      tapTokenId: { type: "string", description: "From the Tap SDK. Omit to use the default saved card." },
      saveCardForFuture: { type: "boolean" },
      returnPath: { type: "string", maxLength: 200, description: "Must start with /client/" },
    },
  },
  ConfirmRequest: {
    type: "object",
    required: ["shipmentId"],
    properties: {
      shipmentId: { type: "string", format: "uuid" },
      paymentIntentId: { type: "string" },
    },
  },
  QuickQuoteRequest: {
    type: "object",
    required: ["origin", "destination", "weightKg"],
    properties: {
      origin: {
        type: "object",
        required: ["countryCode"],
        properties: {
          countryCode: { type: "string", minLength: 2, maxLength: 2 },
          city: { type: "string" },
        },
      },
      destination: {
        type: "object",
        required: ["countryCode"],
        properties: {
          countryCode: { type: "string", minLength: 2, maxLength: 2 },
          city: { type: "string" },
        },
      },
      weightKg: { type: "number", exclusiveMinimum: 0 },
      length: { type: "number", minimum: 0 },
      width: { type: "number", minimum: 0 },
      height: { type: "number", minimum: 0 },
      pieces: { type: "integer", exclusiveMinimum: 0, default: 1 },
    },
  },
  DdpRateRequest: {
    type: "object",
    required: ["transportMethod", "shipper", "recipient", "supplierName", "supplierPhone", "packages"],
    properties: {
      transportMethod: { type: "string", enum: ["air", "sea", "domestic"] },
      shipper: { type: "object", description: "DDP origin" },
      recipient: ref("Address"),
      supplierName: { type: "string", minLength: 1 },
      supplierPhone: { type: "string", minLength: 1 },
      packages: { type: "array", minItems: 1, items: { type: "object" } },
      totalCbm: { type: "number", minimum: 0 },
    },
  },
  LegacyShipmentRequest: {
    type: "object",
    description: "Flat legacy create form. Prefer the rates → checkout → pay → confirm flow.",
    required: [
      "senderName", "senderAddress", "senderCity", "senderCountry", "senderPhone",
      "recipientName", "recipientAddress", "recipientCity", "recipientCountry",
      "recipientPhone", "weight", "packageType",
    ],
    properties: {
      senderName: { type: "string", minLength: 2 },
      senderAddress: { type: "string", minLength: 5 },
      senderCity: { type: "string", minLength: 2 },
      senderCountry: { type: "string", minLength: 2 },
      senderPhone: { type: "string", minLength: 8 },
      recipientName: { type: "string", minLength: 2 },
      recipientAddress: { type: "string", minLength: 5 },
      recipientCity: { type: "string", minLength: 2 },
      recipientCountry: { type: "string", minLength: 2 },
      recipientPhone: { type: "string", minLength: 8 },
      weight: { type: "string", description: "Decimal as a string" },
      dimensions: { type: "string" },
      packageType: { type: "string", minLength: 1 },
    },
  },

  DeviceList: {
    type: "object",
    properties: {
      devices: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            deviceName: { type: "string", nullable: true },
            platform: { type: "string" },
            appVersion: { type: "string", nullable: true },
            lastUsedAt: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
  },
};

const STATUS_TEXT: Record<string, string> = {
  "200": "Success",
  "201": "Created",
  "202": "Accepted — queued for approval",
  "204": "Deleted",
  "400": "Validation error",
  "401": "Unauthorized",
  "403": "Forbidden — wrong account, missing permission, or deactivated",
  "404": "Not found",
  "409": "Conflict — already processed",
  "413": "Payload too large",
  "422": "Unprocessable — semantically invalid",
  "429": "Rate limited",
  "500": "Internal server error",
  "502": "Upstream provider (carrier or payment gateway) failed",
};

const TAG_TITLES: Record<string, string> = {
  auth: "Authentication",
  client: "Client portal",
  admin: "Admin portal",
  operations: "Operations portal",
  webhooks: "Webhooks",
  shared: "Shared and public",
};

// ── Markdown ─────────────────────────────────────────────────────────────────

/** Describes one JSON-Schema property in a form that fits a table cell. */
function describeType(schema: any): string {
  if (!schema) return "—";
  if (schema.$ref) return `[\`${schema.$ref.split("/").pop()}\`](#schemas)`;
  if (schema.type === "array") return `array of ${describeType(schema.items)}`;
  if (schema.enum) return `enum: ${schema.enum.map((v: string) => `\`${v}\``).join(", ")}`;
  if (schema.format) return `${schema.type} (${schema.format})`;
  return schema.type ?? "object";
}

function describeConstraints(schema: any): string {
  if (!schema) return "";
  const parts: string[] = [];
  if (schema.default !== undefined) parts.push(`default \`${schema.default}\``);
  if (schema.minLength !== undefined && schema.minLength === schema.maxLength) {
    parts.push(`exactly ${schema.minLength} chars`);
  } else {
    if (schema.minLength !== undefined) parts.push(`min length ${schema.minLength}`);
    if (schema.maxLength !== undefined) parts.push(`max length ${schema.maxLength}`);
  }
  if (schema.exclusiveMinimum !== undefined) parts.push(`> ${schema.exclusiveMinimum}`);
  if (schema.minimum !== undefined) parts.push(`>= ${schema.minimum}`);
  if (schema.minItems !== undefined) parts.push(`min ${schema.minItems} item(s)`);
  if (schema.maxItems !== undefined) parts.push(`max ${schema.maxItems} item(s)`);
  if (schema.pattern) parts.push(`pattern \`${schema.pattern}\``);
  if (schema.description) parts.push(schema.description);
  return parts.join("; ");
}

/** Renders a component schema as a Markdown table so the doc stands on its own. */
function renderSchemaTable(name: string, heading = "Request body"): string[] {
  const schema: any = (COMPONENT_SCHEMAS as any)[name];
  if (!schema) return [`${heading}: \`${name}\``, ""];

  // allOf composes a base (e.g. Device) with extra fields; flatten one level.
  const parts: any[] = schema.allOf
    ? schema.allOf.map((p: any) => (p.$ref ? (COMPONENT_SCHEMAS as any)[p.$ref.split("/").pop()!] : p))
    : [schema];

  const properties: Record<string, any> = {};
  const required = new Set<string>();
  for (const part of parts) {
    Object.assign(properties, part?.properties ?? {});
    (part?.required ?? []).forEach((r: string) => required.add(r));
  }

  if (!Object.keys(properties).length) return [`${heading}: \`${name}\``, ""];

  const lines = [`${heading} — \`${name}\`:`, ""];
  if (schema.description) lines.push(`> ${schema.description}`, "");
  lines.push("| Field | Type | Required | Notes |", "| --- | --- | --- | --- |");
  for (const [field, property] of Object.entries(properties)) {
    lines.push(
      `| \`${field}\` | ${describeType(property)} | ${required.has(field) ? "yes" : "no"} | ${describeConstraints(property).replace(/\|/g, "\\|")} |`,
    );
  }
  lines.push("");
  return lines;
}

/**
 * Emits API_DOCS.md from the same extraction that produces the OpenAPI document.
 *
 * The previous API_DOCS.md was hand-maintained, which is why it drifted to covering 40 of
 * ~306 routes and still described payment providers that had been replaced. Generating it
 * means it cannot go stale again: re-run `npm run openapi` after changing routes.
 */
function writeMarkdown(
  routes: ExtractedRoute[],
  requirementsOf: (route: ExtractedRoute) => string[],
) {
  const out: string[] = [];
  const push = (...lines: string[]) => out.push(...lines);

  push(
    "# ezhalha API Documentation",
    "",
    "> **Generated file — do not edit by hand.**",
    "> Produced by `script/generate-openapi.ts` (`npm run openapi`) directly from the Express",
    "> route table, so it cannot drift from the code. To add detail to an endpoint, edit",
    "> `DETAILED_OPERATIONS` in that script and regenerate.",
    "> Machine-readable equivalent: [`docs/openapi.json`](docs/openapi.json).",
    "",
    `Covers **${routes.length} routes**.`,
    "",
    "## Contents",
    "",
    "- [Base URLs](#base-urls)",
    "- [Authentication](#authentication)",
    "- [Errors](#errors)",
    "- [Conventions](#conventions)",
    "- [The shipment flow](#the-shipment-flow)",
    "- [Endpoints](#endpoints)",
    "- [Schemas](#schemas)",
    "",
    "## Base URLs",
    "",
    "| Environment | URL |",
    "| --- | --- |",
    "| Staging | `https://staging.ezhalha.co` |",
    "| Production | `https://app.ezhalha.co` |",
    "| Local | `http://localhost:5000` |",
    "",
    "## Authentication",
    "",
    "Two mechanisms reach the same routes.",
    "",
    "**Cookie session — the web SPA.** `POST /api/auth/login` sets an httpOnly,",
    "`sameSite=lax` session cookie.",
    "",
    "**Bearer token — native clients.** `POST /api/auth/token` returns a 15-minute access",
    "token plus a rotating refresh token. Send `Authorization: Bearer <accessToken>`. A",
    "bearer request never creates a server session row.",
    "",
    "```http",
    "POST /api/auth/token",
    "Content-Type: application/json",
    "",
    "{",
    '  "username": "someone@example.com",',
    '  "password": "…",',
    '  "deviceId": "stable-per-install-id",',
    '  "platform": "ios",',
    '  "appVersion": "1.0.0"',
    "}",
    "```",
    "",
    "`username` accepts a username, an email, or a phone number. Passwordless login is",
    "`POST /api/auth/otp/request` then `POST /api/auth/token/otp`.",
    "",
    "**Refresh rotation.** `POST /api/auth/refresh` returns a new pair and invalidates the one",
    "presented. Replaying an already-rotated token is treated as a leaked chain and revokes",
    "the entire token family. **Clients must single-flight the refresh call** — concurrent",
    "refreshes will sign the user out.",
    "",
    "| Code | Meaning | Client action |",
    "| --- | --- | --- |",
    "| `token_expired` | access token past its exp | refresh and replay |",
    "| `token_invalid` | malformed or bad signature | refresh, then re-login |",
    "| `token_revoked` | password changed or account deactivated | re-login |",
    "| `refresh_expired` | refresh token older than 60 days | re-login |",
    "| `refresh_reused` | replay detected, family revoked | re-login |",
    "| `refresh_invalid` | unknown token | re-login |",
    "",
    "## Errors",
    "",
    "Errors return JSON, sometimes with a machine-readable `code`:",
    "",
    "```json",
    '{ "error": "Access token expired", "code": "token_expired" }',
    "```",
    "",
    "Some older handlers return `{ \"message\": … }` instead of `{ \"error\": … }`. Read",
    "`error ?? message` until that is normalised.",
    "",
    "An unknown `/api/*` path returns `404 { \"code\": \"not_found\" }` — never the SPA's HTML.",
    "",
    "## Conventions",
    "",
    "**Money is a string.** Every decimal column serialises as a string (`\"1234.56\"`), not a",
    "number. Do not parse and re-format it; render for display and send the original value",
    "back. SAR is the accounting truth — non-SAR is a display layer with an FX rate snapshot.",
    "",
    "**Idempotency.** Endpoints marked *Accepts `Idempotency-Key`* de-duplicate on that header.",
    "Reuse the same key when retrying a payment or booking.",
    "",
    "**Request bodies cap at 1MB.** Never base64 a file into JSON; use the signed-URL upload",
    "flow (`POST /api/uploads/request-url`). Oversized bodies return",
    "`413 { \"code\": \"payload_too_large\" }`.",
    "",
    "**Authenticated files.** Label and invoice PDFs are streamed behind the auth guard, so a",
    "plain URL open will 401 on a native client. Fetch with the Authorization header and write",
    "to a file first.",
    "",
    "**Rate limits.** Auth endpoints are limited per targeted account, with a coarse per-IP",
    "ceiling across `/api/auth`. Other endpoints are limited per authenticated user.",
    "",
    "**Permissions.** `client` users are gated by `ClientPermission` values; some actions",
    "additionally require the account's **primary contact**. `admin` users are gated by",
    "`resource:action` strings. Both are listed per endpoint below.",
    "",
    "## The shipment flow",
    "",
    "Express shipments are a four-step flow. Each step is a separate call and the shipment is",
    "not booked with the carrier until the last one.",
    "",
    "```",
    "1. POST /api/client/shipments/rates      → rate options, each with a quoteId",
    "2. POST /api/client/shipments/checkout   → pending shipment from a quoteId",
    "3. POST /api/client/shipments/pay        → charge via Tap   (or …/pay-later for credit)",
    "4. POST /api/client/shipments/confirm    → book, label, tracking number",
    "```",
    "",
    "Domestic shipments use `/api/client/local/rates` and `/api/client/local/checkout`;",
    "Door-to-Door Freight uses `/api/client/ddp/rates` and `/api/client/ddp/checkout`.",
    "",
    "## Endpoints",
    "",
  );

  const byTag = new Map<string, ExtractedRoute[]>();
  for (const route of routes) {
    const tag = classify(route).audience;
    byTag.set(tag, [...(byTag.get(tag) ?? []), route]);
  }

  for (const tag of ["auth", "client", "operations", "admin", "webhooks", "shared"]) {
    const group = byTag.get(tag);
    if (!group?.length) continue;

    push(`### ${TAG_TITLES[tag] ?? tag}`, "", `${group.length} routes.`, "");
    push("| Method | Path | Description | Requirements |", "| --- | --- | --- | --- |");

    for (const route of group) {
      const detail = DETAILED_OPERATIONS[`${route.method.toUpperCase()} ${route.path}`];
      const summary = ((detail?.summary as string) ?? "").replace(/\|/g, "\\|");
      const requirements = requirementsOf(route).join("<br>").replace(/\|/g, "\\|");
      push(
        `| \`${route.method.toUpperCase()}\` | \`${route.path}\` | ${summary || "—"} | ${requirements || "—"} |`,
      );
    }
    push("");

    // Expand the endpoints that carry authored detail.
    const documented = group.filter(
      (route) => DETAILED_OPERATIONS[`${route.method.toUpperCase()} ${route.path}`]?.description,
    );
    if (documented.length) {
      push(`#### ${TAG_TITLES[tag] ?? tag} — details`, "");
      for (const route of documented) {
        const detail = DETAILED_OPERATIONS[`${route.method.toUpperCase()} ${route.path}`]!;
        push(
          `##### \`${route.method.toUpperCase()} ${route.path}\``,
          "",
          `${detail.summary}`,
          "",
          `${detail.description}`,
          "",
        );
        const bodyRef = (detail.requestBody as any)?.content?.["application/json"]?.schema?.$ref;
        if (bodyRef) {
          push(...renderSchemaTable(bodyRef.split("/").pop()!));
        }
        const requirements = requirementsOf(route);
        if (requirements.length) push(`Requirements: ${requirements.join(" · ")}`, "");
        push(`Source: \`${route.source}:${route.line}\``, "");
      }
    }
  }

  // Shared object shapes referenced from the tables above.
  push("## Schemas", "");
  for (const name of [
    "Address",
    "Package",
    "ShipmentItem",
    "Pickup",
    "TokenPair",
    "User",
    "Error",
  ]) {
    push(`### \`${name}\``, "", ...renderSchemaTable(name, "Fields"));
  }

  push(
    "---",
    "",
    `Generated from ${SOURCE_FILES.map((f) => `\`${f}\``).join(" and ")} by \`script/generate-openapi.ts\`.`,
    "",
  );

  writeFileSync(resolve(repoRoot, "API_DOCS.md"), `${out.join("\n")}\n`);
}

// ── Build ────────────────────────────────────────────────────────────────────

function build() {
  const routes = extractRoutes();
  const paths: Record<string, Record<string, unknown>> = {};
  let detailed = 0;

  /** Human-readable requirements, all derived from the handler source. */
  function requirementsOf(route: ExtractedRoute): string[] {
    const { permission, rateLimiter } = classify(route);
    return [
      permission ? `Guard \`${permission}\`` : null,
      route.clientPermission ? `Permission \`ClientPermission.${route.clientPermission}\`` : null,
      route.adminPermission ? `Permission \`${route.adminPermission}\`` : null,
      route.operationsPermission ? `Permission \`${route.operationsPermission}\`` : null,
      route.primaryContactOnly ? "**Primary contact only**" : null,
      route.idempotent ? "Accepts `Idempotency-Key`" : null,
      rateLimiter ? `Rate limit \`${rateLimiter}\`` : null,
      route.producesFile ? `Returns \`${route.producesFile}\`` : null,
    ].filter(Boolean) as string[];
  }

  for (const route of routes) {
    const { isPublic, audience } = classify(route);
    const key = `${route.method.toUpperCase()} ${route.path}`;
    const detail = DETAILED_OPERATIONS[key];
    if (detail) detailed += 1;

    const openApiPath = toOpenApiPath(route.path);
    paths[openApiPath] = paths[openApiPath] || {};

    const requirements = requirementsOf(route);
    const notes = [
      requirements.length ? requirements.join(" · ") : null,
      `Source: \`${route.source}:${route.line}\``,
      detail ? null : "_Body schema not documented yet — see source._",
    ].filter(Boolean);

    // Status codes the handler actually returns, so clients can branch accurately.
    const derivedResponses: Record<string, unknown> = {};
    for (const code of route.statusCodes) {
      derivedResponses[code] = {
        description: STATUS_TEXT[code] ?? "See source",
        ...(code.startsWith("2") ? {} : json(ref("Error"))),
      };
    }
    if (!Object.keys(derivedResponses).some((c) => c.startsWith("2"))) {
      derivedResponses["200"] = { description: "Success" };
    }
    if (!isPublic) derivedResponses["401"] = { description: "Unauthorized", ...json(ref("Error")) };

    const queryParameters = route.queryParams.map((name) => ({
      name,
      in: "query" as const,
      required: false,
      schema: { type: "string" as const },
    }));
    const parameters = [...pathParameters(route.path), ...queryParameters];

    paths[openApiPath][route.method] = {
      operationId: toOperationId(route.method, route.path),
      tags: [audience],
      summary: (detail?.summary as string) ?? `${route.method.toUpperCase()} ${route.path}`,
      ...(detail ?? {}),
      description: [detail?.description, notes.join("\n\n")].filter(Boolean).join("\n\n"),
      ...(parameters.length ? { parameters } : {}),
      ...(isPublic ? { security: [] } : {}),
      responses: { ...derivedResponses, ...((detail?.responses as object) ?? {}) },
      "x-requirements": requirements,
      "x-source": `${route.source}:${route.line}`,
    };
  }

  writeMarkdown(routes, requirementsOf);

  const spec = {
    openapi: "3.0.3",
    info: {
      title: "ezhalha Platform API",
      version: "1.0.0",
      description: [
        "REST API shared by the web SPA, the React Native app, and internal tooling.",
        "",
        "## Authentication",
        "",
        "Two mechanisms reach the same routes:",
        "",
        "- **Cookie session** — the web SPA. `POST /api/auth/login` sets an httpOnly",
        "  `sameSite=lax` cookie.",
        "- **Bearer token** — native clients. `POST /api/auth/token` returns a 15-minute",
        "  access token plus a rotating refresh token. Send `Authorization: Bearer <token>`.",
        "",
        "A bearer request never creates a server session row.",
        "",
        "## Error shape",
        "",
        "Errors return `{ error: string }`, sometimes with a machine-readable `code`.",
        "Some older handlers return `{ message: string }` instead — clients should read",
        "`error ?? message`.",
        "",
        "## Generation",
        "",
        "This document is generated by `script/generate-openapi.ts` from the Express route",
        "table. Do not edit it by hand — add detail to `DETAILED_OPERATIONS` in that script.",
      ].join("\n"),
    },
    servers: [
      { url: "https://staging.ezhalha.co", description: "Staging" },
      { url: "https://app.ezhalha.co", description: "Production" },
      { url: "http://localhost:5000", description: "Local development" },
    ],
    tags: [
      { name: "auth", description: "Login, tokens, devices, password reset" },
      { name: "client", description: "Client portal — shipments, invoices, payments" },
      { name: "admin", description: "Admin portal — platform management and RBAC" },
      { name: "operations", description: "Operations portal — queues, tasks, assignments" },
      { name: "webhooks", description: "Inbound carrier and payment callbacks" },
      { name: "shared", description: "Cross-portal endpoints" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Access token from POST /api/auth/token.",
        },
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "connect.sid",
          description: "Web SPA session cookie.",
        },
      },
      schemas: COMPONENT_SCHEMAS,
    },
    security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    paths,
  };

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(spec, null, 2)}\n`);

  const byAudience = routes.reduce<Record<string, number>>((acc, route) => {
    acc[classify(route).audience] = (acc[classify(route).audience] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Wrote ${OUTPUT}`);
  console.log(`  routes discovered : ${routes.length}`);
  console.log(`  with body schemas : ${detailed} (${Math.round((detailed / routes.length) * 100)}%)`);
  console.log(
    `  by audience       : ${Object.entries(byAudience)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${name}=${count}`)
      .join(" ")}`,
  );
}

build();
