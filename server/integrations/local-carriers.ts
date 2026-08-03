import { createHash } from "crypto";
import { getIntegrationEnv } from "../services/integration-runtime";
import { logInfo, logWarn, logError } from "../services/logger";
import {
  CarrierError,
  type CarrierAdapter,
  type CarrierCapabilityProfile,
  type AddressValidationRequest,
  type AddressValidationResponse,
  type PostalCodeValidationRequest,
  type PostalCodeValidationResponse,
  type ServiceAvailabilityRequest,
  type ServiceAvailabilityResponse,
  type RateRequest,
  type RateResponse,
  type CreateShipmentRequest,
  type CreateShipmentResponse,
  type TrackingResponse,
  type TrackingEvent,
  type ShippingAddress,
} from "./fedex";

/**
 * Saudi domestic ("local") carrier adapters — SMSA Express, Naqel Express, J&T Express, RedBox,
 * and Zajil Express — plus two aggregator providers (Fizzpa, Shipox) that clients never pick
 * directly. Aggregator backends carry `capabilities.providerOnly: true`: they are hidden from
 * the client rate list and reached only through client-facing virtual carriers (see
 * virtualCarriers), which route to them and pass the chosen downstream courier as an order note.
 *
 * Credentials are entered by an admin in the Apps tab (INTEGRATION_APP_DEFINITIONS keys
 * `smsa` / `naqel` / `jt` / `redbox` / `zajil`) and injected per-request via the integration-runtime scope, so
 * `getIntegrationEnv("SMSA_*" | "NAQEL_*" | "JT_*" | "REDBOX_*" | "ZAJIL_*")` returns the bound account's values. Until an
 * account is configured, `isConfigured()` is false: `getRates` returns `[]` (the local
 * pricing resolver then uses the stored rate-card), and booking/label/tracking throw a
 * clear "not configured" error — so the manual local flow keeps working unchanged.
 *
 * ── API contract note ────────────────────────────────────────────────────────────────
 * SMSA and Naqel expose proprietary REST APIs whose exact endpoint paths and field names
 * are fixed per account/contract. The request/response mapping below follows each
 * carrier's documented REST shape; the endpoint paths live in the `ENDPOINTS` constants
 * and the base URL is overridable from the Apps tab (`*_BASE_URL`). If your contract
 * differs, adjust those constants + the map/parse helpers — nothing else changes.
 *
 * Zajil is the exception: its OpenAPI spec is published at
 * https://api.zajil-express.com/openapi.json, so that mapping is exact, not inferred.
 */

const KG = (weightKg: number) => Math.max(0.1, Math.round(weightKg * 1000) / 1000);

function toKg(packages: RateRequest["packages"]): number {
  const total = packages.reduce((sum, p) => {
    const w = Number(p.weight) || 0;
    return sum + (p.weightUnit === "LB" ? w * 0.453592 : w);
  }, 0);
  return KG(total);
}

function fullAddress(a: ShippingAddress): string {
  return [a.streetLine1, a.streetLine2, a.streetLine3].filter(Boolean).join(", ");
}

async function httpJson(
  url: string,
  init: RequestInit,
  carrierName: string,
): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new CarrierError("NETWORK_ERROR", `${carrierName}: network error calling ${url}: ${(err as Error).message}`);
  }
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text; // some carrier endpoints return a bare string/label
  }
  if (!res.ok) {
    const message = (body && (body.message || body.Message || body.error)) || text || res.statusText;
    throw new CarrierError(`HTTP_${res.status}`, `${carrierName}: ${message}`);
  }
  return body;
}

abstract class LocalCarrierAdapter implements CarrierAdapter {
  abstract name: string;
  abstract carrierCode: string;
  /** Env key prefix, e.g. "SMSA" → SMSA_API_KEY. */
  protected abstract envPrefix: string;
  /** Fallback base URL when the admin leaves *_BASE_URL blank. */
  protected abstract defaultBaseUrl: string;

  capabilities: CarrierCapabilityProfile = {
    type: "local",
    domesticCountries: ["SA"],
    domesticZones: true,
    labelFormat: "PDF",
    trackingMode: "poll",
  };

  protected env(suffix: string): string | undefined {
    return getIntegrationEnv(`${this.envPrefix}_${suffix}`);
  }

  protected baseUrl(): string {
    return (this.env("BASE_URL") || this.defaultBaseUrl).replace(/\/+$/, "");
  }

  abstract isConfigured(): boolean;
  abstract getRates(request: RateRequest): Promise<RateResponse[]>;
  abstract createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse>;
  abstract trackShipment(trackingNumber: string): Promise<TrackingResponse>;
  abstract cancelShipment(trackingNumber: string): Promise<boolean>;

  validateWebhookSignature(): boolean {
    return false;
  }

  // Domestic KSA addresses are accepted as-is; carriers validate on booking.
  async validateAddress(_request: AddressValidationRequest): Promise<AddressValidationResponse> {
    return { valid: true, resolvedAddresses: [] };
  }

  async validatePostalCode(request: PostalCodeValidationRequest): Promise<PostalCodeValidationResponse> {
    return { valid: true, countryCode: request.countryCode };
  }

  async checkServiceAvailability(_request: ServiceAvailabilityRequest): Promise<ServiceAvailabilityResponse> {
    return { services: [] };
  }

  protected notConfigured(): never {
    throw new CarrierError(
      "NOT_CONFIGURED",
      `${this.name} is not configured — add its credentials in the Apps tab to enable live booking, labels and tracking.`,
    );
  }
}

// ─── SMSA Express ────────────────────────────────────────────────────────────────────
// REST API keyed by an `apikey` header + a customer account/passkey.
const SMSA_ENDPOINTS = {
  rate: "/api/rate",
  createShipment: "/api/shipment",
  label: (awb: string) => `/api/shipment/${encodeURIComponent(awb)}/label`,
  track: (awb: string) => `/api/tracking/${encodeURIComponent(awb)}`,
  cancel: (awb: string) => `/api/shipment/${encodeURIComponent(awb)}`,
};

export class SmsaAdapter extends LocalCarrierAdapter {
  name = "SMSA Express";
  carrierCode = "SMSA";
  protected envPrefix = "SMSA";
  protected defaultBaseUrl = "https://ecomapis.smsaexpress.com";

  isConfigured(): boolean {
    return Boolean(this.env("API_KEY") && this.env("ACCOUNT_NUMBER"));
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      apikey: this.env("API_KEY") || "",
    };
  }

  async getRates(request: RateRequest): Promise<RateResponse[]> {
    if (!this.isConfigured()) {
      logInfo(`${this.name}: not configured, no live rates (rate card fallback applies)`);
      return [];
    }
    const weightKg = toKg(request.packages);
    try {
      const body = await httpJson(`${this.baseUrl()}${SMSA_ENDPOINTS.rate}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          passKey: this.env("PASSKEY") || undefined,
          customerAccount: this.env("ACCOUNT_NUMBER"),
          fromCity: request.shipper.city,
          toCity: request.recipient.city,
          weight: weightKg,
          pieces: request.packages.length || 1,
        }),
      }, this.name);
      const amount = Number(body?.total ?? body?.Total ?? body?.amount ?? body?.rate);
      if (!Number.isFinite(amount) || amount <= 0) return [];
      return [{
        baseRate: amount,
        currency: body?.currency || "SAR",
        serviceType: "LOCAL",
        transitDays: Number(body?.transitDays ?? 2),
        serviceName: `${this.name} Domestic`,
        chargeableWeight: weightKg,
        chargeableWeightUnit: "KG",
        chargeableWeightSource: "carrier",
      }];
    } catch (err) {
      // A missing/unsupported rate endpoint is non-fatal — fall back to the rate card.
      logWarn(`${this.name}: live rate lookup failed, using rate card. ${(err as Error).message}`);
      return [];
    }
  }

  async createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse> {
    if (!this.isConfigured()) this.notConfigured();
    const weightKg = toKg(request.packages);
    const payload = {
      passKey: this.env("PASSKEY") || undefined,
      customerAccount: this.env("ACCOUNT_NUMBER"),
      shipmentType: "DLV",
      weight: weightKg,
      pieces: request.packages.length || 1,
      contentDescription: request.commodityDescription || "General goods",
      declaredValue: request.declaredValue ?? 0,
      currency: request.currency || "SAR",
      shipper: {
        name: request.shipper.name,
        contactPhone: request.shipper.phone,
        addressLine: fullAddress(request.shipper),
        city: request.shipper.city,
        country: request.shipper.countryCode,
      },
      consignee: {
        name: request.recipient.name,
        contactPhone: request.recipient.phone,
        addressLine: fullAddress(request.recipient),
        city: request.recipient.city,
        country: request.recipient.countryCode,
      },
    };
    const body = await httpJson(`${this.baseUrl()}${SMSA_ENDPOINTS.createShipment}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
    }, this.name);

    const awb = String(body?.sawb ?? body?.awb ?? body?.trackingNumber ?? body?.waybillNumber ?? "").trim();
    if (!awb) {
      throw new CarrierError("BOOKING_FAILED", `${this.name}: booking returned no AWB.`);
    }
    let labelData: string | undefined = body?.awbData || body?.label || body?.labelData;
    if (!labelData) {
      labelData = await this.fetchLabel(awb).catch((err) => {
        logWarn(`${this.name}: label fetch failed for ${awb}: ${(err as Error).message}`);
        return undefined;
      });
    }
    return {
      trackingNumber: awb,
      carrierTrackingNumber: awb,
      labelData,
      serviceType: "LOCAL",
    };
  }

  private async fetchLabel(awb: string): Promise<string | undefined> {
    const body = await httpJson(`${this.baseUrl()}${SMSA_ENDPOINTS.label(awb)}?format=PDF`, {
      method: "GET",
      headers: this.headers(),
    }, this.name);
    if (typeof body === "string") return body;
    return body?.label || body?.labelData || body?.pdf || undefined;
  }

  async trackShipment(trackingNumber: string): Promise<TrackingResponse> {
    if (!this.isConfigured()) {
      return { trackingNumber, status: "pending", events: [] };
    }
    const body = await httpJson(`${this.baseUrl()}${SMSA_ENDPOINTS.track(trackingNumber)}`, {
      method: "GET",
      headers: this.headers(),
    }, this.name);
    const rawEvents: any[] = body?.events || body?.Activities || body?.tracking || [];
    const events: TrackingEvent[] = rawEvents.map((e) => ({
      timestamp: new Date(e.date || e.Date || e.timestamp || Date.now()),
      status: String(e.status || e.Status || e.activity || ""),
      description: String(e.description || e.Description || e.activity || e.status || ""),
      location: e.location || e.Location || e.city,
    }));
    const latest = rawEvents[rawEvents.length - 1];
    return {
      trackingNumber,
      status: String(latest?.status || latest?.Status || body?.status || "in_transit").toLowerCase(),
      events,
    };
  }

  async cancelShipment(trackingNumber: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      await httpJson(`${this.baseUrl()}${SMSA_ENDPOINTS.cancel(trackingNumber)}`, {
        method: "DELETE",
        headers: this.headers(),
      }, this.name);
      return true;
    } catch (err) {
      logError(`${this.name}: cancel failed for ${trackingNumber}`, err);
      return false;
    }
  }
}

// ─── Naqel Express ───────────────────────────────────────────────────────────────────
// REST API where each request carries a ClientInfo { ClientID, Password, Version }.
const NAQEL_ENDPOINTS = {
  rate: "/api/v1/CalculateTariff",
  createShipment: "/api/v1/CreateWaybill",
  track: "/api/v1/TrackByWaybillNo",
  cancel: "/api/v1/CancelWaybill",
};

export class NaqelAdapter extends LocalCarrierAdapter {
  name = "Naqel Express";
  carrierCode = "NAQEL";
  protected envPrefix = "NAQEL";
  protected defaultBaseUrl = "https://api.naqelexpress.com";

  isConfigured(): boolean {
    return Boolean(this.env("CLIENT_ID") && this.env("PASSWORD"));
  }

  private clientInfo() {
    return {
      ClientID: this.env("CLIENT_ID"),
      Password: this.env("PASSWORD"),
      Version: this.env("API_VERSION") || "1.0",
      ClientAccountNumber: this.env("ACCOUNT_NUMBER") || undefined,
    };
  }

  private headers(): Record<string, string> {
    return { "Content-Type": "application/json", Accept: "application/json" };
  }

  async getRates(request: RateRequest): Promise<RateResponse[]> {
    if (!this.isConfigured()) {
      logInfo(`${this.name}: not configured, no live rates (rate card fallback applies)`);
      return [];
    }
    const weightKg = toKg(request.packages);
    try {
      const body = await httpJson(`${this.baseUrl()}${NAQEL_ENDPOINTS.rate}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          ClientInfo: this.clientInfo(),
          OriginCity: request.shipper.city,
          DestinationCity: request.recipient.city,
          Weight: weightKg,
          PiecesCount: request.packages.length || 1,
        }),
      }, this.name);
      const amount = Number(body?.Total ?? body?.TotalAmount ?? body?.total ?? body?.Amount);
      if (!Number.isFinite(amount) || amount <= 0) return [];
      return [{
        baseRate: amount,
        currency: body?.Currency || "SAR",
        serviceType: "LOCAL",
        transitDays: Number(body?.TransitDays ?? 2),
        serviceName: `${this.name} Domestic`,
        chargeableWeight: weightKg,
        chargeableWeightUnit: "KG",
        chargeableWeightSource: "carrier",
      }];
    } catch (err) {
      logWarn(`${this.name}: live rate lookup failed, using rate card. ${(err as Error).message}`);
      return [];
    }
  }

  async createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse> {
    if (!this.isConfigured()) this.notConfigured();
    const weightKg = toKg(request.packages);
    const payload = {
      ClientInfo: this.clientInfo(),
      Waybill: {
        ShipmentType: "DLV",
        Weight: weightKg,
        PiecesCount: request.packages.length || 1,
        GoodDescription: request.commodityDescription || "General goods",
        DeclareValue: request.declaredValue ?? 0,
        Currency: request.currency || "SAR",
        ShipperName: request.shipper.name,
        ShipperPhone: request.shipper.phone,
        ShipperAddress: fullAddress(request.shipper),
        ShipperCity: request.shipper.city,
        ConsigneeName: request.recipient.name,
        ConsigneePhone: request.recipient.phone,
        ConsigneeAddress: fullAddress(request.recipient),
        ConsigneeCity: request.recipient.city,
      },
    };
    const body = await httpJson(`${this.baseUrl()}${NAQEL_ENDPOINTS.createShipment}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
    }, this.name);

    const awb = String(
      body?.WaybillNo ?? body?.WaybillNumber ?? body?.waybillNo ?? body?.trackingNumber ?? "",
    ).trim();
    if (!awb) {
      const message = body?.Message || body?.ErrorMessage || "booking returned no waybill.";
      throw new CarrierError("BOOKING_FAILED", `${this.name}: ${message}`);
    }
    const labelData: string | undefined = body?.PdfFile || body?.LabelData || body?.Label || undefined;
    const labelUrl: string | undefined = body?.LabelURL || body?.LabelUrl || undefined;
    return {
      trackingNumber: awb,
      carrierTrackingNumber: awb,
      labelUrl,
      labelData,
      serviceType: "LOCAL",
    };
  }

  async trackShipment(trackingNumber: string): Promise<TrackingResponse> {
    if (!this.isConfigured()) {
      return { trackingNumber, status: "pending", events: [] };
    }
    const body = await httpJson(`${this.baseUrl()}${NAQEL_ENDPOINTS.track}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ ClientInfo: this.clientInfo(), WaybillNo: trackingNumber }),
    }, this.name);
    const rawEvents: any[] = body?.WaybillStatuses || body?.TrackingDetails || body?.Statuses || [];
    const events: TrackingEvent[] = rawEvents.map((e) => ({
      timestamp: new Date(e.StatusDate || e.Date || e.date || Date.now()),
      status: String(e.Status || e.StatusCode || e.status || ""),
      description: String(e.StatusDescription || e.Description || e.Status || ""),
      location: e.City || e.Location || e.location,
    }));
    const latest = rawEvents[rawEvents.length - 1];
    return {
      trackingNumber,
      status: String(latest?.Status || body?.Status || "in_transit").toLowerCase(),
      events,
    };
  }

  async cancelShipment(trackingNumber: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      await httpJson(`${this.baseUrl()}${NAQEL_ENDPOINTS.cancel}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ ClientInfo: this.clientInfo(), WaybillNo: trackingNumber }),
      }, this.name);
      return true;
    } catch (err) {
      logError(`${this.name}: cancel failed for ${trackingNumber}`, err);
      return false;
    }
  }
}

// ─── J&T Express ─────────────────────────────────────────────────────────────────────
// J&T Global Open Platform. Every request is form-posted with a `bizContent` JSON payload,
// authenticated by an `apiAccount` header and a `digest` header = Base64(MD5(bizContent +
// privateKey)). The merchant/customer code travels inside bizContent. Endpoint paths and the
// base URL are per-contract and overridable from the Apps tab (JT_BASE_URL).
const JT_ENDPOINTS = {
  createShipment: "/webopenplatformapi/api/order/addOrder",
  track: "/webopenplatformapi/api/logistics/trace",
  cancel: "/webopenplatformapi/api/order/cancelOrder",
};

export class JtAdapter extends LocalCarrierAdapter {
  name = "J&T Express";
  carrierCode = "JT";
  protected envPrefix = "JT";
  protected defaultBaseUrl = "https://openapi.jtexpress.com.sa";

  isConfigured(): boolean {
    return Boolean(this.env("API_ACCOUNT") && this.env("PRIVATE_KEY") && this.env("CUSTOMER_CODE"));
  }

  /** J&T digest: Base64( MD5( bizContentJson + privateKey ) ). */
  private digest(bizContentStr: string): string {
    return createHash("md5")
      .update(bizContentStr + (this.env("PRIVATE_KEY") || ""), "utf8")
      .digest("base64");
  }

  private async call(endpoint: string, bizContent: Record<string, any>): Promise<any> {
    const bizContentStr = JSON.stringify(bizContent);
    const params = new URLSearchParams();
    params.set("bizContent", bizContentStr);
    const body = await httpJson(`${this.baseUrl()}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        apiAccount: this.env("API_ACCOUNT") || "",
        digest: this.digest(bizContentStr),
        timestamp: Date.now().toString(),
      },
      body: params.toString(),
    }, this.name);
    // J&T returns HTTP 200 with an app-level status; surface failures explicitly.
    const ok =
      body?.success === true ||
      body?.succ === true ||
      ["1", "S", "SUCCESS", "success", "0000"].includes(String(body?.code ?? ""));
    if (body && typeof body === "object" && (body.code != null || body.success != null) && !ok) {
      const message = body?.msg || body?.message || body?.desc || "request rejected";
      throw new CarrierError("CARRIER_REJECTED", `${this.name}: ${message}`);
    }
    return body;
  }

  async getRates(_request: RateRequest): Promise<RateResponse[]> {
    // J&T's KSA Open Platform exposes no public rate quote endpoint — pricing is contractual.
    // Return no live rate so the stored rate-card (local_carrier_pricing_tiers) is used.
    logInfo(`${this.name}: no live rate API, using rate card.`);
    return [];
  }

  async createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse> {
    if (!this.isConfigured()) this.notConfigured();
    const weightKg = toKg(request.packages);
    const orderId = `EZ${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const bizContent = {
      customerCode: this.env("CUSTOMER_CODE"),
      txlogisticId: orderId,
      orderType: "1",
      serviceType: "01",
      expressType: "EZ",
      goodsType: "bmpp",
      payType: "PP_PM",
      totalQuantity: request.packages.length || 1,
      weight: weightKg,
      itemsValue: request.declaredValue ?? 0,
      currency: request.currency || "SAR",
      remark: request.commodityDescription || "General goods",
      sender: {
        name: request.shipper.name,
        mobile: request.shipper.phone,
        phone: request.shipper.phone,
        countryCode: request.shipper.countryCode,
        city: request.shipper.city,
        area: request.shipper.stateOrProvince || request.shipper.city,
        address: fullAddress(request.shipper),
        postCode: request.shipper.postalCode || undefined,
      },
      receiver: {
        name: request.recipient.name,
        mobile: request.recipient.phone,
        phone: request.recipient.phone,
        countryCode: request.recipient.countryCode,
        city: request.recipient.city,
        area: request.recipient.stateOrProvince || request.recipient.city,
        address: fullAddress(request.recipient),
        postCode: request.recipient.postalCode || undefined,
      },
      items: [
        {
          itemName: request.commodityDescription || "General goods",
          number: request.packages.length || 1,
          weight: weightKg,
        },
      ],
    };
    const body = await this.call(JT_ENDPOINTS.createShipment, bizContent);
    const data = body?.data ?? body;
    const awb = String(
      data?.billCode ?? data?.mailNo ?? data?.waybillNo ?? data?.txlogisticId ?? "",
    ).trim();
    if (!awb) {
      const message = body?.msg || body?.message || "booking returned no waybill.";
      throw new CarrierError("BOOKING_FAILED", `${this.name}: ${message}`);
    }
    const labelData: string | undefined = data?.waybillPdf || data?.labelData || data?.base64 || undefined;
    const labelUrl: string | undefined = data?.printUrl || data?.labelUrl || data?.waybillUrl || undefined;
    return {
      trackingNumber: awb,
      carrierTrackingNumber: awb,
      labelUrl,
      labelData,
      serviceType: "LOCAL",
    };
  }

  async trackShipment(trackingNumber: string): Promise<TrackingResponse> {
    if (!this.isConfigured()) {
      return { trackingNumber, status: "pending", events: [] };
    }
    const body = await this.call(JT_ENDPOINTS.track, { billCodes: [trackingNumber] });
    const data = body?.data ?? body;
    const first = Array.isArray(data) ? data[0] : data?.[trackingNumber] ?? data;
    const rawEvents: any[] = first?.details || first?.traces || first?.tracking || data?.details || [];
    const events: TrackingEvent[] = rawEvents.map((e) => ({
      timestamp: new Date(e.scanTime || e.acceptTime || e.time || e.date || Date.now()),
      status: String(e.scanType || e.status || e.desc || ""),
      description: String(e.desc || e.scanTypeName || e.status || ""),
      location: e.scanNetworkCity || e.city || e.location || e.scanNetworkName,
    }));
    const latest = rawEvents[rawEvents.length - 1];
    return {
      trackingNumber,
      status: String(latest?.scanType || latest?.status || "in_transit").toLowerCase(),
      events,
    };
  }

  async cancelShipment(trackingNumber: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      await this.call(JT_ENDPOINTS.cancel, {
        customerCode: this.env("CUSTOMER_CODE"),
        billCode: trackingNumber,
        reason: "Cancelled by shipper",
      });
      return true;
    } catch (err) {
      logError(`${this.name}: cancel failed for ${trackingNumber}`, err);
      return false;
    }
  }
}

// ─── RedBox ──────────────────────────────────────────────────────────────────────────
// RedBox last-mile REST API, authenticated with a Bearer API key; the merchant id travels
// in the payload. Endpoint paths + base URL are per-contract and overridable (REDBOX_BASE_URL).
const REDBOX_ENDPOINTS = {
  createShipment: "/api/v1/orders",
  label: (id: string) => `/api/v1/orders/${encodeURIComponent(id)}/label`,
  track: (awb: string) => `/api/v1/orders/${encodeURIComponent(awb)}/tracking`,
  cancel: (id: string) => `/api/v1/orders/${encodeURIComponent(id)}/cancel`,
};

export class RedboxAdapter extends LocalCarrierAdapter {
  name = "RedBox";
  carrierCode = "REDBOX";
  protected envPrefix = "REDBOX";
  protected defaultBaseUrl = "https://api.redboxsa.com";

  isConfigured(): boolean {
    return Boolean(this.env("API_KEY") && this.env("MERCHANT_ID"));
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${this.env("API_KEY") || ""}`,
    };
  }

  async getRates(_request: RateRequest): Promise<RateResponse[]> {
    // RedBox exposes no public rate quote endpoint — pricing is contractual.
    // Return no live rate so the stored rate-card (local_carrier_pricing_tiers) is used.
    logInfo(`${this.name}: no live rate API, using rate card.`);
    return [];
  }

  async createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse> {
    if (!this.isConfigured()) this.notConfigured();
    const weightKg = toKg(request.packages);
    const reference = `EZ${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const payload = {
      merchantId: this.env("MERCHANT_ID"),
      reference,
      weight: weightKg,
      pieces: request.packages.length || 1,
      codAmount: 0,
      description: request.commodityDescription || "General goods",
      declaredValue: request.declaredValue ?? 0,
      currency: request.currency || "SAR",
      sender: {
        name: request.shipper.name,
        phone: request.shipper.phone,
        city: request.shipper.city,
        address: fullAddress(request.shipper),
        country: request.shipper.countryCode,
      },
      recipient: {
        name: request.recipient.name,
        phone: request.recipient.phone,
        city: request.recipient.city,
        address: fullAddress(request.recipient),
        country: request.recipient.countryCode,
      },
    };
    const body = await httpJson(`${this.baseUrl()}${REDBOX_ENDPOINTS.createShipment}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
    }, this.name);

    const data = body?.data ?? body;
    const awb = String(
      data?.trackingNumber ?? data?.barcode ?? data?.awb ?? data?.waybillNumber ?? data?.id ?? "",
    ).trim();
    if (!awb) {
      const message = body?.message || body?.error || "booking returned no tracking number.";
      throw new CarrierError("BOOKING_FAILED", `${this.name}: ${message}`);
    }
    const orderId = String(data?.id ?? awb);
    let labelData: string | undefined = data?.label || data?.labelData || data?.base64;
    const labelUrl: string | undefined = data?.labelUrl || data?.labelURL || data?.awbUrl || undefined;
    if (!labelData && !labelUrl) {
      labelData = await this.fetchLabel(orderId).catch((err) => {
        logWarn(`${this.name}: label fetch failed for ${orderId}: ${(err as Error).message}`);
        return undefined;
      });
    }
    return {
      trackingNumber: awb,
      carrierTrackingNumber: awb,
      labelUrl,
      labelData,
      serviceType: "LOCAL",
    };
  }

  private async fetchLabel(orderId: string): Promise<string | undefined> {
    const body = await httpJson(`${this.baseUrl()}${REDBOX_ENDPOINTS.label(orderId)}?format=PDF`, {
      method: "GET",
      headers: this.headers(),
    }, this.name);
    if (typeof body === "string") return body;
    return body?.label || body?.labelData || body?.pdf || body?.data?.label || undefined;
  }

  async trackShipment(trackingNumber: string): Promise<TrackingResponse> {
    if (!this.isConfigured()) {
      return { trackingNumber, status: "pending", events: [] };
    }
    const body = await httpJson(`${this.baseUrl()}${REDBOX_ENDPOINTS.track(trackingNumber)}`, {
      method: "GET",
      headers: this.headers(),
    }, this.name);
    const data = body?.data ?? body;
    const rawEvents: any[] = data?.events || data?.tracking || data?.history || data?.trackingDetails || [];
    const events: TrackingEvent[] = rawEvents.map((e) => ({
      timestamp: new Date(e.timestamp || e.date || e.time || e.createdAt || Date.now()),
      status: String(e.status || e.state || e.code || ""),
      description: String(e.description || e.message || e.status || ""),
      location: e.location || e.city || e.hub,
    }));
    const latest = rawEvents[rawEvents.length - 1];
    return {
      trackingNumber,
      status: String(latest?.status || data?.status || "in_transit").toLowerCase(),
      events,
    };
  }

  async cancelShipment(trackingNumber: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      await httpJson(`${this.baseUrl()}${REDBOX_ENDPOINTS.cancel(trackingNumber)}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ reason: "Cancelled by shipper" }),
      }, this.name);
      return true;
    } catch (err) {
      logError(`${this.name}: cancel failed for ${trackingNumber}`, err);
      return false;
    }
  }
}

// ─── Zajil Express ───────────────────────────────────────────────────────────────────
// Zajil Shipment Integration API v1.0 (https://api.zajil-express.com/openapi.json).
//
// The spec is published, but it documents only the *inner* payloads — the live gateway
// fronts an Odoo backend and wraps them (see unwrap()). The mapping below was verified
// against Zajil's test environment rather than taken from the spec alone. Constraints:
//
//  • Auth is a raw `Authorization: <api key>` header — no `Bearer` prefix.
//  • Cities are Zajil integer IDs, not names. `/api/cities` is the only source; we cache
//    it and resolve the platform's free-text city names against it (see resolveCityId).
//  • `environment` ("test" | "production") is a body field on create and a query param on
//    track/label. The spec says to always send it explicitly.
//  • COD is not operated on partner accounts: paymentType is always 2 (Prepaid) with
//    totalAmountToPaid 0. The API hard-rejects a non-zero amount alongside paymentType 2.
//  • No rate endpoint exists (pricing is contractual) → getRates returns [] so the stored
//    rate-card is used, same as J&T/RedBox.
//  • No cancel endpoint exists → cancelShipment reports false rather than silently lying.
//  • Zajil allowlists partner egress IPs; a 403 here usually means the server IP is not
//    registered with Zajil rather than a bad key.
const ZAJIL_ENDPOINTS = {
  cities: "/api/cities",
  createShipment: "/api/shipment/create",
  label: (awb: string) => `/api/shipment/label/${encodeURIComponent(awb)}`,
  track: "/api/track",
};

/** Zajil's national-address short code: 4 letters + 4 digits, e.g. RQWA3237. */
const ZAJIL_NATIONAL_ADDRESS = /^[A-Za-z]{4}\d{4}$/;

const ZAJIL_CITY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Fold a city name to a comparable key: "Al Khobar" / "AlKhobar" / "al-khobar" → "alkhobar". */
function cityKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Zajil expects a local subscriber number ("500051029"). The platform stores E.164
 * ("+966500051029"), so strip the country code and any trunk prefix.
 */
function zajilPhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.replace(/^966/, "").replace(/^0+/, "");
}

/**
 * Zajil's Odoo backend emits naive UTC timestamps ("2026-07-15T05:48:46.469" / with a
 * space separator). `new Date()` reads a zone-less ISO string as *local* time, which would
 * skew every tracking event by the KSA offset, so pin them to UTC explicitly.
 */
function zajilDate(value: unknown): Date {
  if (typeof value !== "string" || !value.trim()) return new Date();
  const text = value.trim().replace(" ", "T");
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(text);
  return new Date(hasZone ? text : `${text}Z`);
}

export class ZajilAdapter extends LocalCarrierAdapter {
  name = "Zajil Express";
  carrierCode = "ZAJIL";
  protected envPrefix = "ZAJIL";
  protected defaultBaseUrl = "https://api.zajil-express.com";

  private cityCache: { fetchedAt: number; byKey: Map<string, number> } | null = null;

  isConfigured(): boolean {
    return Boolean(this.env("API_KEY") && this.env("CUSTOMER_ID"));
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      // Zajil takes the raw key — no "Bearer " prefix.
      Authorization: this.env("API_KEY") || "",
    };
  }

  /** "test" unless the admin explicitly switched the account to production. */
  private environment(): string {
    return this.env("ENVIRONMENT")?.trim().toLowerCase() === "production" ? "production" : "test";
  }

  private async cities(): Promise<Map<string, number>> {
    if (this.cityCache && Date.now() - this.cityCache.fetchedAt < ZAJIL_CITY_CACHE_TTL_MS) {
      return this.cityCache.byKey;
    }
    const body = await httpJson(`${this.baseUrl()}${ZAJIL_ENDPOINTS.cities}`, {
      method: "GET",
      headers: this.headers(),
    }, this.name);
    const rows: any[] = Array.isArray(body) ? body : body?.data || [];
    const byKey = new Map<string, number>();
    for (const row of rows) {
      const id = Number(row?.id);
      const name = String(row?.name ?? "");
      if (!Number.isFinite(id) || !name) continue;
      byKey.set(cityKey(name), id);
    }
    if (byKey.size === 0) {
      throw new CarrierError("CITY_LOOKUP_FAILED", `${this.name}: /api/cities returned no usable cities.`);
    }
    this.cityCache = { fetchedAt: Date.now(), byKey };
    return byKey;
  }

  /**
   * Map a free-text city to a Zajil city ID. Exact fold first, then an "Al"-prefix
   * tolerant match ("Khobar" ↔ "AlKhobar") since the platform's city strings come from
   * client input and address books rather than Zajil's list.
   */
  private async resolveCityId(city: string, role: "sender" | "receiver"): Promise<number> {
    const byKey = await this.cities();
    const key = cityKey(city || "");
    const stripAl = (value: string) => value.replace(/^al/, "");

    const id =
      byKey.get(key) ??
      byKey.get(`al${key}`) ??
      [...byKey.entries()].find(([candidate]) => stripAl(candidate) === stripAl(key))?.[1];

    if (id == null) {
      throw new CarrierError(
        "CITY_NOT_SERVED",
        `${this.name}: ${role} city "${city}" is not in Zajil's served-city list.`,
      );
    }
    return id;
  }

  /**
   * Strip Zajil's transport envelope. The published OpenAPI spec documents only the *inner*
   * payload, but the live gateway fronts an Odoo backend and the envelope differs per route:
   *   • /api/shipment/create → JSON-RPC: { jsonrpc, result: { status, refNo, ... } }
   *   • /api/track           → bare, capitalised: { Status, Result: { ... } }
   *   • errors               → { error: "Shipment Not found" } or JSON-RPC { error: { message } }
   * Everything arrives as HTTP 200, so failures must be detected from the body.
   */
  private unwrap(body: any): any {
    if (!body || typeof body !== "object") return body;

    const error = body.error;
    if (error) {
      const message =
        typeof error === "string" ? error : error.message || error.data?.message || "request failed";
      throw new CarrierError("CARRIER_REJECTED", `${this.name}: ${message}`);
    }

    return body.result ?? body.Result ?? body;
  }

  /** Zajil replies HTTP 200 with status:"Failure" on business rejections. */
  private assertSuccess(body: any): void {
    const status = String(body?.status ?? body?.Status ?? "").toUpperCase();
    if (status && status !== "SUCCESS") {
      const detail = [body?.code, body?.message].filter(Boolean).join(": ") || "request rejected";
      throw new CarrierError("CARRIER_REJECTED", `${this.name}: ${detail}`);
    }
  }

  async getRates(_request: RateRequest): Promise<RateResponse[]> {
    // Zajil's Shipment Integration API exposes no rate endpoint — pricing is contractual.
    // Return no live rate so the stored rate-card (local_carrier_pricing_tiers) is used.
    logInfo(`${this.name}: no live rate API, using rate card.`);
    return [];
  }

  async createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse> {
    if (!this.isConfigured()) this.notConfigured();

    const customerId = Number(this.env("CUSTOMER_ID"));
    if (!Number.isInteger(customerId)) {
      throw new CarrierError("NOT_CONFIGURED", `${this.name}: Customer ID must be a whole number.`);
    }

    // Zajil's Shipment Integration API is domestic-KSA only: the payload carries no country,
    // customs or incoterm fields and /api/cities lists Saudi cities exclusively. Reject a
    // cross-border lane up front rather than letting it fail later as an unresolvable city.
    const lane = [request.shipper.countryCode, request.recipient.countryCode];
    if (lane.some((country) => (country || "").trim().toUpperCase() !== "SA")) {
      throw new CarrierError(
        "LANE_NOT_SUPPORTED",
        `${this.name}: only handles domestic Saudi shipments (got ${lane[0] || "?"} → ${lane[1] || "?"}). Use an international carrier for this lane.`,
      );
    }

    const [senderCity, receiverCity] = await Promise.all([
      this.resolveCityId(request.shipper.city, "sender"),
      this.resolveCityId(request.recipient.city, "receiver"),
    ]);

    // Saudi national address short code travels on streetLine3 (the portal's "short address").
    // Clients commonly type it spaced ("RQWA 3237"), so fold whitespace before matching —
    // dropping it is not harmless: accounts flagged for TGA compliance reject the whole
    // booking with NATIONAL_ADDRESS_REQUIRED rather than warning, despite what the spec says.
    const shortAddress = (request.recipient.streetLine3 || "").replace(/\s/g, "").toUpperCase();
    const nationalAddress = ZAJIL_NATIONAL_ADDRESS.test(shortAddress) ? shortAddress : undefined;

    const payload = {
      referenceNo: `EZ${Date.now()}${Math.floor(Math.random() * 1000)}`,
      customerId,
      receiverPhoneNumber: zajilPhone(request.recipient.phone),
      receiverName: request.recipient.name,
      receiverCity,
      ReceiverAddress: fullAddress(request.recipient),
      shipmentDescription: request.commodityDescription || "General goods",
      actualWeight: toKg(request.packages),
      // COD is not operated on partner accounts: always Prepaid with a zero balance.
      // Zajil rejects paymentType 2 with a non-zero totalAmountToPaid.
      paymentType: 2,
      totalAmountToPaid: 0,
      deliveryService: true,
      totalPieces: request.packages.length || 1,
      shipmentValue: request.declaredValue ?? 0,
      opsServiceType: 1,
      senderPhoneNumber: zajilPhone(request.shipper.phone),
      senderName: request.shipper.name,
      senderCity,
      sameDay: 0,
      environment: this.environment(),
      ...(nationalAddress ? { nationalAddress } : {}),
    };

    const body = this.unwrap(await httpJson(`${this.baseUrl()}${ZAJIL_ENDPOINTS.createShipment}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
    }, this.name));
    this.assertSuccess(body);

    const awb = String(body?.refNo ?? "").trim();
    if (!awb) {
      throw new CarrierError("BOOKING_FAILED", `${this.name}: ${body?.message || "booking returned no AWB."}`);
    }

    // Compliance warnings (e.g. NATIONAL_ADDRESS_MISSING) are non-fatal — the shipment is
    // booked either way — but they are billing/TGA-relevant, so surface them in the logs.
    const warnings: any[] = Array.isArray(body?.warnings) ? body.warnings : [];
    for (const warning of warnings) {
      logWarn(`${this.name}: ${warning?.code || "WARNING"} on ${awb}: ${warning?.message || ""}`);
    }

    const labelUrl: string | undefined = body?.labelUrl || undefined;
    const labelData = labelUrl
      ? undefined
      : await this.fetchLabel(awb).catch((err) => {
          logWarn(`${this.name}: label fetch failed for ${awb}: ${(err as Error).message}`);
          return undefined;
        });

    return {
      trackingNumber: awb,
      carrierTrackingNumber: awb,
      labelUrl,
      labelData,
      serviceType: "LOCAL",
    };
  }

  /** The label endpoint streams a raw PDF (not JSON), so read it as bytes → base64. */
  private async fetchLabel(awb: string): Promise<string | undefined> {
    const url = `${this.baseUrl()}${ZAJIL_ENDPOINTS.label(awb)}?environment=${this.environment()}`;
    let res: Response;
    try {
      res = await fetch(url, { method: "GET", headers: { Authorization: this.env("API_KEY") || "" } });
    } catch (err) {
      throw new CarrierError("NETWORK_ERROR", `${this.name}: network error calling ${url}: ${(err as Error).message}`);
    }
    if (!res.ok) {
      throw new CarrierError(`HTTP_${res.status}`, `${this.name}: label request failed (${res.statusText})`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer.length > 0 ? buffer.toString("base64") : undefined;
  }

  async trackShipment(trackingNumber: string): Promise<TrackingResponse> {
    if (!this.isConfigured()) {
      return { trackingNumber, status: "pending", events: [] };
    }
    // Use /api/track, not /api/track/full: despite the name, `full` returns an `updates`
    // array whose status/code fields come back as Odoo `false` placeholders, while /api/track
    // carries the real `travel_history`. An unknown AWB comes back as {"error":"Shipment Not
    // found"} on HTTP 200 — unwrap() turns that into a CarrierError rather than letting it
    // read as an empty history on a live shipment.
    const data = this.unwrap(await httpJson(
      `${this.baseUrl()}${ZAJIL_ENDPOINTS.track}?environment=${this.environment()}`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ awb: trackingNumber }),
      },
      this.name,
    ));

    const shipmentData = data?.shipment_data ?? {};
    // Odoo sends `false` rather than null for blank fields, so fall through on falsy.
    const rawEvents: any[] = Array.isArray(data?.travel_history) ? data.travel_history : [];
    const events: TrackingEvent[] = rawEvents.map((e) => ({
      timestamp: zajilDate(e?.entry_date),
      status: String(e?.activities || ""),
      description: String(e?.comment || e?.activities || ""),
      location: e?.new_location || undefined,
    }));
    const latest = rawEvents[rawEvents.length - 1];

    return {
      trackingNumber,
      status: String(shipmentData?.status || latest?.activities || "in_transit").toLowerCase(),
      events,
    };
  }

  async cancelShipment(trackingNumber: string): Promise<boolean> {
    // Zajil's Shipment Integration API has no cancel endpoint — cancellation goes through
    // Zajil operations. Report failure so the caller keeps the booking rather than marking
    // it cancelled on our side while it is still live with the carrier.
    logWarn(`${this.name}: no cancel API — cancel ${trackingNumber} with Zajil operations directly.`);
    return false;
  }
}

// ─── Fizzpa (فيزبا) ───────────────────────────────────────────────────────────────────
// Aggregator provider reached only through client-facing virtual carriers (see
// virtualCarriers). Raw-key auth (`Authorization: <key>`, NOT Bearer) plus a required
// `Referer` header. No rate-quote endpoint and no downstream-carrier selection — routing
// is internal to Fizzpa. We surface downstream couriers as virtual carriers and pass the
// chosen courier as `OrderNote`. City IDs are numeric and come from a static spreadsheet
// (no live cities API), so an admin supplies a name→id map via FIZZPA_CITY_MAP (JSON).
const FIZZPA_ENDPOINTS = {
  verify: "/Auth/me",
  createOrder: "/orders",
  readOrder: (id: string) => `/orders/${encodeURIComponent(id)}`,
  cancel: (id: string) => `/orders/${encodeURIComponent(id)}`,
  label: (id: string, lingo: string, size: string) =>
    `/orders/label/${encodeURIComponent(id)}/${lingo}/${size}`,
  track: (id: string) => `/Tracking/${encodeURIComponent(id)}`,
};

export class FizzpaAdapter extends LocalCarrierAdapter {
  name = "Fizzpa";
  carrierCode = "FIZZPA";
  protected envPrefix = "FIZZPA";
  protected defaultBaseUrl = "https://rest.fizzpa.net/api";

  capabilities: CarrierCapabilityProfile = {
    type: "local",
    domesticCountries: ["SA"],
    domesticZones: true,
    labelFormat: "PDF",
    trackingMode: "poll",
    providerOnly: true,
  };

  isConfigured(): boolean {
    return Boolean(this.env("API_KEY"));
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: this.env("API_KEY") || "",
    };
    const referer = this.env("REFERER");
    if (referer) headers.Referer = referer;
    return headers;
  }

  // City name → Fizzpa numeric CityId. Sourced from Fizzpa's Cities.xlsx (no live API), so
  // the admin pastes a JSON `{ "riyadh": 1, "jeddah": 2 }` map into FIZZPA_CITY_MAP.
  private resolveCityId(city: string): number | undefined {
    const raw = this.env("CITY_MAP");
    if (!raw) return undefined;
    let map: Record<string, unknown>;
    try {
      map = JSON.parse(raw);
    } catch {
      logWarn(`${this.name}: FIZZPA_CITY_MAP is not valid JSON — cannot resolve city IDs.`);
      return undefined;
    }
    const key = (city || "").trim().toLowerCase();
    const value = map[key] ?? map[(city || "").trim()];
    const id = Number(value);
    return Number.isInteger(id) ? id : undefined;
  }

  async getRates(_request: RateRequest): Promise<RateResponse[]> {
    // Fizzpa exposes no rate-quote endpoint (price is only returned on a created order).
    // Return no live rate so the stored rate-card (per virtual carrier) is used.
    logInfo(`${this.name}: no rate-quote API, using rate card.`);
    return [];
  }

  async createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse> {
    if (!this.isConfigured()) this.notConfigured();

    const recipientCityId = this.resolveCityId(request.recipient.city);
    if (recipientCityId == null) {
      throw new CarrierError(
        "CITY_NOT_RESOLVED",
        `${this.name}: no Fizzpa CityId for "${request.recipient.city}". Add it to FIZZPA_CITY_MAP in the Apps tab.`,
      );
    }
    const senderCityId = this.resolveCityId(request.shipper.city);

    const payload: Record<string, unknown> = {
      SenderName: request.shipper.name,
      SenderPhone: request.shipper.phone,
      SenderAddress: fullAddress(request.shipper),
      ...(senderCityId != null ? { SenderCityId: senderCityId } : {}),
      RecipientName: request.recipient.name,
      RecipientPhone1: request.recipient.phone,
      RecipientAddress: fullAddress(request.recipient),
      RecipientCityId: recipientCityId,
      RecipientCityName: request.recipient.city,
      OrderPiecesCount: request.packages.length || 1,
      OrderTotalWeight: toKg(request.packages),
      CodAmount: 0,
      OrderNote: request.note || "",
    };

    const body = await httpJson(`${this.baseUrl()}${FIZZPA_ENDPOINTS.createOrder}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
    }, this.name);

    const orderId = String(
      body?.OrderId ?? body?.orderId ?? body?.id ?? body?.Id ?? body?.orderNumber ?? "",
    ).trim();
    if (!orderId) {
      throw new CarrierError("BOOKING_FAILED", `${this.name}: ${body?.message || "order returned no id."}`);
    }

    const labelData = await this.fetchLabel(orderId).catch((err) => {
      logWarn(`${this.name}: label fetch failed for ${orderId}: ${(err as Error).message}`);
      return undefined;
    });

    return {
      trackingNumber: orderId,
      carrierTrackingNumber: orderId,
      labelData,
      serviceType: "LOCAL",
    };
  }

  private async fetchLabel(orderId: string): Promise<string | undefined> {
    const url = `${this.baseUrl()}${FIZZPA_ENDPOINTS.label(orderId, "en", "A6")}`;
    let res: Response;
    try {
      res = await fetch(url, { method: "GET", headers: this.headers() });
    } catch (err) {
      throw new CarrierError("NETWORK_ERROR", `${this.name}: network error calling ${url}: ${(err as Error).message}`);
    }
    if (!res.ok) {
      throw new CarrierError(`HTTP_${res.status}`, `${this.name}: label request failed (${res.statusText})`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer.length > 0 ? buffer.toString("base64") : undefined;
  }

  async trackShipment(trackingNumber: string): Promise<TrackingResponse> {
    if (!this.isConfigured()) {
      return { trackingNumber, status: "pending", events: [] };
    }
    const body = await httpJson(`${this.baseUrl()}${FIZZPA_ENDPOINTS.track(trackingNumber)}`, {
      method: "GET",
      headers: this.headers(),
    }, this.name);
    const rawEvents: any[] = body?.events || body?.History || body?.tracking || [];
    const events: TrackingEvent[] = rawEvents.map((e) => ({
      timestamp: new Date(e.date || e.Date || e.timestamp || Date.now()),
      status: String(e.status || e.Status || ""),
      description: String(e.description || e.Description || e.status || ""),
      location: e.location || e.Location || e.city,
    }));
    const latest = rawEvents[rawEvents.length - 1];
    return {
      trackingNumber,
      status: String(latest?.status || body?.status || body?.Status || "in_transit").toLowerCase(),
      events,
    };
  }

  async cancelShipment(trackingNumber: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    // Fizzpa allows DELETE only before pickup; after pickup it fails out-of-band.
    try {
      await httpJson(`${this.baseUrl()}${FIZZPA_ENDPOINTS.cancel(trackingNumber)}`, {
        method: "DELETE",
        headers: this.headers(),
      }, this.name);
      return true;
    } catch (err) {
      logWarn(`${this.name}: cancel failed for ${trackingNumber} (only allowed before pickup): ${(err as Error).message}`);
      return false;
    }
  }
}

// ─── Shipox ──────────────────────────────────────────────────────────────────────────
// Aggregator DMS reached only through client-facing virtual carriers (see virtualCarriers).
// Customer/tenant API with JWT auth (cache token, refresh on 401). No downstream-carrier
// selection — routing is internal to Shipox. We surface downstream couriers as virtual
// carriers and pass the chosen courier as the order `note`. Rate API exists but is a
// blended tariff and geocode-driven, so we price off the stored rate-card instead.
const SHIPOX_ENDPOINTS = {
  authenticate: "/api/v1/customer/authenticate",
  createOrder: "/api/v2/customer/order",
  status: (id: string) => `/api/v1/customer/order/${encodeURIComponent(id)}/status`,
  history: (orderNumber: string) => `/api/v1/customer/order/${encodeURIComponent(orderNumber)}/history_items`,
};

export class ShipoxAdapter extends LocalCarrierAdapter {
  name = "Shipox";
  carrierCode = "SHIPOX";
  protected envPrefix = "SHIPOX";
  protected defaultBaseUrl = "https://prodapi.shipox.com";

  capabilities: CarrierCapabilityProfile = {
    type: "local",
    domesticCountries: ["SA", "AE"],
    domesticZones: true,
    labelFormat: "PDF",
    trackingMode: "poll",
    providerOnly: true,
  };

  private token: string | null = null;

  isConfigured(): boolean {
    return Boolean(this.env("USERNAME") && this.env("PASSWORD"));
  }

  // Cache the JWT and reuse it; force=true re-authenticates after a 401.
  private async getToken(force = false): Promise<string> {
    if (this.token && !force) return this.token;
    const body = await httpJson(`${this.baseUrl()}${SHIPOX_ENDPOINTS.authenticate}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username: this.env("USERNAME"), password: this.env("PASSWORD") }),
    }, this.name);
    const token = String(body?.id_token ?? body?.data?.id_token ?? body?.token ?? "").trim();
    if (!token) {
      throw new CarrierError("AUTH_FAILED", `${this.name}: authentication returned no token.`);
    }
    this.token = token;
    return token;
  }

  // Call an authenticated endpoint, transparently refreshing the token once on a 401.
  private async authed(path: string, init: Omit<RequestInit, "headers"> & { headers?: Record<string, string> }): Promise<any> {
    const run = async (token: string) =>
      httpJson(`${this.baseUrl()}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...(init.headers || {}),
        },
      }, this.name);
    try {
      return await run(await this.getToken());
    } catch (err) {
      if (err instanceof CarrierError && err.code === "HTTP_401") {
        return run(await this.getToken(true));
      }
      throw err;
    }
  }

  async getRates(_request: RateRequest): Promise<RateResponse[]> {
    // Shipox's rate API returns a blended, geocode-driven tariff with an opaque carrier;
    // we price off the stored rate-card (per virtual carrier) instead.
    logInfo(`${this.name}: pricing from rate card (blended tariff API not used).`);
    return [];
  }

  async createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse> {
    if (!this.isConfigured()) this.notConfigured();

    const payload = {
      sender_data: {
        name: request.shipper.name,
        phone: request.shipper.phone,
        address: fullAddress(request.shipper),
        city: request.shipper.city,
        country: request.shipper.countryCode,
      },
      recipient_data: {
        name: request.recipient.name,
        phone: request.recipient.phone,
        address: fullAddress(request.recipient),
        city: request.recipient.city,
        country: request.recipient.countryCode,
      },
      dimensions: { weight: toKg(request.packages) },
      package_type: "PARCEL",
      payment_type: "prepaid",
      parcel_value: request.declaredValue ?? 0,
      note: request.note || "",
    };

    const body = await this.authed(SHIPOX_ENDPOINTS.createOrder, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = body?.data ?? body;
    const orderNumber = String(data?.order_number ?? data?.id ?? "").trim();
    if (!orderNumber) {
      throw new CarrierError("BOOKING_FAILED", `${this.name}: ${body?.message || "order returned no number."}`);
    }
    return {
      trackingNumber: orderNumber,
      carrierTrackingNumber: orderNumber,
      serviceType: "LOCAL",
    };
  }

  async trackShipment(trackingNumber: string): Promise<TrackingResponse> {
    if (!this.isConfigured()) {
      return { trackingNumber, status: "pending", events: [] };
    }
    const body = await this.authed(SHIPOX_ENDPOINTS.history(trackingNumber), { method: "GET" });
    const rawEvents: any[] = body?.data?.list || body?.data || body?.list || [];
    const events: TrackingEvent[] = (Array.isArray(rawEvents) ? rawEvents : []).map((e) => ({
      timestamp: new Date(e.created_at || e.date || e.timestamp || Date.now()),
      status: String(e.status || e.state || ""),
      description: String(e.note || e.description || e.status || ""),
      location: e.location || e.city,
    }));
    const latest = events[events.length - 1];
    return {
      trackingNumber,
      status: String(latest?.status || "in_transit").toLowerCase(),
      events,
    };
  }

  async cancelShipment(trackingNumber: string): Promise<boolean> {
    // Shipox order cancellation goes through a status update whose exact path is account
    // specific; report failure so the caller keeps the booking rather than marking it
    // cancelled locally while still live with Shipox.
    logWarn(`${this.name}: no confirmed cancel endpoint — cancel ${trackingNumber} with Shipox operations directly.`);
    return false;
  }
}

// ─── iMile ───────────────────────────────────────────────────────────────────────────
// iMile is a "both"-type carrier: it serves domestic KSA/AE last-mile *and* cross-border
// lanes, so it surfaces in the local carrier list and the international/express list alike.
// iMile OpenAPI (https://openapi.52imile.cn test / https://openapi.imile.com prod). Unlike
// the header-authed local carriers above, iMile wraps every request in a JSON envelope:
//   { customerId, sign, signMethod, format, version, timestamp, timeZone, accessToken, param }
// where `param` carries the actual payload. Auth is a two-step flow:
//   1. POST /auth/accessToken/grant with param {grantType:"clientCredential"} → a 2-hour
//      accessToken (cached per customerId+host below).
//   2. Every other call repeats the envelope plus that accessToken.
// The `sign` is the API secret issued by iMile; with signMethod "SimpleKey" (the default and
// what the test account uses) it is sent verbatim — no hashing. iMile can also accept
// signMethod "MD5"/"SHA256" per contract, exposed via IMILE_SIGN_METHOD for future accounts.
//
// Responses are HTTP 200 with an app-level `code` ("200" = success); failures (401 bad sign,
// 402 missing / 407 invalid token) surface in the body, so we detect them there and refresh
// the token once on 402/407. Country names are iMile-specific ("KSA", "UAE", ALPHA-3 for the
// rest). getRates calls the live shipping-fee estimate (/client/order/calShippingFee →
// data.totalAmount) and falls back to the stored rate-card when the lane's product is not
// enabled or the estimate errors. createOrder returns the AWB (`expressNo`) and the label as
// base64 (`imileAwb`); deleteOrder cancels before pickup; track/getOne returns a `locus` history.
const IMILE_ENDPOINTS = {
  grant: "/auth/accessToken/grant",
  estimateFee: "/client/order/calShippingFee",
  createOrder: "/client/order/v2/createOrder",
  deleteOrder: "/client/order/deleteOrder",
  track: "/client/track/getOne",
  reprint: "/client/order/batchRePrintOrder",
};

// Platform ALPHA-2 → iMile's country naming (KSA/UAE are not ALPHA-3). Unknown codes fall
// through as-is (best effort). SA is the primary lane.
const IMILE_COUNTRY: Record<string, string> = {
  SA: "KSA", AE: "UAE", CN: "CHN", KW: "KWT", BH: "BHR", TR: "TUR", OM: "OMN",
  MX: "MEX", QA: "QAT", EG: "EGY", JO: "JOR", BR: "BRA", AU: "AUS", GB: "GBR",
};

function imileCountry(code: string): string {
  const key = (code || "").trim().toUpperCase();
  return IMILE_COUNTRY[key] || key;
}

function imileCm(value: number | undefined, unit: "IN" | "CM" | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  const cm = unit === "IN" ? value * 2.54 : value;
  return Math.round(cm * 100) / 100;
}

// Access tokens live 2h and are shared across requests; key by host+customerId so distinct
// iMile accounts (or environments) never reuse each other's token.
const IMILE_TOKENS = new Map<string, { token: string; expiresAt: number }>();

export class IMileAdapter extends LocalCarrierAdapter {
  name = "iMile";
  carrierCode = "IMILE";
  protected envPrefix = "IMILE";
  protected defaultBaseUrl = "https://openapi.52imile.cn";

  // "both": iMile serves domestic KSA/AE last-mile AND cross-border lanes, so it appears in
  // the local carrier list (getLocalCarriers) and the international/express list alike. Its
  // createOrder + calShippingFee map countries generically, so cross-border lanes work once
  // the account's product is enabled for them.
  capabilities: CarrierCapabilityProfile = {
    type: "both",
    domesticCountries: ["SA", "AE"],
    domesticZones: true,
    labelFormat: "PDF",
    trackingMode: "poll",
  };

  isConfigured(): boolean {
    return Boolean(this.env("CUSTOMER_ID") && this.env("SIGN"));
  }

  private tokenKey(): string {
    return `${this.baseUrl()}|${this.env("CUSTOMER_ID")}`;
  }

  private envelope(param: Record<string, unknown>, accessToken?: string): Record<string, unknown> {
    return {
      customerId: this.env("CUSTOMER_ID"),
      sign: this.env("SIGN"),
      signMethod: this.env("SIGN_METHOD") || "SimpleKey",
      format: "json",
      version: this.env("VERSION") || "1.0.0",
      timestamp: Date.now(),
      timeZone: this.env("TIME_ZONE") || "+3",
      ...(accessToken ? { accessToken } : {}),
      param,
    };
  }

  /** POST an envelope; return `data`, throwing a CarrierError on a non-200 app code. */
  private async rawCall(path: string, param: Record<string, unknown>, withToken = true): Promise<any> {
    const accessToken = withToken ? await this.getToken() : undefined;
    const body = await httpJson(`${this.baseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(this.envelope(param, accessToken)),
    }, this.name);
    const code = String(body?.code ?? "");
    if (code && code !== "200") {
      throw new CarrierError(`IMILE_${code}`, `${this.name}: ${body?.message || "request rejected"} (code ${code})`);
    }
    return body?.data;
  }

  /** Authenticated call that refreshes the token once on a missing/invalid-token code. */
  private async call(path: string, param: Record<string, unknown>): Promise<any> {
    try {
      return await this.rawCall(path, param);
    } catch (err) {
      if (err instanceof CarrierError && (err.code === "IMILE_402" || err.code === "IMILE_407")) {
        IMILE_TOKENS.delete(this.tokenKey());
        return await this.rawCall(path, param);
      }
      throw err;
    }
  }

  private async getToken(): Promise<string> {
    const cached = IMILE_TOKENS.get(this.tokenKey());
    // Refresh a minute early to avoid racing the 2h expiry mid-request.
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const data = await this.rawCall(IMILE_ENDPOINTS.grant, { grantType: "clientCredential" }, false);
    const token = String(data?.accessToken ?? "").trim();
    if (!token) {
      throw new CarrierError("AUTH_FAILED", `${this.name}: access-token grant returned no token.`);
    }
    const expiresIn = Number(data?.expiresIn) || 7200;
    IMILE_TOKENS.set(this.tokenKey(), { token, expiresAt: Date.now() + expiresIn * 1000 });
    return token;
  }

  /** Shortened address block for the shipping-fee estimate (no contact/phone fields). */
  private feeAddress(a: ShippingAddress): Record<string, unknown> {
    return {
      country: imileCountry(a.countryCode),
      province: a.stateOrProvince || "",
      city: a.city,
      area: a.stateOrProvince || a.city,
      zipCode: a.postalCode || "",
    };
  }

  /** Total package volume in cm³ (iMile's totalVolume unit, per createOrder), or undefined. */
  private totalVolumeCm3(packages: RateRequest["packages"]): number | undefined {
    let volume = 0;
    for (const p of packages) {
      const d = p.dimensions;
      if (!d) continue;
      const f = d.unit === "IN" ? 2.54 : 1;
      volume += (d.length * f) * (d.width * f) * (d.height * f);
    }
    return volume > 0 ? Math.round(volume * 100) / 100 : undefined;
  }

  private addressInfo(a: ShippingAddress, addressType: string): Record<string, unknown> {
    return {
      addressType,
      contactCompany: a.name,
      contacts: a.name,
      phone: a.phone,
      email: a.email || "",
      country: imileCountry(a.countryCode),
      province: a.stateOrProvince || "",
      city: a.city,
      area: a.stateOrProvince || a.city,
      address: fullAddress(a),
      zipCode: a.postalCode || "",
    };
  }

  async getRates(request: RateRequest): Promise<RateResponse[]> {
    if (!this.isConfigured()) {
      logInfo(`${this.name}: not configured, no live rates (rate card fallback applies)`);
      return [];
    }
    const weightKg = toKg(request.packages);
    // totalVolume is a REQUIRED field on calShippingFee (omitting it → 402 NotNull). Use the
    // package volume (cm³) when dimensions are present; otherwise a volumetric-neutral nominal
    // (weight × 6000 cm³/kg divisor → volumetric weight ≈ actual weight, no dimensional
    // penalty on a dimensionless quick lookup). Unit assumed cm³ per the createOrder context;
    // confirm with iMile if dimensional pricing ever looks off.
    const totalVolume = this.totalVolumeCm3(request.packages) ?? Math.round(weightKg * 6000);
    try {
      // /client/order/calShippingFee: iMile's live shipping-fee estimate (data.totalAmount).
      const data = await this.call(IMILE_ENDPOINTS.estimateFee, {
        senderInfo: this.feeAddress(request.shipper),
        consigneeInfo: this.feeAddress(request.recipient),
        orderType: "100",
        paymentMethod: "PPD",
        goodsType: "Normal",
        totalWeight: String(weightKg),
        clientDeclaredValue: "0",
        clientDeclaredCurrency: "Local",
        collectingMoney: "",
        totalVolume: String(totalVolume),
        isCustomsClearanceRequired: "",
      });
      const amount = Number(data?.totalAmount);
      if (!Number.isFinite(amount) || amount <= 0) return [];
      return [{
        baseRate: amount,
        currency: data?.currency || "SAR",
        serviceType: "LOCAL",
        transitDays: Number(data?.aging) || 3,
        serviceName: `${this.name} Domestic`,
        chargeableWeight: Number(data?.weight) || weightKg,
        chargeableWeightUnit: "KG",
        chargeableWeightSource: "carrier",
      }];
    } catch (err) {
      // A rejected estimate (e.g. product not enabled for a lane) is non-fatal — the stored
      // rate-card then prices the shipment, same as the other local carriers.
      logWarn(`${this.name}: live rate lookup failed, using rate card. ${(err as Error).message}`);
      return [];
    }
  }

  async createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse> {
    if (!this.isConfigured()) this.notConfigured();

    const dim = request.packages[0]?.dimensions;
    const dims = dim
      ? {
          length: imileCm(dim.length, dim.unit),
          width: imileCm(dim.width, dim.unit),
          high: imileCm(dim.height, dim.unit),
        }
      : {};

    const consignee = {
      ...this.addressInfo(request.recipient, "Seller"),
      // Saudi national-address short code (streetLine3) maps to iMile's shortAddress.
      shortAddress: request.recipient.streetLine3 || "",
    };

    const param: Record<string, unknown> = {
      orderNo: `EZ${Date.now()}${Math.floor(Math.random() * 1000)}`,
      orderType: "100",
      senderInfo: this.addressInfo(request.shipper, "warehouse"),
      consigneeInfo: consignee,
      serviceInfo: {
        pickupService: "1",
        deliveryService: "Delivery",
        ...(request.note ? { deliveryRequirements: request.note } : {}),
      },
      packageInfo: {
        goodsType: "Normal",
        paymentMethod: "PPD",
        collectingMoney: "0",
        clientDeclaredValue: String(request.declaredValue ?? 0),
        clientDeclaredCurrency: request.currency || "SAR",
        totalCount: String(request.packages.length || 1),
        grossWeight: String(toKg(request.packages)),
        ...dims,
      },
      ...(request.items?.length
        ? {
            skuInfos: request.items.map((item) => ({
              skuName: item.description,
              skuDesc: item.description,
              skuQty: String(item.quantity ?? 1),
              skuDeclaredValue: String(item.unitPrice ?? 0),
              ...(item.hsCode ? { skuHsCode: item.hsCode } : {}),
            })),
          }
        : {}),
    };

    const data = await this.call(IMILE_ENDPOINTS.createOrder, param);
    const awb = String(data?.expressNo ?? data?.waybillNo ?? data?.billNo ?? "").trim();
    if (!awb) {
      throw new CarrierError("BOOKING_FAILED", `${this.name}: booking returned no waybill.`);
    }
    // iMile returns the A6 label PDF inline as base64 on `imileAwb`.
    const labelData: string | undefined = data?.imileAwb || undefined;
    return {
      trackingNumber: awb,
      carrierTrackingNumber: awb,
      labelData,
      serviceType: "LOCAL",
    };
  }

  async trackShipment(trackingNumber: string): Promise<TrackingResponse> {
    if (!this.isConfigured()) {
      return { trackingNumber, status: "pending", events: [] };
    }
    // orderType 1 = query by waybill number; language 2 = English.
    const data = await this.call(IMILE_ENDPOINTS.track, {
      orderType: "1",
      orderNo: trackingNumber,
      language: "2",
    });
    // `locus` arrives newest-first; reverse to chronological so events[last] is the latest.
    const rawLocus: any[] = Array.isArray(data?.locus) ? [...data.locus].reverse() : [];
    const events: TrackingEvent[] = rawLocus.map((e) => ({
      timestamp: new Date(String(e?.latestStatusTime || "").replace(" ", "T") || Date.now()),
      status: String(e?.latestStatus || ""),
      description: String(e?.locusDetailed || e?.latestStatus || ""),
      location: e?.latestSite || undefined,
    }));
    return {
      trackingNumber,
      status: String(data?.latestStatus || events[events.length - 1]?.status || "in_transit").toLowerCase(),
      events,
    };
  }

  async cancelShipment(trackingNumber: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      // iMile only allows cancellation before pickup.
      await this.call(IMILE_ENDPOINTS.deleteOrder, { waybillNo: trackingNumber });
      return true;
    } catch (err) {
      logWarn(`${this.name}: cancel failed for ${trackingNumber} (only allowed before pickup): ${(err as Error).message}`);
      return false;
    }
  }
}

export const smsaAdapter = new SmsaAdapter();
export const naqelAdapter = new NaqelAdapter();
export const jtAdapter = new JtAdapter();
export const redboxAdapter = new RedboxAdapter();
export const zajilAdapter = new ZajilAdapter();
export const imileAdapter = new IMileAdapter();
export const fizzpaAdapter = new FizzpaAdapter();
export const shipoxAdapter = new ShipoxAdapter();
