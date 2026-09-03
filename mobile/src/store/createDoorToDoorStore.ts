import { create } from "zustand";
import { Address, CustomsItem, TradeDocument, CheckoutResponse, ConfirmResponse, PackageItem, defaultCustomsItem } from "@/store/createExpressShipmentStore";
import { DdpTransportMethodValue } from "@shared/domain";

export interface DdpLane {
  id: string;
  originCountryCode: string;
  originCity?: string | null;
  destinationCountryCode: string;
  destinationCity?: string | null;
  airAvailable: boolean;
  seaAvailable: boolean;
  domesticAvailable: boolean;
}

export interface DdpPricingPackage {
  index: number;
  actualWeightKg: number;
  dimensionalWeightKg: number;
  chargeableWeightKg: number;
  usesDimensionalWeight: boolean;
}

export interface DdpPricing {
  billingUnit: "KG" | "CBM";
  billableQuantity: number;
  ratePerUnitSar: number;
  baseRateSar: number;
  markupAmountSar: number;
  totalAmountSar: number;
  actualWeightKg: number;
  dimensionalWeightKg: number;
  totalCbm: number;
  packages: DdpPricingPackage[];
  transitDaysMin?: number | null;
  transitDaysMax?: number | null;
}

export interface DdpQuote {
  quoteId: string;
  expiresAt: string;
  pricing: DdpPricing;
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

interface DoorToDoorState {
  transportMethod: DdpTransportMethodValue;
  originCountryCode: string;
  destinationCountryCode: string;

  recipient: Address;

  supplierName: string;
  supplierPhone: string;
  supplierAddress: string;

  packages: PackageItem[];
  totalCbm: number;

  quote: DdpQuote | null;

  items: CustomsItem[];
  invoiceDocument: TradeDocument | null;
  packingListDocument: TradeDocument | null;

  specialInstructions: string;
  acceptedCustoms: boolean;
  acceptedTerms: boolean;
  acceptedBroker: boolean;

  checkoutData: CheckoutResponse | null;
  confirmData: ConfirmResponse | null;

  lastRatesSignature: string | null;
  lastCheckoutSignature: string | null;

  setTransportMethod: (v: DdpTransportMethodValue) => void;
  setOriginCountryCode: (v: string) => void;
  setDestinationCountryCode: (v: string) => void;

  setRecipient: (a: Address) => void;

  setSupplierName: (v: string) => void;
  setSupplierPhone: (v: string) => void;
  setSupplierAddress: (v: string) => void;

  setPackages: (p: PackageItem[]) => void;
  updatePackage: (index: number, patch: Partial<PackageItem>) => void;
  addPackage: () => void;
  removePackage: (index: number) => void;
  setTotalCbm: (v: number) => void;

  setQuote: (q: DdpQuote | null) => void;

  setItems: (items: CustomsItem[]) => void;
  updateItem: (index: number, patch: Partial<CustomsItem>) => void;
  addItem: (item?: CustomsItem) => void;
  removeItem: (index: number) => void;
  setInvoiceDocument: (d: TradeDocument | null) => void;
  setPackingListDocument: (d: TradeDocument | null) => void;

  setSpecialInstructions: (v: string) => void;
  setAcceptedCustoms: (v: boolean) => void;
  setAcceptedTerms: (v: boolean) => void;
  setAcceptedBroker: (v: boolean) => void;

  setCheckoutData: (d: CheckoutResponse | null) => void;
  setConfirmData: (d: ConfirmResponse | null) => void;

  setLastRatesSignature: (s: string | null) => void;
  setLastCheckoutSignature: (s: string | null) => void;

  ratesSignature: () => string;

  reset: () => void;
}

const initialState = {
  transportMethod: "air" as DdpTransportMethodValue,
  originCountryCode: "",
  destinationCountryCode: "SA",
  recipient: { ...emptyAddress, countryCode: "SA", country: "SA" },
  supplierName: "",
  supplierPhone: "",
  supplierAddress: "",
  packages: [{ weight: 1, length: 10, width: 10, height: 10 }],
  totalCbm: 0,
  quote: null,
  items: [] as CustomsItem[],
  invoiceDocument: null,
  packingListDocument: null,
  specialInstructions: "",
  acceptedCustoms: false,
  acceptedTerms: false,
  acceptedBroker: false,
  checkoutData: null,
  confirmData: null,
  lastRatesSignature: null,
  lastCheckoutSignature: null,
};

export const useDoorToDoorStore = create<DoorToDoorState>((set, get) => ({
  ...initialState,

  setTransportMethod: (v) => set({ transportMethod: v, originCountryCode: "", quote: null, checkoutData: null, confirmData: null }),
  setOriginCountryCode: (v) => set({ originCountryCode: v, quote: null }),
  setDestinationCountryCode: (v) => set({ destinationCountryCode: v }),

  setRecipient: (a) => set({ recipient: a }),

  setSupplierName: (v) => set({ supplierName: v }),
  setSupplierPhone: (v) => set({ supplierPhone: v }),
  setSupplierAddress: (v) => set({ supplierAddress: v }),

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
  setTotalCbm: (v) => set({ totalCbm: v }),

  setQuote: (q) => set({ quote: q }),

  setItems: (items) => set({ items }),
  updateItem: (index, patch) =>
    set((s) => ({
      items: s.items.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    })),
  addItem: (item) =>
    set((s) => ({
      items: [...s.items, item ?? { ...defaultCustomsItem }],
    })),
  removeItem: (index) =>
    set((s) => ({
      items: s.items.filter((_, i) => i !== index),
    })),
  setInvoiceDocument: (d) => set({ invoiceDocument: d }),
  setPackingListDocument: (d) => set({ packingListDocument: d }),

  setSpecialInstructions: (v) => set({ specialInstructions: v }),
  setAcceptedCustoms: (v) => set({ acceptedCustoms: v }),
  setAcceptedTerms: (v) => set({ acceptedTerms: v }),
  setAcceptedBroker: (v) => set({ acceptedBroker: v }),

  setCheckoutData: (d) => set({ checkoutData: d }),
  setConfirmData: (d) => set({ confirmData: d }),

  setLastRatesSignature: (s) => set({ lastRatesSignature: s }),
  setLastCheckoutSignature: (s) => set({ lastCheckoutSignature: s }),

  ratesSignature: () => {
    const s = get();
    return JSON.stringify({
      transportMethod: s.transportMethod,
      originCountryCode: s.originCountryCode,
      recipient: s.recipient,
      supplierName: s.supplierName,
      supplierPhone: s.supplierPhone,
      packages: s.packages,
      totalCbm: s.totalCbm,
    });
  },

  reset: () =>
    set({
      ...initialState,
      recipient: { ...emptyAddress, countryCode: "SA", country: "SA" },
      packages: [{ weight: 1, length: 10, width: 10, height: 10 }],
      items: [],
    }),
}));
