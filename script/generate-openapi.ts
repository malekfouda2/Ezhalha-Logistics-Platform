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
}

const ROUTE_PATTERN =
  /\bapp\.(get|post|patch|put|delete)\(\s*"(\/api\/[^"]*)"\s*,?([^\n]*)/g;

function extractRoutes(): ExtractedRoute[] {
  const routes: ExtractedRoute[] = [];
  const seen = new Set<string>();

  for (const relativePath of SOURCE_FILES) {
    const absolute = resolve(repoRoot, relativePath);
    const source = readFileSync(absolute, "utf8");
    const lineStarts: number[] = [];
    let offset = 0;
    for (const line of source.split("\n")) {
      lineStarts.push(offset);
      offset += line.length + 1;
    }

    for (const match of source.matchAll(ROUTE_PATTERN)) {
      const [, method, path, rest] = match;
      const key = `${method.toUpperCase()} ${path}`;
      if (seen.has(key)) {
        continue; // same route registered twice (e.g. storage routes mounted per-driver)
      }
      seen.add(key);

      const middleware = (rest || "")
        .split(",")
        .map((token) => token.trim())
        .map((token) => token.match(/^([a-zA-Z_][\w]*)/)?.[1] ?? "")
        .filter((token) => token && token !== "async" && token !== "req" && token !== "res");

      const index = match.index ?? 0;
      const line = lineStarts.findIndex((start, i) =>
        index >= start && (i === lineStarts.length - 1 || index < lineStarts[i + 1]),
      );

      routes.push({
        method: method.toLowerCase(),
        path,
        middleware,
        source: relativePath,
        line: line + 1,
      });
    }
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

// ── Build ────────────────────────────────────────────────────────────────────

function build() {
  const routes = extractRoutes();
  const paths: Record<string, Record<string, unknown>> = {};
  let detailed = 0;

  for (const route of routes) {
    const { isPublic, audience, permission, rateLimiter } = classify(route);
    const key = `${route.method.toUpperCase()} ${route.path}`;
    const detail = DETAILED_OPERATIONS[key];
    if (detail) detailed += 1;

    const openApiPath = toOpenApiPath(route.path);
    paths[openApiPath] = paths[openApiPath] || {};

    const notes = [
      `Source: \`${route.source}:${route.line}\``,
      permission ? `Guard: \`${permission}\`` : null,
      rateLimiter ? `Rate limit: \`${rateLimiter}\`` : null,
      detail ? null : "_Schema not yet documented — see source._",
    ].filter(Boolean);

    paths[openApiPath][route.method] = {
      operationId: toOperationId(route.method, route.path),
      tags: [audience],
      summary: (detail?.summary as string) ?? `${route.method.toUpperCase()} ${route.path}`,
      ...(detail ?? {}),
      description: [detail?.description, notes.join(" · ")].filter(Boolean).join("\n\n"),
      ...(pathParameters(route.path).length ? { parameters: pathParameters(route.path) } : {}),
      ...(isPublic ? { security: [] } : {}),
      ...(detail?.responses
        ? {}
        : { responses: { "200": { description: "Success" }, "401": { description: "Unauthorized" } } }),
    };
  }

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
