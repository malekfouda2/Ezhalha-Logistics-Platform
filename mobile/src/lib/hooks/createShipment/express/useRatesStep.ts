import { useRouter } from "expo-router";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";
import { useCreateShipmentStore, isInternationalShipment } from "@/store/createExpressShipmentStore";
import { validateRateSelection } from "@/utils/shipmentValidation";


export function useRatesStep() {
  const router = useRouter();
  const { t } = useTranslation();
  const rates = useCreateShipmentStore((s) => s.rates);
  const selectedQuoteId = useCreateShipmentStore((s) => s.selectedQuoteId);
  const setSelectedQuoteId = useCreateShipmentStore((s) => s.setSelectedQuoteId);
  const shipmentType = useCreateShipmentStore((s) => s.shipmentType);

  const selectedQuote = rates?.quotes.find((q) => q.quoteId === selectedQuoteId) ?? null;
  const isInternational = isInternationalShipment(shipmentType);

  const handleContinue = () => {
    const result = validateRateSelection(selectedQuoteId);
    if (!result.ok) {
      Toast.show({
        type: "error",
        text1: result.title ? t(result.title, result.values) : t("toast.error.title"),
      });
      return;
    }
    router.push(
      isInternational
        ? "/createShipment/express/step-6"
        : "/createShipment/express/step-7",
    );
  };

  const handleBack = () => router.push("/createShipment/express/step-4");

  return { rates, selectedQuoteId, setSelectedQuoteId, selectedQuote, isInternational, handleContinue, handleBack };
}