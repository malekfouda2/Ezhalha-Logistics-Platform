import crypto from "crypto";
import dns from "node:dns/promises";
import net from "node:net";
import type { InsertOrder, SalesChannel } from "@shared/schema";

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

export type SalesChannelPlatform = "woocommerce" | "shopify" | "salla";

export interface NormalizedContext {
  clientAccountId: string;
  salesChannelId: string;
}

export interface FetchOrdersOptions {
  storeUrl: string;
  credentials: Record<string, string>;
  /** Only pull orders modified since this instant (null → recent window). */
  since?: Date | null;
}

export interface SalesChannelAdapter {
  platform: SalesChannelPlatform;
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

const ADAPTERS: Record<string, SalesChannelAdapter> = {
  woocommerce: new WooCommerceAdapter(),
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
    default:
      return undefined;
  }
}
