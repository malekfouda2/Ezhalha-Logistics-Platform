import { apiRequest } from "@/api/client";
import {
    Address,
    PackageItem,
    TradeDocument,
    RatesResponse,
    CheckoutResponse,
    ConfirmResponse,
} from "@/store/createExpressShipmentStore";

export interface AddressBookEntry {
    id: string;
    label: string;
    source: "default_shipping" | "shipment_history";
    useForShipper: boolean;
    useForRecipient: boolean;
    lastUsedAt: string | null;
    country:string,
    company:string,
    name: string;
    phone: string;
    email?: string | null;
    countryCode: string;
    city: string;
    postalCode: string;
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
    return apiRequest<RatesResponse>("/api/client/shipments/rates", {
        method: "POST",
        body: payload,
    });
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
    return apiRequest<CheckoutResponse>("/api/client/shipments/checkout", {
        method: "POST",
        body: payload,
    });
}

export interface PayShipmentResponse {
    shipmentId: string;
    trackingNumber: string;
    paymentId?: string;
    transactionUrl?: string;
    amount: number;
    currency: string;
    amountSar: number;
    fxRate: number | string;
    paymentStatus: string;
}

export async function payShipment(payload: {
    shipmentId: string;
    tapTokenId?: string;
    saveCardForFuture?: boolean;
}) {
    return apiRequest<PayShipmentResponse>("/api/client/shipments/pay", {
        method: "POST",
        body: payload,
    });
}

export async function confirmShipment(params: {
    shipmentId: string;
    paymentIntentId?: string;
}): Promise<ConfirmResponse> {
    return apiRequest<ConfirmResponse>("/api/client/shipments/confirm", {
        method: "POST",
        body: params,
    });
}

export interface PayLaterResponse {
    shipment: unknown;
    carrierTrackingNumber?: string;
    labelUrl?: string;
    estimatedDelivery?: string;
}

export async function payLater(shipmentId: string) {
    return apiRequest<PayLaterResponse>(`/api/client/shipments/${shipmentId}/pay-later`, {
        method: "POST",
    });
}

export interface CreditAccessResponse {
    creditEnabled: boolean;
    request: { status: "pending" | "approved" | "rejected" } | null;
    availableCreditSar: number | null;
}

export async function getCreditAccess() {
    return apiRequest<CreditAccessResponse>("/api/client/credit-access", {
        method: "GET",
    });
}

export interface ExtractedInvoiceItem {
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
}

export interface ExtractInvoiceItemsResponse {
    items: ExtractedInvoiceItem[];
    detectedCurrency: string;
    summary?: {
        importedItemCount: number;
        aiAssisted: boolean;
        hasParsingWarnings: boolean;
        autoMatchedHsCodeCount?: number;
        hsCodeReviewCount?: number;
    };
}

export async function extractInvoiceItems(payload: {
    shipmentType: string;
    shipperCountryCode: string;
    recipientCountryCode: string;
    fileName: string;
    objectPath: string;
    contentType: string;
}) {
    return apiRequest<ExtractInvoiceItemsResponse>("/api/client/shipments/extract-invoice-items", {
        method: "POST",
        body: payload,
    });
}

export interface ExtractPackageDetailsResponse {
    packages: Array<{
        packageNumber: string;
        weight: number;
        length: number;
        width: number;
        height: number;
    }>;
    detectedWeightUnit: "LB" | "KG";
    detectedDimensionUnit: "IN" | "CM";
    extractionMethod: "deterministic" | "gemini";
    summary?: {
        importedPackageCount: number;
        totalWeight: number;
        aiAssisted: boolean;
        hasParsingWarnings: boolean;
    };
}

export async function extractPackageDetails(payload: {
    fileName: string;
    objectPath: string;
    contentType: string;
}) {
    return apiRequest<ExtractPackageDetailsResponse>("/api/client/shipments/extract-package-details", {
        method: "POST",
        body: payload,
    });
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
    return apiRequest<{
        candidates: Array<{ code: string; description: string; confidence: number }>;
        source: string;
    }>(`/api/hs-lookup?${search}`, { method: "GET" });
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
        await apiRequest("/api/client/hs-code/confirm", {
            method: "POST",
            body: payload,
        });
    } catch {
        // best-effort, same as web
    }
}
