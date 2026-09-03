import { useRouter } from "expo-router";
import { useState } from "react";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";

import { useCreateLocalShipmentStore } from "@/store/createLocalShipmentStore";
import { submitLocalCheckout } from "@/lib/services/localShipment";

export function useLocalRatesStep() {
  const router = useRouter();
  const { t } = useTranslation();
  const store = useCreateLocalShipmentStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const rates = store.rates;
  const selectedQuoteId = store.selectedQuoteId;
  const selectedQuote = rates?.quotes.find((q) => q.quoteId === selectedQuoteId) ?? null;

  const handleContinue = async () => {
    if (!selectedQuoteId) {
      Toast.show({
        type: "error",
        text1: t("toast.shipmentValidation.shippingRateRequired"),
      });
      return;
    }

    if (isSubmitting) return;

    if (store.checkoutData && store.lastCheckoutSignature === selectedQuoteId) {
      router.push("/createShipment/local/step-5");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await submitLocalCheckout({ quoteId: selectedQuoteId });
      store.setCheckoutData(data);
      store.setLastCheckoutSignature(selectedQuoteId);
      router.push("/createShipment/local/step-5");
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.local.checkout.errorTitle"),
        text2:
          error instanceof Error
            ? error.message
            : t("toast.createShipment.local.checkout.errorMessage"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    rates,
    selectedQuoteId,
    setSelectedQuoteId: store.setSelectedQuoteId,
    selectedQuote,
    isSubmitting,
    handleContinue,
    handleBack: () => router.back(),
  };
}
