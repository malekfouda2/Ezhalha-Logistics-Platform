import { apiRequest } from "@/api/client";
import type { CreditInvoice } from "@shared/schema";

export type CreditInvoiceWithShipment = CreditInvoice & {
    shipment: {
        id: string;
        trackingNumber: string;
        status: string;
        createdAt: string;
        senderName?: string | null;
        senderCity: string;
        senderCountry: string;
        recipientName?: string | null;
        recipientCity: string;
        recipientCountry: string;
        serviceType?: string | null;
        carrierName?: string | null;
        carrierTrackingNumber?: string | null;
        shipmentType?: string | null;
        weight?: string | number | null;
        weightUnit?: string | null;
        numberOfPackages?: number | null;
        itemsData?: string | null;
    } | null;
};

export interface CreditInvoiceLineItem {
    itemName?: string;
    itemDescription?: string;
    category?: string;
    countryOfOrigin?: string;
    hsCode?: string;
    price?: number;
    quantity?: number;
    currency?: string;
}

export function parseCreditInvoiceItems(itemsData?: string | null): CreditInvoiceLineItem[] {
    if (!itemsData) return [];
    try {
        const parsed = JSON.parse(itemsData);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export interface ExtraFeeNotice {
    shipmentId: string;
    trackingNumber: string;
    carrierTrackingNumber: string | null;
    extraFeesType: "EXTRA_WEIGHT" | "EXTRA_COST" | null;
    extraFeesAmountSar: number;
    extraFeesAddedAt: string;
}

export interface CreditAccessStatus {
    creditEnabled: boolean;
    request: { status: "pending" | "approved" | "rejected" } | null;
}

export async function requestCreditAccess(reason: string) {
    return apiRequest<{ success: boolean }>("/api/client/credit-access/request", {
        method: "POST",
        body: { reason },
    });
}

export interface CreateInvoiceChargeResponse {
    paymentId?: string;
    transactionUrl?: string;
    amount: number;
    invoiceNumber: string;
    paymentStatus: string;
}

export async function payInvoice(payload: {
    invoiceId: string;
    tapTokenId?: string;
    saveCardForFuture?: boolean;
}) {
    return apiRequest<CreateInvoiceChargeResponse>("/api/client/payments/create-charge", {
        method: "POST",
        body: payload,
    });
}
