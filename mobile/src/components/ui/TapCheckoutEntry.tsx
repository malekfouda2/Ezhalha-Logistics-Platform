import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { startCheckout, type CheckoutCallbacks } from "checkout-react-native";

import { createTapCheckoutSession } from "@/lib/services/payments";
import { getShipment } from "@/lib/services/createShipment";
import { getInvoices } from "@/lib/services/invoices";
import { Colors, setOpacity } from "@/constants/colors";

function extractCheckoutErrorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") {
    try {
      const parsed = JSON.parse(error);
      return extractCheckoutErrorMessage(parsed);
    } catch {
      return error;
    }
  }
  if (typeof error === "object") {
    const candidate = error as Record<string, unknown>;
    const nested =
      candidate.error && typeof candidate.error === "object"
        ? (candidate.error as Record<string, unknown>)
        : undefined;
    const message =
      candidate.message ??
      candidate.description ??
      nested?.description ??
      nested?.message;
    if (typeof message === "string" && message.trim()) return message;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function extractChargeId(successData: string): string | null {
  try {
    const parsed = JSON.parse(successData);
    const id = parsed?.id ?? parsed?.chargeId ?? parsed?.charge_id;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 20;
const OPEN_TIMEOUT_MS = 12000;

async function pollShipmentPaid(shipmentId: string, isCancelled: () => boolean) {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    if (isCancelled()) return { outcome: "cancelled" as const };
    try {
      const shipment = await getShipment(shipmentId);
      if (shipment?.paymentStatus === "paid") {
        return { outcome: "paid" as const, resource: shipment };
      }
      if (shipment?.paymentStatus === "failed") {
        return { outcome: "failed" as const };
      }
    } catch {
      // A single flaky poll shouldn't abort the whole wait — try again next tick.
    }
    if (isCancelled()) return { outcome: "cancelled" as const };
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return { outcome: "timeout" as const };
}

async function pollInvoicePaid(invoiceId: string, isCancelled: () => boolean) {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    if (isCancelled()) return { outcome: "cancelled" as const };
    try {
      const invoices = await getInvoices();
      const invoice = invoices.find((inv) => inv.id === invoiceId);
      if (invoice?.status === "paid") {
        return { outcome: "paid" as const, resource: invoice };
      }
    } catch {
      // Same as above — keep polling rather than failing on one bad response.
    }
    if (isCancelled()) return { outcome: "cancelled" as const };
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return { outcome: "timeout" as const };
}

export type TapCheckoutPayResult =
  | {
      status: "success";
      chargeId: string;
      target: "shipment" | "invoice";
      shipment?: any;
      invoice?: any;
    }
  | { status: "pending"; chargeId: string }
  | { status: "fallback" }
  | { status: "cancelled" };

export type TapCheckoutEntryHandle = {
  pay: (onOpening?: () => void | Promise<void>) => Promise<TapCheckoutPayResult>;
};

interface TapCheckoutEntryProps {
  shipmentId?: string;
  invoiceId?: string;
  saveCard?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const TapCheckoutEntry = forwardRef<
  TapCheckoutEntryHandle,
  TapCheckoutEntryProps
>(function TapCheckoutEntry({ shipmentId, invoiceId, saveCard, style }, ref) {
  const { t, i18n } = useTranslation();
  const [sdkError, setSdkError] = useState<string | null>(null);
  const isArabic = i18n.language?.startsWith("ar") ?? false;
  const language = isArabic ? "ar" : "en";
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const {
    data: session,
    isLoading: isSessionLoading,
    isError: isSessionError,
  } = useQuery({
    queryKey: [
      "/api/client/payments/tap/checkout-session",
      shipmentId,
      invoiceId,
      language,
      saveCard,
    ],
    queryFn: () =>
      createTapCheckoutSession({
        shipmentId,
        invoiceId,
        language,
        saveCardForFuture: saveCard,
      }),
  });

  const isMisconfigured =
    !isSessionLoading && (isSessionError || !session?.configured);

  useImperativeHandle(ref, () => ({
    pay: async (onOpening) => {
      setSdkError(null);
      cancelledRef.current = false;

      if (!session?.configured) {
        return Promise.resolve<TapCheckoutPayResult>({ status: "fallback" });
      }
      const activeSession = session;
      await Promise.resolve(onOpening?.());
      return await new Promise<TapCheckoutPayResult>((resolve) => {
        // console.log("[TapCheckoutEntry] session", JSON.stringify(activeSession, null, 2));
        const target = activeSession.target;
        let settled = false;
        const finish = (outcome_1: TapCheckoutPayResult) => {
          if (settled) return;
          settled = true;
          clearTimeout(openTimeout);
          resolve(outcome_1);
        };
        const openTimeout = setTimeout(() => {
          if (settled) return;
          if (cancelledRef.current) {
            finish({ status: "cancelled" });
            return;
          }
          const detail = t("payments.cardEntry.errorMessage");
          setSdkError(detail);
          Toast.show({
            type: "error",
            text1: t("payments.cardEntry.errorTitle"),
            text2: detail,
          });
          finish({ status: "cancelled" });
        }, OPEN_TIMEOUT_MS);

        const callbacks: CheckoutCallbacks = {
          onSuccess: async (data_1: string) => {
            const chargeId = extractChargeId(data_1);
            if (!chargeId) {
              const detail_1 = extractCheckoutErrorMessage(data_1);
              setSdkError(detail_1);
              Toast.show({
                type: "error",
                text1: t("payments.cardEntry.errorTitle"),
                text2: detail_1,
              });
              finish({ status: "cancelled" });
              return;
            }

            const isCancelled = () => cancelledRef.current;
            const result_1 = target === "invoice" && invoiceId
              ? await pollInvoicePaid(invoiceId, isCancelled)
              : shipmentId
                ? await pollShipmentPaid(shipmentId, isCancelled)
                : { outcome: "timeout" as const };

            if (isCancelled()) return;

            if (result_1.outcome === "paid") {
              finish({
                status: "success",
                chargeId,
                target,
                ...(target === "invoice"
                  ? { invoice: result_1.resource }
                  : { shipment: result_1.resource }),
              });
              return;
            }

            if (result_1.outcome === "failed") {
              const detail_2 = t("payments.cardEntry.errorMessage");
              setSdkError(detail_2);
              Toast.show({
                type: "error",
                text1: t("payments.cardEntry.errorTitle"),
                text2: detail_2,
              });
              finish({ status: "cancelled" });
              return;
            }
            finish({ status: "pending", chargeId });
          },
          onError: (error_2: string) => {
            // console.error("[TapCheckoutEntry] onError", error_2);
            const detail_3 = extractCheckoutErrorMessage(error_2);
            setSdkError(detail_3);
            Toast.show({
              type: "error",
              text1: t("payments.cardEntry.errorTitle"),
              text2: detail_3,
            });
            finish({ status: "cancelled" });
          },
          onClose: () => {
            finish({ status: "cancelled" });
          },
          onReady: () => {
            clearTimeout(openTimeout);
          },
        };
        const configurations = {
          themeMode: "light",
          paymentType: "ALL",
          supportedCurrencies: "ALL",
          supportedPaymentTypes: [] as string[],
          supportedRegions: [] as string[],
          supportedSchemes: [] as string[],
          supportedCountries: [] as string[],
          isApplePayAvailableOnClient: Platform.OS === "ios",
          ...activeSession.configurations,
          amount: activeSession.configurations.order?.amount,
        };
            // console.log("[TapCheckoutEntry] configurations", JSON.stringify(configurations, null, 2));

        try {
          startCheckout(configurations, callbacks);
        } catch (error_3) {
          // console.error("[TapCheckoutEntry] startCheckout threw", error_3);
          const detail_4 = extractCheckoutErrorMessage(error_3);
          setSdkError(detail_4);
          Toast.show({
            type: "error",
            text1: t("payments.cardEntry.errorTitle"),
            text2: detail_4,
          });
          finish({ status: "cancelled" });
        }
      });
    },
  }));

  if (sdkError) {
    return (
      <View style={[styles.sdkErrorBox, style]}>
        <Text style={styles.sdkErrorTitle}>
          {t("payments.cardEntry.errorTitle")}
        </Text>
        <Text style={styles.sdkErrorMessage} selectable>
          {sdkError}
        </Text>
      </View>
    );
  }

  if (isMisconfigured) {
    return (
      <View style={[styles.noticeBox, style]}>
        <Text style={styles.noticeMessage}>
          {t("payments.cardEntry.fallbackMessage")}
        </Text>
      </View>
    );
  }

  return null;
});

const styles = StyleSheet.create({
  sdkErrorBox: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: setOpacity(Colors.error, 0.3),
    backgroundColor: setOpacity(Colors.error, 0.08),
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 4,
  },
  sdkErrorTitle: {
    color: Colors.error,
    fontWeight: "600",
  },
  sdkErrorMessage: {
    color: Colors.error,
  },
  noticeBox: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  noticeMessage: {
    color: Colors.textSecondary,
  },
});
