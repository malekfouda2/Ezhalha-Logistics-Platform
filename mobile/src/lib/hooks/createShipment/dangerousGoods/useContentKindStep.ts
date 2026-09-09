import { useRouter } from "expo-router";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";

import { useDangerousGoodsStore } from "@/store/createDangerousGoodsStore";
import { DgContentKindValue } from "@shared/dangerous-goods";

export function useContentKindStep() {
  const router = useRouter();
  const { t } = useTranslation();

  const contentKind = useDangerousGoodsStore((s) => s.contentKind);
  const setContentKind = useDangerousGoodsStore((s) => s.setContentKind);

  const handleSelect = (value: DgContentKindValue) => {
    setContentKind(value);
  };

  const handleContinue = () => {
    if (!contentKind) {
      Toast.show({
        type: "error",
        text1: t("createShipment.dangerousGoods.steps.step5.selectRequired"),
      });
      return;
    }
    router.push("/createShipment/dangerousGoods/step-6");
  };

  const handleBack = () => router.back();

  return {
    contentKind,
    handleSelect,
    handleContinue,
    handleBack,
  };
}
