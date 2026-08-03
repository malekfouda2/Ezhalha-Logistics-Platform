import { logInfo } from "../services/logger";
import { fedexAdapter, type CarrierAdapter } from "./fedex";
import { dhlAdapter } from "./dhl";
import { aramexAdapter } from "./aramex";
import { smsaAdapter, naqelAdapter, jtAdapter, redboxAdapter, zajilAdapter, imileAdapter, fizzpaAdapter, shipoxAdapter } from "./local-carriers";

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
    this.adapters.set(codeKey, adapter);
    this.adapters.set(nameKey, adapter);
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
