import { useRouter } from "expo-router";
import { Alert } from "react-native";
import { useCreateShipmentStore, isInternationalShipment } from "@/store/createShipmentStore";
import { validateRateSelection } from "@/utils/shipmentValidation";


export function useRatesStep() {
  const router = useRouter();
  const rates = useCreateShipmentStore((s) => s.rates);
  const selectedQuoteId = useCreateShipmentStore((s) => s.selectedQuoteId);
  const setSelectedQuoteId = useCreateShipmentStore((s) => s.setSelectedQuoteId);
  const shipmentType = useCreateShipmentStore((s) => s.shipmentType);

  const selectedQuote = rates?.quotes.find((q) => q.quoteId === selectedQuoteId) ?? null;
  const isInternational = isInternationalShipment(shipmentType);

  const handleContinue = () => {
    const result = validateRateSelection(selectedQuoteId);
    if (!result.ok) {
      Alert.alert(result.title || "Error");
      return;
    }
    router.push(
      isInternational
        ? "/createShipment/express/customs"
        : "/createShipment/express/pickup",
    );
  };

  const handleBack = () => router.push("/createShipment/express/step-4");

  return { rates, selectedQuoteId, setSelectedQuoteId, selectedQuote, isInternational, handleContinue, handleBack };
}