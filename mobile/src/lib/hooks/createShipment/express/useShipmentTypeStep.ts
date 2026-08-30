import { useRouter } from "expo-router";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";

import { useCreateShipmentStore } from "@/store/createShipmentStore";
import { validateShipmentType } from "@/utils/shipmentValidation";

export function useShipmentTypeStep() {
  const router = useRouter();
  const { t } = useTranslation();

  const shipmentType = useCreateShipmentStore((s) => s.shipmentType);
  const currency = useCreateShipmentStore((s) => s.currency);

  const setShipmentType = useCreateShipmentStore(
    (s) => s.setShipmentType,
  );
  const setCurrency = useCreateShipmentStore(
    (s) => s.setCurrency,
  );
  const reset = useCreateShipmentStore((s) => s.reset);

  const handleContinue = () => {
    const result = validateShipmentType(shipmentType);

    if (!result.ok) {
      Toast.show({
        type: "error",
        text1: result.title
          ? t(result.title)
          : t("toast.error.title"),
        text2: result.description
          ? t(result.description, result.values)
          : undefined,
      });

      return;
    }

    router.push("/createShipment/express/step-2");
  };

  const handleback = () => {
    reset();
    router.back();
  };

  return {
    direction: shipmentType,
    setDirection: (v: "inbound" | "outbound") =>
      setShipmentType(v),
    currency,
    setCurrency,
    handleContinue,
    handleback,
  };
}