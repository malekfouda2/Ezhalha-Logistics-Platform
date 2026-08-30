import { apiRequest } from "@/lib/queryClient"; // adjust to your RN api client
import {
    Address,
    PackageItem,
    TradeDocument,
    RatesResponse,
    CheckoutResponse,
    ConfirmResponse,
} from "@/store/createShipmentStore";

export interface AddressBookEntry {
    id: string;
    label: string;
    source: "default_shipping" | "shipment_history";
    useForShipper: boolean;
    useForRecipient: boolean;
    lastUsedAt: string | null;

    name: string;
    phone: string;
    email?: string | null;
    countryCode: string;
    city: string;
    postalCode?: string | null;
    addressLine1: string;
    addressLine2?: string | null;
    stateOrProvince?: string | null;
    shortAddress?: string | null;
}

export async function fetchRates(payload: {
    shipmentType: string;
    isDdp: boolean;
    shipper: Address;
    recipient: Address;
    packages: PackageItem[];
    weightUnit: "LB" | "KG";
    dimensionUnit: "IN" | "CM";
    packageType: string;
    currency: string;
}): Promise<RatesResponse> {
    const res = await apiRequest("POST", "/api/client/shipments/rates", payload);
    return res.json();
}

export interface CheckoutPayload {
    quoteId: string;
    items?: Array<{
        itemName: string;
        itemDescription?: string;
        category: string;
        material?: string;
        countryOfOrigin: string;
        hsCode?: string;
        hsCodeSource?: string;
        hsCodeConfidence?: string;
        hsCodeCandidates?: Array<{ code: string; description: string; confidence: number }>;
        price: number;
        currency?: string;
        quantity: number;
    }>;
    tradeDocuments?: TradeDocument[];
    pickup?: {
        requested: boolean;
        date?: string;
        readyTime?: string;
        closeTime?: string;
        location?: string;
        instructions?: string;
    };
}

export async function submitCheckout(payload: CheckoutPayload): Promise<CheckoutResponse> {
    const res = await apiRequest("POST", "/api/client/shipments/checkout", payload);
    return res.json();
}

export async function payShipment(payload: {
    shipmentId: string;
    tapTokenId?: string;
    saveCardForFuture?: boolean;
}) {
    const res = await apiRequest("POST", "/api/client/shipments/pay", {
        ...payload,
        returnPath: "/createShipment/express",
    });
    return res.json();
}

export async function confirmShipment(params: {
    shipmentId: string;
    paymentIntentId?: string;
}): Promise<ConfirmResponse> {
    const res = await apiRequest("POST", "/api/client/shipments/confirm", params);
    return res.json();
}

export async function payLater(shipmentId: string) {
    const res = await apiRequest("POST", `/api/client/shipments/${shipmentId}/pay-later`);
    return res.json();
}

export async function extractInvoiceItems(payload: {
    shipmentType: string;
    shipperCountryCode: string;
    recipientCountryCode: string;
    fileName: string;
    objectPath: string;
    contentType: string;
}) {
    const res = await apiRequest("POST", "/api/client/shipments/extract-invoice-items", payload);
    return res.json();
}

export async function extractPackageDetails(payload: {
    fileName: string;
    objectPath: string;
    contentType: string;
}) {
    const res = await apiRequest("POST", "/api/client/shipments/extract-package-details", payload);
    return res.json();
}

export async function lookupHsCode(params: {
    itemName: string;
    category: string;
    countryOfOrigin: string;
    destinationCountry: string;
    itemDescription?: string;
    material?: string;
}) {
    const search = new URLSearchParams(params as Record<string, string>);
    const res = await fetch(`/api/hs-lookup?${search}`, { credentials: "include" });
    if (!res.ok) throw new Error("Lookup failed");
    return res.json() as Promise<{
        candidates: Array<{ code: string; description: string; confidence: number }>;
        source: string;
    }>;
}

export async function confirmHsCode(payload: {
    itemName: string;
    category: string;
    material?: string;
    countryOfOrigin: string;
    hsCode: string;
    description?: string;
}) {
    try {
        await apiRequest("POST", "/api/client/hs-code/confirm", payload);
    } catch {
        // best-effort, same as web
    }
}



