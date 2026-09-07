import { logInfo } from "../services/logger";
import { DangerousGoodsUnsupportedError } from "@shared/dangerous-goods";
import { fedexAdapter, type CarrierAdapter } from "./fedex";
import { dhlAdapter } from "./dhl";
import { aramexAdapter } from "./aramex";
import { smsaAdapter, naqelAdapter, jtAdapter, redboxAdapter, zajilAdapter, imileAdapter, fizzpaAdapter, shipoxAdapter } from "./local-carriers";

/**
 * Refuse a dangerous goods request on any carrier that has not declared DG capability.
 *
 * Applied at registration rather than inside each adapter so a newly added carrier is
 * DG-refusing by default — the failure mode of forgetting the guard would be booking
 * regulated goods as general cargo, which is a safety and legal problem, not a bug report.
 * Aramex in particular has no DG field in its API at all: its `Details.Services` accessorial
 * is a free-text string and no commodity structure exists, so a DG shipment sent to Aramex
 * would travel undeclared.
 */
function guardDangerousGoods(adapter: CarrierAdapter): CarrierAdapter {
  if (adapter.capabilities?.dangerousGoods?.supported) return adapter;

  return new Proxy(adapter, {
    get(target, property, receiver) {
      if (property === "getRates" || property === "createShipment") {
        const original = Reflect.get(target, property, receiver) as (...args: any[]) => any;
        // async, so the refusal arrives as a rejected promise like every other adapter
        // failure. A synchronous throw would escape the per-carrier `.catch()` in the rate
        // fan-out and take down the whole quote instead of dropping one carrier.
        return async (request: any, ...rest: any[]) => {
          if (request?.dangerousGoods) {
            throw new DangerousGoodsUnsupportedError(adapter.name);
          }
          return original.call(target, request, ...rest);
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

export class CarrierService {
  private adapters = new Map<string, CarrierAdapter>();

  constructor() {
    this.registerAdapter(fedexAdapter);
    this.registerAdapter(dhlAdapter);
    this.registerAdapter(aramexAdapter);
    this.registerAdapter(smsaAdapter);
    this.registerAdapter(naqelAdapter);
    this.registerAdapter(jtAdapter);
    this.registerAdapter(redboxAdapter);
    this.registerAdapter(zajilAdapter);
    this.registerAdapter(imileAdapter);
    // Aggregator providers — booked only via virtual carriers, hidden from the client list.
    this.registerAdapter(fizzpaAdapter);
    this.registerAdapter(shipoxAdapter);
  }

  registerAdapter(adapter: CarrierAdapter): void {
    const codeKey = adapter.carrierCode.trim().toUpperCase();
    const nameKey = adapter.name.trim().toUpperCase();
    const guarded = guardDangerousGoods(adapter);
    this.adapters.set(codeKey, guarded);
    this.adapters.set(nameKey, guarded);
    logInfo(`Registered carrier adapter: ${adapter.name} (${adapter.carrierCode}) - configured: ${adapter.isConfigured()}`);
  }

  getAdapter(carrier: string): CarrierAdapter {
    const normalized = carrier.trim().toUpperCase();
    const adapter = this.adapters.get(normalized);
    if (!adapter) {
      throw new Error(`Carrier not supported: ${carrier}`);
    }
    return adapter;
  }

  getDefaultAdapter(): CarrierAdapter {
    const configuredAdapter = this.getSupportedCarriers().find((adapter) => adapter.isConfigured());
    return configuredAdapter || fedexAdapter;
  }

  getSupportedCarriers(): CarrierAdapter[] {
    return Array.from(new Map(
      Array.from(this.adapters.values()).map((adapter) => [adapter.carrierCode, adapter]),
    ).values());
  }

  /**
   * Capability matrix for a lane. For a domestic-KSA (local) lane, returns adapters
   * whose capability profile marks them local/both and covers the destination country.
   * Configured-only filtering is left to the caller (so admins can see disabled ones).
   */
  getLocalCarriers(destinationCountryCode = "SA"): CarrierAdapter[] {
    const country = destinationCountryCode.trim().toUpperCase();
    return this.getSupportedCarriers().filter((adapter) => {
      const cap = adapter.capabilities;
      if (!cap || cap.type === "international") return false;
      // Aggregator backends are booked only through virtual carriers, never listed directly.
      if (cap.providerOnly) return false;
      if (cap.domesticCountries && !cap.domesticCountries.map((c) => c.toUpperCase()).includes(country)) {
        return false;
      }
      return true;
    });
  }
}

export const carrierService = new CarrierService();

export function getCarrierAdapter(carrier?: string | null): CarrierAdapter {
  if (!carrier || carrier.trim() === "") {
    return carrierService.getDefaultAdapter();
  }

  return carrierService.getAdapter(carrier);
}
