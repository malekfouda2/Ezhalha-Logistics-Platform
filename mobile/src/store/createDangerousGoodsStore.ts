import { create } from "zustand";
import { Address, CustomsItem, TradeDocument, PackageItem, defaultCustomsItem } from "@/store/createExpressShipmentStore";
import {
  DgContentKind,
  DgContentKindValue,
  DgRegulation,
  DgRegulationValue,
  DgPackingGroupValue,
  DgQuantityTypeValue,
  DangerousGoodsDocumentTypeValue,
} from "@shared/dangerous-goods";

export type DgShipmentDirection = "domestic" | "inbound" | "outbound";

export interface DgDraftCommodity {
  unNumber?: string;
  properShippingName?: string;
  technicalName?: string;
  hazardClass?: string;
  packingGroup?: DgPackingGroupValue;
  packingInstruction?: string;
  quantity?: { amount?: number; units?: string; quantityType?: DgQuantityTypeValue };
  cargoAircraftOnly?: boolean;
  /** Set when this field came from SDS extraction rather than the client typing it in. */
  fromDocument?: boolean;
  missingFields?: string[];
}

export interface DgDraftPackage {
  packageIndex: number;
  commodities: DgDraftCommodity[];
}

export interface DgDocument {
  fileName: string;
  objectPath: string;
  contentType: string;
  size: number;
  documentType: DangerousGoodsDocumentTypeValue;
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

interface DangerousGoodsState {
  shipmentType: DgShipmentDirection | "";
  shipper: Address;
  recipient: Address;

  packages: PackageItem[];
  weightUnit: "LB" | "KG";
  dimensionUnit: "IN" | "CM";
  packageType: string;
  currency: string;

  contentKind: DgContentKindValue | "";
  regulation: DgRegulationValue;
  dryIceWeightKg?: number;
  dgPackages: DgDraftPackage[];
  dgDocuments: DgDocument[];
  extractionWarnings: string[];
  extractionNotDangerousGoods: boolean;

  customsInputMode: "invoice" | "manual";
  items: CustomsItem[];
  tradeDocuments: TradeDocument[];

  preferredPickupDate: string;
  specialInstructions: string;

  setShipmentType: (v: DgShipmentDirection) => void;
  setShipper: (a: Address) => void;
  setRecipient: (a: Address) => void;

  setPackages: (p: PackageItem[]) => void;
  updatePackage: (index: number, patch: Partial<PackageItem>) => void;
  addPackage: () => void;
  removePackage: (index: number) => void;
  setWeightUnit: (u: "LB" | "KG") => void;
  setDimensionUnit: (u: "IN" | "CM") => void;
  setPackageType: (t: string) => void;

  setContentKind: (v: DgContentKindValue) => void;
  setRegulation: (v: DgRegulationValue) => void;

  addDgDocument: (doc: DgDocument) => void;
  removeDgDocument: (index: number) => void;
  setDgPackageCommodities: (packageIndex: number, commodities: DgDraftCommodity[]) => void;
  setExtractionWarnings: (warnings: string[]) => void;
  setExtractionNotDangerousGoods: (v: boolean) => void;

  setCustomsInputMode: (m: "invoice" | "manual") => void;
  setItems: (items: CustomsItem[]) => void;
  updateItem: (index: number, patch: Partial<CustomsItem>) => void;
  addItem: (item?: CustomsItem) => void;
  removeItem: (index: number) => void;
  setTradeDocuments: (docs: TradeDocument[]) => void;
  clearInvoiceDocument: () => void;

  setPreferredPickupDate: (v: string) => void;
  setSpecialInstructions: (v: string) => void;

  reset: () => void;
}

const initialState = {
  shipmentType: "" as DgShipmentDirection | "",
  shipper: { ...emptyAddress },
  recipient: { ...emptyAddress },
  packages: [{ weight: 1, length: 10, width: 10, height: 10 }] as PackageItem[],
  weightUnit: "KG" as const,
  dimensionUnit: "CM" as const,
  packageType: "YOUR_PACKAGING",
  currency: "SAR",

  // Matches the web wizard's default (client/src/pages/client/create-shipment.tsx) — most
  // dangerous goods declarations end up fully regulated, so pre-selecting it means a client
  // who doesn't touch step 5 still lands on a sane choice rather than nothing.
  contentKind: DgContentKind.FULLY_REGULATED as DgContentKindValue | "",
  regulation: DgRegulation.IATA,
  dryIceWeightKg: undefined as number | undefined,
  // The server's draft schema requires at least one commodity per package — matches web's
  // defaultDangerousGoodsCommodity (create-shipment.tsx), a placeholder ops completes by
  // hand if the client never uploads anything the extractor can read.
  dgPackages: [{ packageIndex: 0, commodities: [{}] }] as DgDraftPackage[],
  dgDocuments: [] as DgDocument[],
  extractionWarnings: [] as string[],
  extractionNotDangerousGoods: false,

  customsInputMode: "manual" as const,
  items: [] as CustomsItem[],
  tradeDocuments: [] as TradeDocument[],

  preferredPickupDate: "",
  specialInstructions: "",
};

export const useDangerousGoodsStore = create<DangerousGoodsState>((set) => ({
  ...initialState,

  setShipmentType: (v) => set({ shipmentType: v }),
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

  setContentKind: (v) => set({ contentKind: v }),
  setRegulation: (v) => set({ regulation: v }),

  addDgDocument: (doc) => set((s) => ({ dgDocuments: [...s.dgDocuments, doc] })),
  removeDgDocument: (index) =>
    set((s) => ({ dgDocuments: s.dgDocuments.filter((_, i) => i !== index) })),
  setDgPackageCommodities: (packageIndex, commodities) =>
    set((s) => {
      const existing = s.dgPackages.find((p) => p.packageIndex === packageIndex);
      if (!existing) {
        return { dgPackages: [...s.dgPackages, { packageIndex, commodities }] };
      }
      return {
        dgPackages: s.dgPackages.map((p) =>
          p.packageIndex === packageIndex ? { ...p, commodities } : p,
        ),
      };
    }),
  setExtractionWarnings: (warnings) => set({ extractionWarnings: warnings }),
  setExtractionNotDangerousGoods: (v) => set({ extractionNotDangerousGoods: v }),

  setCustomsInputMode: (m) => set({ customsInputMode: m }),
  setItems: (items) => set({ items }),
  updateItem: (index, patch) =>
    set((s) => ({
      items: s.items.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    })),
  addItem: (item) =>
    set((s) => ({ items: [...s.items, item ?? { ...defaultCustomsItem }] })),
  removeItem: (index) =>
    set((s) => ({ items: s.items.filter((_, i) => i !== index) })),
  setTradeDocuments: (docs) => set({ tradeDocuments: docs }),
  clearInvoiceDocument: () => set({ tradeDocuments: [], items: [] }),

  setPreferredPickupDate: (v) => set({ preferredPickupDate: v }),
  setSpecialInstructions: (v) => set({ specialInstructions: v }),

  reset: () =>
    set({
      ...initialState,
      shipper: { ...emptyAddress },
      recipient: { ...emptyAddress },
      packages: [{ weight: 1, length: 10, width: 10, height: 10 }],
      dgPackages: [{ packageIndex: 0, commodities: [{}] }],
      dgDocuments: [],
      items: [],
    }),
}));
