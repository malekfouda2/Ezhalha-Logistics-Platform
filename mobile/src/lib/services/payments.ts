import { apiRequest } from "@/api/client";

export interface SavedCard {
    id: string;
    tapCardId: string;
    brand: string | null;
    lastFour: string | null;
    isDefault: boolean;
    status: string;
}

export async function getSavedCards() {
    return apiRequest<SavedCard[]>("/api/client/payments/tap/saved-cards", {
        method: "GET",
    });
}
