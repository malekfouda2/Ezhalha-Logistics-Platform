import React from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { DgDraftCommodity } from "@/store/createDangerousGoodsStore";
import { DgContentKindValue } from "@shared/dangerous-goods";

interface DeclarationSummaryCardProps {
  contentKind: DgContentKindValue | "";
  commodities: DgDraftCommodity[];
  documentCount: number;
}

export const DeclarationSummaryCard = ({
  contentKind,
  commodities,
  documentCount,
}: DeclarationSummaryCardProps) => {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <Text size="xs" weight="bold" style={styles.label}>
        {t("createShipment.dangerousGoods.steps.step8.declarationLabel")}
      </Text>

      <View style={styles.row}>
        <Text size="small" style={styles.rowLabel}>
          {t("createShipment.dangerousGoods.steps.step8.contents")}
        </Text>
        <Text size="small" weight="semibold" style={styles.rowValue}>
          {contentKind
            ? t(`createShipment.dangerousGoods.steps.step5.contentKinds.${contentKind}.label`)
            : "—"}
        </Text>
      </View>

      {commodities.map((commodity, index) => (
        <View key={index} style={styles.row}>
          <Text size="small" style={styles.rowLabel}>
            {commodity.unNumber || t("createShipment.dangerousGoods.steps.step8.notClassified")}
          </Text>
          <Text size="small" weight="semibold" style={styles.rowValue}>
            {commodity.hazardClass
              ? `${t("createShipment.dangerousGoods.steps.step6.classAndGroup")} ${commodity.hazardClass}${
                  commodity.packingGroup && commodity.packingGroup !== "NONE" ? ` · PG ${commodity.packingGroup}` : ""
                }`
              : "—"}
          </Text>
        </View>
      ))}

      <View style={styles.row}>
        <Text size="small" style={styles.rowLabel}>
          {t("createShipment.dangerousGoods.steps.step8.sheets")}
        </Text>
        <Text size="small" weight="semibold" style={styles.rowValue}>
          {t("createShipment.dangerousGoods.steps.step8.sheetsAttached", { count: documentCount })}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: rs(18),
    padding: rs(14),
    marginBottom: rvs(10),
  },
  label: {
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: rvs(8),
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: rvs(3),
  },
  rowLabel: {
    color: Colors.textSecondary,
    flex: 1,
    marginEnd: rs(10),
  },
  rowValue: {
    color: Colors.text,
    textAlign: "right",
  },
});
