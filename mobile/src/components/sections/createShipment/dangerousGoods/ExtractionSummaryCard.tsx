import React from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { DgDraftCommodity } from "@/store/createDangerousGoodsStore";

interface ExtractionSummaryCardProps {
  commodities: DgDraftCommodity[];
}

function hasContent(commodity: DgDraftCommodity): boolean {
  return !!(commodity.unNumber || commodity.hazardClass || commodity.packingInstruction);
}

export const ExtractionSummaryCard = ({ commodities }: ExtractionSummaryCardProps) => {
  const { t } = useTranslation();

  // A package always carries at least one commodity slot (the server requires a non-empty
  // array), but that placeholder is blank until an SDS is actually read — don't render an
  // empty box for it.
  const readCommodities = commodities.filter(hasContent);
  if (readCommodities.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text size="xs" weight="bold" style={styles.label}>
        {t("createShipment.dangerousGoods.steps.step6.extractionCardTitle")}
      </Text>

      {readCommodities.map((commodity, index) => (
        <View key={index} style={styles.rowGroup}>
          {commodity.unNumber ? (
            <View style={styles.row}>
              <Text size="small" style={styles.rowLabel}>
                {t("createShipment.dangerousGoods.steps.step6.unNumber")}
              </Text>
              <Text size="small" weight="semibold" style={styles.rowValue}>
                {commodity.unNumber}
              </Text>
            </View>
          ) : null}

          {commodity.hazardClass ? (
            <View style={styles.row}>
              <Text size="small" style={styles.rowLabel}>
                {t("createShipment.dangerousGoods.steps.step6.classAndGroup")}
              </Text>
              <Text size="small" weight="semibold" style={styles.rowValue}>
                {commodity.hazardClass}
                {commodity.packingGroup && commodity.packingGroup !== "NONE" ? ` · PG ${commodity.packingGroup}` : ""}
              </Text>
            </View>
          ) : null}

          {commodity.packingInstruction ? (
            <View style={styles.row}>
              <Text size="small" style={styles.rowLabel}>
                {t("createShipment.dangerousGoods.steps.step6.packingInstruction")}
              </Text>
              <Text size="small" weight="semibold" style={styles.rowValue}>
                {commodity.packingInstruction}
              </Text>
            </View>
          ) : null}
        </View>
      ))}
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
  rowGroup: {
    marginBottom: rvs(6),
    paddingBottom: rvs(6),
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: rvs(2),
  },
  rowLabel: {
    color: Colors.textSecondary,
  },
  rowValue: {
    color: Colors.text,
  },
});
