import { useRouter } from "expo-router";
import { Alert } from "react-native";
import { useCreateShipmentStore } from "@/store/createShipmentStore";
import { validateAddress } from "@/utils/shipmentValidation";

export function useRecipientStep() {
  const router = useRouter();
  const recipient = useCreateShipmentStore((s) => s.recipient);
  const shipmentType = useCreateShipmentStore((s) => s.shipmentType);
  const updateRecipient = useCreateShipmentStore((s) => s.updateRecipient);
  const setRecipient = useCreateShipmentStore((s) => s.setRecipient);

  const handleContinue = () => {
    const result = validateAddress(recipient, shipmentType, "recipient");
    if (!result.ok) {
      Alert.alert(result.title || "Error", result.description);
      return;
    }
    router.push("/createShipment/express/step-4");
  };

  const handleBack = () => router.back();

  const applySavedAddress = (entry: {
    name: string; phone: string; email?: string | null; countryCode: string;
    city: string; postalCode?: string | null; addressLine1: string;
    addressLine2?: string | null; stateOrProvince?: string | null; shortAddress?: string | null;
  }) => {
    setRecipient({
      name: entry.name,
      phone: entry.phone,
      email: entry.email || "",
      countryCode: shipmentType === "domestic" ? "SA" : entry.countryCode,
      city: entry.city,
      postalCode: entry.postalCode || "",
      addressLine1: entry.addressLine1,
      addressLine2: entry.addressLine2 || "",
      stateOrProvince: entry.stateOrProvince || "",
      shortAddress: entry.shortAddress || "",
    });
  };

  return { recipient, shipmentType, updateRecipient, applySavedAddress, handleContinue, handleBack };
}