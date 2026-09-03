import { create } from "zustand";
import { RatesResponse, CheckoutResponse, ConfirmResponse } from "@/store/createShipmentStore";

// Local (domestic KSA) shipments are a fully isolated flow — no country picker, no postal
// code, no dimensions/customs. Mirrors the server's `localAddressSchema` in routes.ts.
export interface LocalAddress {
  name: string;
  phone: string;
  city: string;
  district?: string;
  addressLine1: string;
  shortAddress?: string;
}

const emptyLocalAddress: LocalAddress = {
  name: "",
  phone: "",
  city: "",
  district: "",
  addressLine1: "",
  shortAddress: "",
};

interface CreateLocalShipmentState {
  shipper: LocalAddress;
  recipient: LocalAddress;

  pieces: number;
  weight: number;
  weightUnit: "KG" | "LB";
  currency: string;

  rates: RatesResponse | null;
  selectedQuoteId: string | null;
  lastRatesSignature: string | null;

  checkoutData: CheckoutResponse | null;
  lastCheckoutSignature: string | null;
  confirmData: ConfirmResponse | null;

  setShipper: (a: LocalAddress) => void;
  setRecipient: (a: LocalAddress) => void;
  setPieces: (n: number) => void;
  setWeight: (w: number) => void;

  setRates: (r: RatesResponse | null) => void;
  setSelectedQuoteId: (id: string | null) => void;
  setLastRatesSignature: (s: string | null) => void;

  setCheckoutData: (d: CheckoutResponse | null) => void;
  setLastCheckoutSignature: (s: string | null) => void;
  setConfirmData: (d: ConfirmResponse | null) => void;

  ratesSignature: () => string;
  reset: () => void;
}

const initialState = {
  shipper: { ...emptyLocalAddress },
  recipient: { ...emptyLocalAddress },
  pieces: 1,
  weight: 1,
  weightUnit: "KG" as const,
  currency: "SAR",
  rates: null,
  selectedQuoteId: null,
  lastRatesSignature: null,
  checkoutData: null,
  lastCheckoutSignature: null,
  confirmData: null,
};

export const useCreateLocalShipmentStore = create<CreateLocalShipmentState>((set, get) => ({
  ...initialState,

  setShipper: (a) => set({ shipper: a }),
  setRecipient: (a) => set({ recipient: a }),
  setPieces: (n) => set({ pieces: n }),
  setWeight: (w) => set({ weight: w }),

  setRates: (r) => set({ rates: r }),
  setSelectedQuoteId: (id) => set({ selectedQuoteId: id }),
  setLastRatesSignature: (s) => set({ lastRatesSignature: s }),

  setCheckoutData: (d) => set({ checkoutData: d }),
  setLastCheckoutSignature: (s) => set({ lastCheckoutSignature: s }),
  setConfirmData: (d) => set({ confirmData: d }),

  ratesSignature: () => {
    const s = get();
    return JSON.stringify({
      shipper: s.shipper,
      recipient: s.recipient,
      pieces: s.pieces,
      weight: s.weight,
      weightUnit: s.weightUnit,
      currency: s.currency,
    });
  },

  reset: () => set({ ...initialState }),
}));
