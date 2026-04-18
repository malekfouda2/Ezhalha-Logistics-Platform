import { logInfo } from "../services/logger";
import { fedexAdapter, type CarrierAdapter } from "./fedex";
import { dhlAdapter } from "./dhl";

export class CarrierService {
  private adapters = new Map<string, CarrierAdapter>();

  constructor() {
    this.registerAdapter(fedexAdapter);
    this.registerAdapter(dhlAdapter);
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
    return fedexAdapter;
  }

  getSupportedCarriers(): CarrierAdapter[] {
    return Array.from(new Map(
      Array.from(this.adapters.values()).map((adapter) => [adapter.carrierCode, adapter]),
    ).values());
  }
}

export const carrierService = new CarrierService();

export function getCarrierAdapter(carrier?: string | null): CarrierAdapter {
  if (!carrier || carrier.trim() === "") {
    return carrierService.getDefaultAdapter();
  }

  return carrierService.getAdapter(carrier);
}
