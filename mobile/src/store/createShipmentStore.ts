import { create } from "zustand";

export type ShipmentDirection = "domestic" | "inbound" | "outbound";

export interface Address {
  name: string;
  company?: string;
  phone: string;
  email?: string;
  countryCode: string;
  city: string;
  postalCode: string;
  addressLine1: string;
  addressLine2?: string;
  stateOrProvince?: string;
  shortAddress?: string;
  country:string
}

export interface PackageItem {
  reference?: string;
  weight: number;
  length: number;
  width: number;
  height: number;
}

// Matches @shared/schema's HsCodeSource / HsCodeConfidence value sets
export type HsCodeSource = "USER" | "FEDEX" | "HISTORY" | "UNKNOWN" | "";
export type HsCodeConfidence = "HIGH" | "MEDIUM" | "LOW" | "MISSING" | "";

export interface CustomsItem {
  itemName: string;
  itemDescription: string;
  category: string;
  material: string;
  countryOfOrigin: string;
  hsCode: string;
  hsCodeSource: HsCodeSource;
  hsCodeConfidence: HsCodeConfidence;
  hsCodeCandidates: Array<{ code: string; description: string; confidence: number }>;
  price: number;
  currency: string;
  quantity: number;
}

// Matches @shared/schema's FedExTradeDocumentType values
export type FedExTradeDocumentType =
  | "COMMERCIAL_INVOICE"
  | "PRO_FORMA_INVOICE"
  | "CERTIFICATE_OF_ORIGIN"
  | "USMCA_CERTIFICATION_OF_ORIGIN"
  | "USMCA_COMMERCIAL_INVOICE_CERTIFICATION_OF_ORIGIN"
  | "OTHER";

export interface TradeDocument {
  fileName: string;
  objectPath: string;
  contentType: string;
  size: number;
  documentType?: FedExTradeDocumentType;
}

export interface RateQuote {
  quoteId: string;
  carrierCode: string;
  carrierName: string;
  serviceType: string;
  serviceName: string;
  finalPrice: number;
  currency: string;
  transitDays: number;
  estimatedDelivery?: string;
  chargeableWeight?: number;
  chargeableWeightUnit?: "KG" | "LB";
}

export interface RatesResponse {
  quotes: RateQuote[];
  expiresAt: string;
  availableCarriers?: Array<{ code: string; name: string }>;
}

export interface CheckoutResponse {
  shipmentId: string;
  trackingNumber: string;
  amount: number;
  currency: string;
  carrierName?: string;
  serviceName?: string;
  actualWeight?: number;
  dimensionalWeight?: number;
  chargeableWeight?: number;
  chargeableWeightUnit?: "KG" | "LB";
  chargeableActualPackageCount?: number;
  chargeableDimensionalPackageCount?: number;
}

export interface ConfirmResponse {
  shipment: any;
  carrierTrackingNumber: string;
  labelUrl?: string;
  estimatedDelivery?: string;
}

export interface PickupInfo {
  custom: boolean;
  date: string;
  readyTime: string;
  closeTime: string;
  location: string;
  instructions: string;
}

const emptyAddress: Address = {
  name: "",
  company: "",
  phone: "",
  email: "",
  countryCode: "",
  city: "",
  postalCode: "",
  addressLine1: "",
  addressLine2: "",
  stateOrProvince: "",
  shortAddress: "",
  country: "",
};

export const defaultCustomsItem: CustomsItem = {
  itemName: "",
  itemDescription: "",
  category: "",
  material: "",
  countryOfOrigin: "SA",
  hsCode: "",
  hsCodeSource: "",
  hsCodeConfidence: "",
  hsCodeCandidates: [],
  price: 0,
  currency: "SAR",
  quantity: 1,
};

interface CreateShipmentState {
  shipmentType: ShipmentDirection | "";
  isDdp: boolean;

  shipper: Address;
  recipient: Address;

  packages: PackageItem[];
  weightUnit: "LB" | "KG";
  dimensionUnit: "IN" | "CM";
  packageType: string;
  currency: string;

  rates: RatesResponse | null;
  selectedQuoteId: string | null;

  customsInputMode: "invoice" | "manual";
  items: CustomsItem[];
  tradeDocuments: TradeDocument[];

  pickup: PickupInfo;

  checkoutData: CheckoutResponse | null;
  confirmData: ConfirmResponse | null;

  lastRatesSignature: string | null;
  lastCheckoutSignature: string | null;

  setShipmentType: (v: ShipmentDirection, prefill?: { shipper?: Partial<Address>; recipient?: Partial<Address> }) => void;
  setIsDdp: (v: boolean) => void;
  updateShipper: (patch: Partial<Address>) => void;
  updateRecipient: (patch: Partial<Address>) => void;
  setShipper: (a: Address) => void;
  setRecipient: (a: Address) => void;

  setPackages: (p: PackageItem[]) => void;
  updatePackage: (index: number, patch: Partial<PackageItem>) => void;
  addPackage: () => void;
  removePackage: (index: number) => void;
  setWeightUnit: (u: "LB" | "KG") => void;
  setDimensionUnit: (u: "IN" | "CM") => void;
  setPackageType: (t: string) => void;
  setCurrency: (c: string) => void;

  setRates: (r: RatesResponse | null) => void;
  setSelectedQuoteId: (id: string | null) => void;

  setCustomsInputMode: (m: "invoice" | "manual") => void;
  setItems: (items: CustomsItem[]) => void;
  updateItem: (index: number, patch: Partial<CustomsItem>) => void;
  addItem: (item?: CustomsItem) => void;
  removeItem: (index: number) => void;
  setTradeDocuments: (docs: TradeDocument[]) => void;
  clearInvoiceDocument: () => void;

  setPickup: (patch: Partial<PickupInfo>) => void;

  setCheckoutData: (d: CheckoutResponse | null) => void;
  setConfirmData: (d: ConfirmResponse | null) => void;

  setLastRatesSignature: (s: string | null) => void;
  setLastCheckoutSignature: (s: string | null) => void;

  ratesSignature: () => string;

  reset: () => void;
}

const initialState = {
  shipmentType: "" as ShipmentDirection | "",
  isDdp: false,
  shipper: { ...emptyAddress },
  recipient: { ...emptyAddress },
  packages: [{ weight: 1, length: 10, width: 10, height: 10 }],
  weightUnit: "KG" as const,
  dimensionUnit: "CM" as const,
  packageType: "YOUR_PACKAGING",
  currency: "SAR",
  rates: null,
  selectedQuoteId: null,
  customsInputMode: "manual" as const,
  items: [{ ...defaultCustomsItem }],
  tradeDocuments: [],
  pickup: { custom: false, date: "", readyTime: "09:00", closeTime: "17:00", location: "", instructions: "" },
  checkoutData: null,
  confirmData: null,
  lastRatesSignature: null,
  lastCheckoutSignature: null,
};

export const useCreateShipmentStore = create<CreateShipmentState>((set, get) => ({
  ...initialState,

  setShipmentType: (v, prefill) => {
    const empty = { ...emptyAddress };
    set((state) => {
      if (v === "domestic") {
        return {
          shipmentType: v,
          isDdp: false,
          selectedQuoteId: null,
          rates: null,
          checkoutData: null,
          confirmData: null,
          shipper: { ...empty, countryCode: "SA", ...prefill?.shipper },
          recipient: { ...empty, countryCode: "SA", ...prefill?.recipient },
        };
      }
      if (v === "inbound") {
        return {
          shipmentType: v,
          isDdp: false,
          selectedQuoteId: null,
          rates: null,
          checkoutData: null,
          confirmData: null,
          shipper: { ...empty },
          recipient: { ...empty, ...prefill?.recipient },
        };
      }
      return {
        shipmentType: v,
        isDdp: false,
        selectedQuoteId: null,
        rates: null,
        checkoutData: null,
        confirmData: null,
        shipper: { ...empty, ...prefill?.shipper },
        recipient: { ...empty },
      };
    });
  },

  setIsDdp: (v) => set({ isDdp: v }),

  updateShipper: (patch) => set((s) => ({ shipper: { ...s.shipper, ...patch } })),
  updateRecipient: (patch) => set((s) => ({ recipient: { ...s.recipient, ...patch } })),
  setShipper: (a) => set({ shipper: a }),
  setRecipient: (a) => set({ recipient: a }),

  setPackages: (p) => set({ packages: p }),
  updatePackage: (index, patch) =>
    set((s) => ({
      packages: s.packages.map((pkg, i) => (i === index ? { ...pkg, ...patch } : pkg)),
    })),
  addPackage: () =>
    set((s) => ({
      packages: [...s.packages, { weight: 1, length: 10, width: 10, height: 10 }],
    })),
  removePackage: (index) =>
    set((s) => {
      if (s.packages.length <= 1) return s;
      return { packages: s.packages.filter((_, i) => i !== index) };
    }),
  setWeightUnit: (u) => set({ weightUnit: u }),
  setDimensionUnit: (u) => set({ dimensionUnit: u }),
  setPackageType: (t) => set({ packageType: t }),
  setCurrency: (c) => set({ currency: c }),

  setRates: (r) => set({ rates: r }),
  setSelectedQuoteId: (id) => set({ selectedQuoteId: id }),

  setCustomsInputMode: (m) => set({ customsInputMode: m }),
  setItems: (items) => set({ items }),
  updateItem: (index, patch) =>
    set((s) => ({
      items: s.items.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    })),
  addItem: (item) =>
    set((s) => {
      const newItem = item ?? { ...defaultCustomsItem };
      const hasOnlyBlank = s.items.length === 1 && !s.items[0].itemName.trim();
      return { items: hasOnlyBlank ? [newItem] : [...s.items, newItem] };
    }),
  removeItem: (index) =>
    set((s) => {
      const remaining = s.items.filter((_, i) => i !== index);
      return { items: remaining.length === 0 ? [{ ...defaultCustomsItem }] : remaining };
    }),
  setTradeDocuments: (docs) => set({ tradeDocuments: docs }),
  clearInvoiceDocument: () => set({ tradeDocuments: [], items: [{ ...defaultCustomsItem }] }),

  setPickup: (patch) => set((s) => ({ pickup: { ...s.pickup, ...patch } })),

  setCheckoutData: (d) => set({ checkoutData: d }),
  setConfirmData: (d) => set({ confirmData: d }),

  setLastRatesSignature: (s) => set({ lastRatesSignature: s }),
  setLastCheckoutSignature: (s) => set({ lastCheckoutSignature: s }),

  ratesSignature: () => {
    const s = get();
    return JSON.stringify({
      shipper: s.shipper,
      recipient: s.recipient,
      packages: s.packages,
      weightUnit: s.weightUnit,
      dimensionUnit: s.dimensionUnit,
      packageType: s.packageType,
      currency: s.currency,
    });
  },

  reset: () => set({ ...initialState, packages: [{ weight: 1, length: 10, width: 10, height: 10 }], items: [{ ...defaultCustomsItem }] }),
}));

export const isInternationalShipment = (type: ShipmentDirection | "") =>
  type === "inbound" || type === "outbound";