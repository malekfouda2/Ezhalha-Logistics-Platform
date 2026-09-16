import { apiRequest } from "@/api/client";

export interface SavedCard {
    id: string;
    tapCardId: string;
    brand: string | null;
    lastFour: string | null;
    expMonth?: number | null;
    expYear?: number | null;
    isDefault: boolean;
    status: string;
}

export async function getSavedCards() {
    return apiRequest<SavedCard[]>("/api/client/payments/tap/saved-cards", {
        method: "GET",
    });
}

export interface TapCheckoutSession {
    configured: boolean;
    configurations: Record<string, any>;
    target: "shipment" | "invoice";
    shipmentId?: string;
    invoiceId?: string;
    amount: number;
    currency: string;
}

export async function createTapCheckoutSession(params: {
    shipmentId?: string;
    invoiceId?: string;
    language?: "en" | "ar";
    saveCardForFuture?: boolean;
}) {
    return apiRequest<TapCheckoutSession>("/api/client/payments/tap/checkout-session", {
        method: "POST",
        body: params,
    });
}

export async function setDefaultSavedCard(id: string) {
    return apiRequest<SavedCard>(`/api/client/payments/tap/saved-cards/${id}/default`, {
        method: "POST",
    });
}

export async function deleteSavedCard(id: string) {
    return apiRequest<{ success: boolean }>(`/api/client/payments/tap/saved-cards/${id}`, {
        method: "DELETE",
    });
}
