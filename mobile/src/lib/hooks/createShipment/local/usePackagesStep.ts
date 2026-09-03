import { useRouter } from "expo-router";
import { useState } from "react";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";

import { useCreateLocalShipmentStore } from "@/store/createLocalShipmentStore";
import { fetchLocalRates } from "@/lib/services/localShipment";

export function useLocalPackagesStep() {
  const router = useRouter();
  const { t } = useTranslation();
  const store = useCreateLocalShipmentStore();
  const [isLoadingRates, setIsLoadingRates] = useState(false);

  const handleContinue = async () => {
    if (!store.pieces || store.pieces < 1 || !store.weight || store.weight <= 0) {
      Toast.show({
        type: "error",
        text1: t("toast.shipmentValidation.packageDetailsRequired"),
      });
      return;
    }

    if (isLoadingRates) return;

    const signature = store.ratesSignature();
    if (store.rates && signature === store.lastRatesSignature) {
      router.push("/createShipment/local/step-4");
      return;
    }

    setIsLoadingRates(true);
    try {
      const data = await fetchLocalRates({
        shipper: store.shipper,
        recipient: store.recipient,
        pieces: store.pieces,
        weight: store.weight,
        weightUnit: store.weightUnit,
        currency: store.currency,
      });
      store.setSelectedQuoteId(null);
      store.setRates(data);
      store.setCheckoutData(null);
      store.setConfirmData(null);
      store.setLastRatesSignature(signature);
      router.push("/createShipment/local/step-4");
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.local.rates.errorTitle"),
        text2:
          error instanceof Error
            ? error.message
            : t("toast.createShipment.local.rates.errorMessage"),
      });
    } finally {
      setIsLoadingRates(false);
    }
  };

  return {
    pieces: store.pieces,
    weight: store.weight,
    setPieces: store.setPieces,
    setWeight: store.setWeight,
    isLoadingRates,
    handleContinue,
    handleBack: () => router.back(),
  };
}
