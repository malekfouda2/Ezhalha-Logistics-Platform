import { forwardRef, useImperativeHandle, useState } from "react";
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

import { getTapCheckoutConfig } from "@/lib/services/payments";
import { Colors, setOpacity } from "@/constants/colors";

// The native SDK's onError payload isn't documented with a fixed shape — try the known fields
// before falling back to the raw string/JSON, so whatever Tap actually sent is visible instead
// of a generic toast.
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

export type TapCheckoutPayResult =
  // Charge succeeded.
  | { status: "success"; chargeId: string; transactionReference: string }
  // The backend hasn't added amount/currency-aware hashString support to /tap/config yet
  // (see the TODOs on TapCheckoutConfig) — the caller should fall back to the existing
  // TapCheckoutWebView hosted-checkout flow instead of failing the payment outright.
  | { status: "fallback" }
  // User closed the sheet, or Tap reported a real error (a toast plus an inline error box
  // are already shown in that case) — the caller should just stop.
  | { status: "cancelled" };

export type TapCheckoutEntryHandle = {
  /** Launches Tap's hosted checkout UI. Resolves once it settles — see TapCheckoutPayResult. */
  pay: () => Promise<TapCheckoutPayResult>;
};

interface TapCheckoutEntryProps {
  amount: number;
  currency?: string;
  shipmentId?: string;
  invoiceId?: string;
  saveCard?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const TapCheckoutEntry = forwardRef<
  TapCheckoutEntryHandle,
  TapCheckoutEntryProps
>(function TapCheckoutEntry(
  { amount, currency, shipmentId, invoiceId, saveCard, style },
  ref,
) {
  const { t, i18n } = useTranslation();
  const [sdkError, setSdkError] = useState<string | null>(null);
  const isArabic = i18n.language?.startsWith("ar") ?? false;

  // Fetched as soon as this component is mounted (i.e. as soon as "new card" is selected in the
  // parent screen) rather than lazily inside pay(), so the "hosted checkout" notice below shows
  // up front — before the user even taps Pay — instead of only surfacing after the attempt.
  const {
    data: embedConfig,
    isLoading: isEmbedConfigLoading,
    isError: isEmbedConfigError,
  } = useQuery({
    // Same endpoint TapCardEntry used to hit (/api/client/payments/tap/config) — this just adds
    // amount/currency to the query key since getTapCheckoutConfig() passes them as params too.
    queryKey: [
      "/api/client/payments/tap/config",
      amount,
      currency,
      shipmentId,
      invoiceId,
    ],
    queryFn: () =>
      getTapCheckoutConfig({
        amount,
        currency: currency || "SAR",
        shipmentId,
        invoiceId,
      }),
  });

  // Expected until the backend adds amount/currency-aware hashString support to
  // /api/client/payments/tap/config — see the TODOs on TapCheckoutConfig.
  const isMisconfigured =
    !isEmbedConfigLoading &&
    (isEmbedConfigError ||
      !embedConfig?.publicKey ||
      !embedConfig?.hashString ||
      !embedConfig?.transactionReference);

  useImperativeHandle(ref, () => ({
    pay: () =>
      new Promise((resolve) => {
        setSdkError(null);

        // Re-check the three required fields directly (rather than relying on the
        // `isMisconfigured` boolean) so TS actually narrows them to non-null strings below —
        // a boolean flag computed elsewhere doesn't narrow embedConfig's fields on its own.
        const publicKey = embedConfig?.publicKey;
        const hashString = embedConfig?.hashString;
        const reference = embedConfig?.transactionReference;
        if (!embedConfig || !publicKey || !hashString || !reference) {
          // Fall back to the hosted WebView checkout instead of dead-ending the payment — the
          // notice explaining this is already shown below, so no toast needed here.
          resolve({ status: "fallback" });
          return;
        }

        const { customer } = embedConfig;
        const formattedAmount = amount.toFixed(2);

        const configurations = {
          hashString,
          language: isArabic ? "ar" : "en",
          themeMode: "light",
          supportedPaymentMethods: "ALL",
          paymentType: "ALL",
          selectedCurrency: currency || "SAR",
          supportedCurrencies: "ALL",
          supportedPaymentTypes: [],
          supportedRegions: [],
          supportedSchemes: [],
          supportedCountries: [],
          gateway: {
            publicKey,
            merchantId: embedConfig.merchantId ?? "",
          },
          customer: {
            firstName: customer.firstName,
            lastName: customer.lastName,
            email: customer.email,
            phone: customer.phone ?? { countryCode: "", number: "" },
          },
          transaction: {
            mode: "charge",
            charge: {
              metadata: {},
              reference: {
                transaction: reference,
                order: reference,
                idempotent: reference,
              },
              saveCard: Boolean(saveCard),
              post: embedConfig.postUrl ?? "",
              threeDSecure: true,
            },
          },
          amount: formattedAmount,
          order: {
            id: "",
            currency: currency || "SAR",
            amount: formattedAmount,
            items: [
              {
                amount: formattedAmount,
                currency: currency || "SAR",
                name: "Ezhalha",
                quantity: 1,
                description: "",
              },
            ],
          },
          cardOptions: {
            showBrands: true,
            showLoadingState: true,
            collectHolderName: true,
            preLoadCardName:
              `${customer.firstName} ${customer.lastName}`.trim(),
            cardNameEditable: true,
            cardFundingSource: "all",
            saveCardOption: "all",
            forceLtr: false,
            alternativeCardInputs: { cardScanner: true, cardNFC: true },
          },
          isApplePayAvailableOnClient: Platform.OS === "ios",
        };

        const callbacks: CheckoutCallbacks = {
          onSuccess: (data: string) => {
            const chargeId = extractChargeId(data);
            if (!chargeId) {
              const detail = extractCheckoutErrorMessage(data);
              setSdkError(detail);
              Toast.show({
                type: "error",
                text1: t("payments.cardEntry.errorTitle"),
                text2: detail,
              });
              resolve({ status: "cancelled" });
              return;
            }
            resolve({
              status: "success",
              chargeId,
              transactionReference: reference,
            });
          },
          onError: (error: string) => {
            console.error("[TapCheckoutEntry] onError", error);
            const detail = extractCheckoutErrorMessage(error);
            setSdkError(detail);
            Toast.show({
              type: "error",
              text1: t("payments.cardEntry.errorTitle"),
              text2: detail,
            });
            resolve({ status: "cancelled" });
          },
          onClose: () => {
            resolve({ status: "cancelled" });
          },
          onReady: () => {},
        };

        startCheckout(configurations, callbacks);
      }),
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
