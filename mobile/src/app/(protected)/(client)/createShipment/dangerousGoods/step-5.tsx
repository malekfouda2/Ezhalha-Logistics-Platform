// app/create-shipment/dangerousGoods/step-5.tsx

import { StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { ContentKindCard } from "@/components/sections/createShipment/dangerousGoods/ContentKindCard";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { useContentKindStep } from "@/lib/hooks/createShipment/dangerousGoods/useContentKindStep";
import { DANGEROUS_GOODS_CONTENT_KINDS } from "@/constants/dangerousGoodsContentKinds";
import { rvs } from "@/utils/responsive";

export default function DangerousGoodsContentKindScreen() {
  const { t } = useTranslation();
  const { contentKind, handleSelect, handleContinue, handleBack } = useContentKindStep();

  return (
    <ShipmentStepLayout
      step={5}
      totalSteps={8}
      title={t("createShipment.dangerousGoods.steps.step5.title")}
      subtitle={t("createShipment.dangerousGoods.steps.step5.subtitle")}
      onContinue={handleContinue}
      onBack={handleBack}
    >
      {DANGEROUS_GOODS_CONTENT_KINDS.map((kind) => (
        <ContentKindCard
          key={kind.value}
          icon={kind.icon}
          title={t(`createShipment.dangerousGoods.steps.step5.contentKinds.${kind.value}.label`)}
          description={t(`createShipment.dangerousGoods.steps.step5.contentKinds.${kind.value}.description`)}
          selected={contentKind === kind.value}
          onPress={() => handleSelect(kind.value)}
        />
      ))}

      <Text size="xs" dimRate="55%" style={styles.footnote}>
        {t("createShipment.dangerousGoods.steps.step5.footnote")}
      </Text>
    </ShipmentStepLayout>
  );
}

const styles = StyleSheet.create({
  footnote: {
    marginTop: rvs(4),
    marginBottom: rvs(10),
    textAlign: "center",
  },
});
