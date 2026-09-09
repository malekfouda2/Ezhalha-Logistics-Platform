import { useRouter } from "expo-router";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";

import { useDangerousGoodsStore, DgShipmentDirection } from "@/store/createDangerousGoodsStore";

export function useShipmentTypeStep() {
  const router = useRouter();
  const { t } = useTranslation();

  const shipmentType = useDangerousGoodsStore((s) => s.shipmentType);
  const setShipmentType = useDangerousGoodsStore((s) => s.setShipmentType);
  const reset = useDangerousGoodsStore((s) => s.reset);

  const handleContinue = () => {
    if (!shipmentType) {
      Toast.show({
        type: "error",
        text1: t("toast.shipmentValidation.shipmentTypeRequired"),
      });
      return;
    }
    router.push("/createShipment/dangerousGoods/step-2");
  };

  const handleBack = () => {
    reset();
    router.back();
  };

  return {
    shipmentType,
    setShipmentType: (v: DgShipmentDirection) => setShipmentType(v),
    handleContinue,
    handleBack,
  };
}
