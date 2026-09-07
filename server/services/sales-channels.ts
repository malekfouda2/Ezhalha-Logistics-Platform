import crypto from "crypto";
import dns from "node:dns/promises";
import net from "node:net";
import type { InsertOrder, SalesChannel } from "@shared/schema";
import { logWarn } from "./logger";
import {
  needsRefresh,
  refreshZidCredentials,
  zidApiUrl,
  zidAuthHeaders,
  type ZidCredentials,
} from "./zid-oauth";

/**
 * Sales-channel platform adapters. Each adapter knows how to (a) verify an inbound
 * webhook's signature against the channel's stored secret and (b) normalize the raw
 * platform payload into our InsertOrder shape. Order items are informational only —
 * they are never used for customs (local shipments have none).
 *
 * P2 ships WooCommerce (per-store REST keys, no OAuth app, no external review) as the
 * reference adapter. Salla + Shopify (single Ezhalha-owned OAuth apps) slot in behind
 * the same interface once their developer apps are registered.
 */

export type SalesChannelPlatform = "woocommerce" | "shopify" | "salla" | "zid";

export interface NormalizedContext {
  clientAccountId: string;
  salesChannelId: string;
}

export interface FetchOrdersOptions {
  storeUrl: string;
  credentials: Record<string, string>;
  /** Only pull orders modified since this instant (null → recent window). */
  since?: Date | null;
  /**
   * Called when an adapter renews its own credentials mid-pull so the caller can persist
   * them. Without this a refreshed OAuth token would be used once and thrown away, and the
   * channel would keep re-refreshing on every sync until the old token finally expired.
   */
  onCredentialsRefreshed?: (credentials: Record<string, string>) => Promise<void>;
}

export interface SalesChannelAdapter {
  platform: SalesChannelPlatform;
  /**
   * Whether a pull needs the merchant's own store URL.
   *
   * True for WooCommerce, where we call the store's domain directly. False for Zid, whose
   * API lives at api.zid.sa and identifies the store from the OAuth token — requiring a URL
   * there would mean inventing one just to satisfy a check.
   */
  requiresStoreUrl?: boolean;
  /** Constant-time HMAC check over the raw request body. Fail-closed. */
  verifySignature(rawBody: Buffer | string, signature: string | undefined, secret: string): boolean;
  /** Map a raw platform order payload to an InsertOrder (throws if unusable). */
  normalizeOrder(payload: any, ctx: NormalizedContext): InsertOrder;
  /**
   * Pull raw order payloads from the store's API (poll model — no store-side
   * webhook required). Returns raw platform objects to feed through
   * normalizeOrder. Only defined for adapters that support pulling.
   */
  fetchOrders?(options: FetchOrdersOptions): Promise<any[]>;
}

// ---------------------------------------------------------------------------
// SSRF guard — store URLs are client-supplied and we make outbound requests to
// them, so reject anything resolving to a private / loopback / link-local host.
// ---------------------------------------------------------------------------

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  if (lower.startsWith("fe80")) return true; // link-local
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);
  return false;
}

/**
 * Normalize a client-entered store URL (`shop.acme.com` or `https://…`) to a
 * validated origin, rejecting non-public hosts. https is required in
 * production; http is tolerated only in non-prod for local testing.
 */
export async function assertSafeStoreUrl(rawUrl: string): Promise<URL> {
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) throw new Error("Store URL is required");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("Invalid store URL");
  }
  const isProd = process.env.NODE_ENV === "production";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && !isProd)) {
    throw new Error("Store URL must use https");
  }
  const host = url.hostname;
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Store URL host is not allowed");
  } else {
    const lowerHost = host.toLowerCase();
    if (lowerHost === "localhost" || lowerHost.endsWith(".local") || lowerHost.endsWith(".internal")) {
      throw new Error("Store URL host is not allowed");
    }
    const addresses = await dns.lookup(host, { all: true });
    if (addresses.some((a) => isPrivateIp(a.address))) {
      throw new Error("Store URL resolves to a private address");
    }
  }
  return url;
}

async function httpGetJson(url: string, headers: Record<string, string>, timeoutMs = 20000): Promise<{ body: any; headers: Headers }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Store API responded ${res.status}: ${text.slice(0, 200)}`);
    }
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      throw new Error("Store API returned a non-JSON response (check the store URL and API path)");
    }
    return { body, headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// KSA address / phone normalization — shared by ingest and the LOCAL create form
// so local carriers reliably accept the destination.
// ---------------------------------------------------------------------------

const CITY_CANONICAL: Record<string, string> = {
  riyadh: "Riyadh",
  "ar riyadh": "Riyadh",
  "al riyadh": "Riyadh",
  الرياض: "Riyadh",
  jeddah: "Jeddah",
  jiddah: "Jeddah",
  jedda: "Jeddah",
  جدة: "Jeddah",
  makkah: "Makkah",
  mecca: "Makkah",
  "makkah al mukarramah": "Makkah",
  مكة: "Makkah",
  madinah: "Madinah",
  medina: "Madinah",
  "al madinah": "Madinah",
  المدينة: "Madinah",
  dammam: "Dammam",
  الدمام: "Dammam",
  khobar: "Khobar",
  "al khobar": "Khobar",
  الخبر: "Khobar",
  dhahran: "Dhahran",
  taif: "Taif",
  "at taif": "Taif",
  abha: "Abha",
  tabuk: "Tabuk",
  buraidah: "Buraidah",
  "hail": "Hail",
  jubail: "Jubail",
  yanbu: "Yanbu",
};

export function normalizeKsaCity(raw?: string | null): string {
  const value = (raw || "").trim();
  if (!value) return "";
  const canonical = CITY_CANONICAL[value.toLowerCase()];
  return canonical || value;
}

/**
 * Normalize a Saudi phone number to E.164 `+9665XXXXXXXX`. Accepts local `05XXXXXXXX`,
 * `5XXXXXXXX`, `9665...`, `+9665...`, and spaced/dashed variants. Returns the trimmed
 * original if it doesn't look like a KSA mobile (carrier can reject/normalize further).
 */
export function normalizeKsaPhone(raw?: string | null): string {
  const value = (raw || "").trim();
  if (!value) return "";
  const digits = value.replace(/[^\d+]/g, "").replace(/^00/, "");
  let d = digits.replace(/^\+/, "");
  if (d.startsWith("966")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  // KSA mobile numbers are 9 digits starting with 5.
  if (/^5\d{8}$/.test(d)) return `+966${d}`;
  return value;
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// WooCommerce
// ---------------------------------------------------------------------------

class WooCommerceAdapter implements SalesChannelAdapter {
  platform = "woocommerce" as const;
  requiresStoreUrl = true;

  // WooCommerce signs webhooks as base64( HMAC-SHA256( rawBody, secret ) ) in the
  // `x-wc-webhook-signature` header.
  verifySignature(rawBody: Buffer | string, signature: string | undefined, secret: string): boolean {
    if (!signature || !secret) return false;
    const body = typeof rawBody === "string" ? Buffer.from(rawBody) : rawBody;
    const expected = crypto.createHmac("sha256", secret).update(body).digest("base64");
    return timingSafeEqual(expected, signature);
  }

  // Poll the WooCommerce REST API for orders modified since `since`. Uses HTTP
  // Basic auth with the store's consumer key/secret over HTTPS. No store-side
  // webhook required — our server calls out to the store.
  async fetchOrders({ storeUrl, credentials, since }: FetchOrdersOptions): Promise<any[]> {
    const consumerKey = credentials.consumer_key || credentials.consumerKey;
    const consumerSecret = credentials.consumer_secret || credentials.consumerSecret;
    if (!consumerKey || !consumerSecret) {
      throw new Error("WooCommerce channel is missing consumer_key / consumer_secret");
    }
    const base = await assertSafeStoreUrl(storeUrl);
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };

    const perPage = 100;
    const maxPages = 20; // hard cap: 2000 orders per sync run
    const collected: any[] = [];

    for (let page = 1; page <= maxPages; page++) {
      const endpoint = new URL("/wp-json/wc/v3/orders", base.origin);
      endpoint.searchParams.set("per_page", String(perPage));
      endpoint.searchParams.set("page", String(page));
      endpoint.searchParams.set("orderby", "modified");
      endpoint.searchParams.set("order", "asc");
      if (since) {
        endpoint.searchParams.set("modified_after", since.toISOString());
        endpoint.searchParams.set("dates_are_gmt", "true");
      }

      const { body, headers: resHeaders } = await httpGetJson(endpoint.toString(), headers);
      const batch: any[] = Array.isArray(body) ? body : [];
      collected.push(...batch);

      const totalPages = Number(resHeaders.get("x-wp-totalpages") || "1");
      if (batch.length < perPage || page >= totalPages) break;
    }

    return collected;
  }

  normalizeOrder(payload: any, ctx: NormalizedContext): InsertOrder {
    const externalOrderId = String(payload?.id ?? "").trim();
    if (!externalOrderId) {
      throw new Error("WooCommerce order payload is missing an id");
    }

    const shipping = payload.shipping || {};
    const billing = payload.billing || {};
    const firstName = shipping.first_name || billing.first_name || "";
    const lastName = shipping.last_name || billing.last_name || "";
    const customerName = `${firstName} ${lastName}`.trim() || billing.email || "Customer";

    const lineItems: any[] = Array.isArray(payload.line_items) ? payload.line_items : [];
    const items = lineItems.map((li) => ({
      name: li.name,
      quantity: Number(li.quantity ?? 1),
      price: li.price != null ? Number(li.price) : undefined,
      sku: li.sku || undefined,
    }));

    const totalWeight = lineItems.reduce((sum, li) => {
      const w = Number(li.weight ?? 0) * Number(li.quantity ?? 1);
      return sum + (Number.isFinite(w) ? w : 0);
    }, 0);
    const pieces = lineItems.reduce((sum, li) => sum + Number(li.quantity ?? 1), 0);

    // WooCommerce statuses → our order lifecycle. Everything shippable lands in `new`.
    const wooStatus = String(payload.status || "").toLowerCase();
    const status =
      wooStatus === "cancelled" || wooStatus === "refunded" || wooStatus === "failed"
        ? "cancelled"
        : wooStatus === "completed"
          ? "shipped"
          : "new";

    return {
      clientAccountId: ctx.clientAccountId,
      salesChannelId: ctx.salesChannelId,
      externalOrderId,
      externalOrderNumber: payload.number ? String(payload.number) : externalOrderId,
      status,
      customer: JSON.stringify({
        name: customerName,
        phone: normalizeKsaPhone(shipping.phone || billing.phone),
        email: billing.email || "",
      }),
      shipTo: JSON.stringify({
        address: [shipping.address_1, shipping.address_2].filter(Boolean).join(", "),
        city: normalizeKsaCity(shipping.city),
        region: shipping.state || "",
        country: shipping.country || "SA",
        postal: shipping.postcode || "",
      }),
      items: JSON.stringify(items),
      packageWeightKg: totalWeight > 0 ? totalWeight.toFixed(3) : null,
      packagePieces: pieces > 0 ? pieces : 1,
      currency: payload.currency || "SAR",
      orderTotal: payload.total != null ? String(payload.total) : null,
      syncedAt: new Date(),
    };
  }
}

// ---------------------------------------------------------------------------
// Zid
// ---------------------------------------------------------------------------

class ZidAdapter implements SalesChannelAdapter {
  platform = "zid" as const;
  // The store is identified by the OAuth token, not by a URL we call.
  requiresStoreUrl = false;

  /**
   * Zid does not sign its webhooks. It authenticates with HTTP Basic using a username and
   * password we hand it at subscription time, so the "signature" here is the whole
   * `Authorization: Basic …` header and the "secret" is the `user:pass` pair we generated.
   *
   * This is weaker than WooCommerce's HMAC — the credential travels on every request instead
   * of being proved without disclosure — which is why the ingest path treats a Zid webhook as
   * a prompt to re-read the order from the API rather than as trusted data.
   */
  verifySignature(_rawBody: Buffer | string, signature: string | undefined, secret: string): boolean {
    if (!signature || !secret) return false;
    const expected = `Basic ${Buffer.from(secret).toString("base64")}`;
    return timingSafeEqual(expected, signature.trim());
  }

  async fetchOrders({ credentials, since, onCredentialsRefreshed }: FetchOrdersOptions): Promise<any[]> {
    let creds = credentials as unknown as ZidCredentials;
    if (!creds?.authorization || !creds?.access_token) {
      throw new Error("Zid channel is not connected — reconnect the store");
    }

    // Renew before the call rather than reacting to a 401: Zid tokens last a year, so a
    // reactive refresh would only ever be exercised in production, a year late.
    if (needsRefresh(creds)) {
      try {
        creds = await refreshZidCredentials(creds);
        await onCredentialsRefreshed?.(creds as unknown as Record<string, string>);
      } catch (error) {
        // Keep going with the existing token — it may still be valid, and failing the whole
        // sync because a pre-emptive refresh failed would be worse than a late refresh.
        logZidRefreshFailure(error);
      }
    }

    const headers = zidAuthHeaders(creds);
    const perPage = 50;
    const maxPages = 20; // hard cap: 1000 orders per sync run
    const collected: any[] = [];

    for (let page = 1; page <= maxPages; page++) {
      const endpoint = new URL(zidApiUrl("/v1/managers/store/orders"));
      endpoint.searchParams.set("page", String(page));
      endpoint.searchParams.set("per_page", String(perPage));
      // `default` is the only payload type that carries the products; `simple` omits them.
      endpoint.searchParams.set("payload_type", "default");
      if (since) {
        endpoint.searchParams.set("date_attribute", "updated_at");
        endpoint.searchParams.set("date_from", formatZidDate(since));
      }

      const { body } = await httpGetJson(endpoint.toString(), headers);
      // Zid wraps the collection; tolerate the bare array too in case a payload type differs.
      const batch: any[] = Array.isArray(body?.orders)
        ? body.orders
        : Array.isArray(body?.data)
          ? body.data
          : Array.isArray(body)
            ? body
            : [];

      collected.push(...batch);
      if (batch.length < perPage) break;
    }

    return collected;
  }

  normalizeOrder(payload: any, ctx: NormalizedContext): InsertOrder {
    const externalOrderId = String(payload?.id ?? "").trim();
    if (!externalOrderId) {
      throw new Error("Zid order payload is missing an id");
    }

    const customer = payload.customer || {};
    // Zid exposes the destination under a few names depending on payload type. Take the first
    // that actually carries something rather than assuming one shape.
    const ship =
      payload.shipping?.address ||
      payload.shipping_address ||
      payload.address ||
      payload.delivery_address ||
      {};

    const customerName =
      [customer.name, customer.first_name, customer.last_name].filter(Boolean).join(" ").trim() ||
      ship.recipient_name ||
      "Customer";

    const rawItems: any[] = Array.isArray(payload.products)
      ? payload.products
      : Array.isArray(payload.items)
        ? payload.items
        : [];

    const items = rawItems.map((item) => ({
      name: item.name || item.product_name || "Item",
      quantity: Number(item.quantity ?? 1),
      price: item.price != null ? Number(item.price) : undefined,
      sku: item.sku || undefined,
    }));

    const totalWeight = rawItems.reduce((sum, item) => {
      const weight = Number(item.weight ?? 0) * Number(item.quantity ?? 1);
      return sum + (Number.isFinite(weight) ? weight : 0);
    }, 0);
    const pieces = rawItems.reduce((sum, item) => sum + Number(item.quantity ?? 1), 0);

    return {
      clientAccountId: ctx.clientAccountId,
      salesChannelId: ctx.salesChannelId,
      externalOrderId,
      externalOrderNumber: payload.code ? String(payload.code) : externalOrderId,
      status: mapZidStatus(payload),
      customer: JSON.stringify({
        name: customerName,
        phone: normalizeKsaPhone(customer.mobile || customer.phone || ship.mobile),
        email: customer.email || "",
      }),
      shipTo: JSON.stringify({
        address: [ship.street, ship.address_line, ship.district, ship.short_address]
          .filter(Boolean)
          .join(", "),
        city: normalizeKsaCity(ship.city || ship.city_name),
        region: ship.region || ship.province || "",
        country: ship.country_code || ship.country || "SA",
        postal: ship.postal_code || ship.zip || "",
      }),
      items: JSON.stringify(items),
      packageWeightKg: totalWeight > 0 ? totalWeight.toFixed(3) : null,
      packagePieces: pieces > 0 ? pieces : 1,
      currency: payload.currency_code || payload.currency || "SAR",
      orderTotal: payload.order_total != null ? String(payload.order_total) : null,
      syncedAt: new Date(),
    };
  }
}

/** Zid wants `2020-01-01T00:00:00.000+0000`, which is not what toISOString produces. */
function formatZidDate(date: Date): string {
  return `${date.toISOString().replace("Z", "")}+0000`;
}

/** Zid order statuses → our order lifecycle. Anything shippable lands in `new`. */
function mapZidStatus(payload: any): string {
  const raw = String(
    payload?.order_status?.code ?? payload?.order_status?.name ?? payload?.order_status ?? payload?.status ?? "",
  ).toLowerCase();

  if (raw.includes("cancel")) return "cancelled";
  if (raw.includes("deliver") && !raw.includes("indeliver")) return "delivered";
  if (raw.includes("indelivery") || raw.includes("in_delivery")) return "shipped";
  return "new";
}

function logZidRefreshFailure(error: unknown): void {
  logWarn("Zid token refresh failed, continuing with the existing token", {
    error: error instanceof Error ? error.message : String(error),
  });
}

const ADAPTERS: Record<string, SalesChannelAdapter> = {
  woocommerce: new WooCommerceAdapter(),
  zid: new ZidAdapter(),
};

export function getSalesChannelAdapter(platform: string): SalesChannelAdapter | undefined {
  return ADAPTERS[platform.toLowerCase()];
}

export function getSignatureHeader(platform: string, headers: Record<string, any>): string | undefined {
  switch (platform.toLowerCase()) {
    case "woocommerce":
      return headers["x-wc-webhook-signature"] as string | undefined;
    case "shopify":
      return headers["x-shopify-hmac-sha256"] as string | undefined;
    case "salla":
      return headers["x-salla-signature"] as string | undefined;
    case "zid":
      // Zid authenticates with HTTP Basic rather than signing the body.
      return headers["authorization"] as string | undefined;
    default:
      return undefined;
  }
}
