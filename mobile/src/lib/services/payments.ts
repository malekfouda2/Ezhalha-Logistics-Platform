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

// NOTE: this calls the *existing* `/api/client/payments/tap/config` endpoint with two extra
// query params (`amount`, `currency`) that the backend does not support yet. Until the backend
// is updated to compute and return `hashString`/`transactionReference`/`postUrl` for those two
// params, this call will succeed but those three fields will come back missing/undefined — see
// the contract note on TapCheckoutConfig below for exactly what the backend needs to add.
export interface TapCheckoutConfig {
    publicKey: string | null;
    merchantId: string | null;
    /**
     * Backend TODO (not implemented yet): HMAC-SHA256 of
     * `x_publickey{publicKey}x_amount{amount.toFixed(2)}x_currency{currency}x_transaction{transactionReference}x_post{postUrl}`,
     * keyed by TAP_SECRET_KEY (hex digest). Must be computed server-side — the secret key can
     * never reach the client. Required by checkout-react-native's `hashString` config field.
     */
    hashString: string | null;
    /** Backend TODO: a fresh reference per checkout attempt (e.g. `shipment_<id>_<timestamp>`). */
    transactionReference: string | null;
    /** Backend TODO: the webhook URL Tap should post the charge result to (`transaction.charge.post`). */
    postUrl: string | null;
    customer: {
        tapCustomerId: string | null;
        firstName: string;
        lastName: string;
        email: string;
        phone: { countryCode: string; number: string } | null;
    };
}

export async function getTapCheckoutConfig(params: {
    amount: number;
    currency: string;
    shipmentId?: string;
    invoiceId?: string;
}) {
    const query = new URLSearchParams();
    query.set("amount", String(params.amount));
    query.set("currency", params.currency);
    if (params.shipmentId) query.set("shipmentId", params.shipmentId);
    if (params.invoiceId) query.set("invoiceId", params.invoiceId);
    return apiRequest<TapCheckoutConfig>(`/api/client/payments/tap/config?${query.toString()}`, {
        method: "GET",
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
