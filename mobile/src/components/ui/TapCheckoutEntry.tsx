import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
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
    const nested = candidate.error && typeof candidate.error === "object" ? (candidate.error as Record<string, unknown>) : undefined;
    const message = candidate.message ?? candidate.description ?? nested?.description ?? nested?.message;
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

export type TapCheckoutEntryHandle = {
  /**
   * Launches Tap's hosted checkout UI and resolves once it charges the card, or null if the
   * user cancelled, the config couldn't be fetched, or Tap reported an error (a toast plus an
   * inline error box are already shown in that case).
   */
  pay: () => Promise<{ chargeId: string; transactionReference: string } | null>;
};

interface TapCheckoutEntryProps {
  amount: number;
  currency?: string;
  shipmentId?: string;
  invoiceId?: string;
  saveCard?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const TapCheckoutEntry = forwardRef<TapCheckoutEntryHandle, TapCheckoutEntryProps>(function TapCheckoutEntry(
  { amount, currency, shipmentId, invoiceId, saveCard, style },
  ref,
) {
  const { t, i18n } = useTranslation();
  const [sdkError, setSdkError] = useState<string | null>(null);
  const isArabic = i18n.language?.startsWith("ar") ?? false;

  useImperativeHandle(ref, () => ({
    pay: () =>
      new Promise((resolve) => {
        setSdkError(null);

        getTapCheckoutConfig({ amount, currency: currency || "SAR", shipmentId, invoiceId })
          .then((embedConfig) => {
            if (!embedConfig.publicKey || !embedConfig.hashString || !embedConfig.transactionReference) {
              // Expected until the backend adds amount/currency-aware hashString support to
              // /api/client/payments/tap/config — see the TODOs on TapCheckoutConfig.
              Toast.show({
                type: "error",
                text1: t("payments.cardEntry.unavailableTitle"),
                text2: t("payments.cardEntry.unavailableMessage"),
              });
              resolve(null);
              return;
            }

            const { customer } = embedConfig;
            const formattedAmount = amount.toFixed(2);
            const reference = embedConfig.transactionReference;

            const configurations = {
              hashString: embedConfig.hashString,
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
                publicKey: embedConfig.publicKey,
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
                preLoadCardName: `${customer.firstName} ${customer.lastName}`.trim(),
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
                  resolve(null);
                  return;
                }
                resolve({ chargeId, transactionReference: reference });
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
                resolve(null);
              },
              onClose: () => {
                resolve(null);
              },
              onReady: () => {},
            };

            startCheckout(configurations, callbacks);
          })
          .catch((error) => {
            const detail = error instanceof Error ? error.message : t("payments.cardEntry.errorMessage");
            setSdkError(detail);
            Toast.show({
              type: "error",
              text1: t("payments.cardEntry.errorTitle"),
              text2: detail,
            });
            resolve(null);
          });
      }),
  }));

  if (!sdkError) return null;

  return (
    <View style={[styles.sdkErrorBox, style]}>
      <Text style={styles.sdkErrorTitle}>{t("payments.cardEntry.errorTitle")}</Text>
      <Text style={styles.sdkErrorMessage} selectable>
        {sdkError}
      </Text>
    </View>
  );
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
});
