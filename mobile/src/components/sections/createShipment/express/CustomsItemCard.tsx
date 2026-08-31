import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { SaudiRiyal } from "lucide-react-native";

export type HSConfidence = "high" | "review";

interface CustomsItemCardProps {
  name: string;
  category: string;
  material: string;
  countryFlag: string;
  countryName: string;
  totalPrice: string;
  quantity: number;
  unitPrice: string;
  hsCode: string;
  confidence: HSConfidence;
  onPressHSCode?: () => void;
  onRemove?: () => void;
  removable?: boolean;
}

export const CustomsItemCard = ({
  name,
  category,
  material,
  countryFlag,
  countryName,
  totalPrice,
  quantity,
  unitPrice,
  hsCode,
  confidence,
  onPressHSCode,
  onRemove,
  removable = false,
}: CustomsItemCardProps) => {
  const { t } = useTranslation();

  const isHighConfidence = confidence === "high";

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text size="small" weight="bold" style={styles.name}>
              {name}
            </Text>

            {removable ? (
              <Pressable onPress={onRemove} hitSlop={10}>
                <Text size="xs" weight="semibold" style={styles.remove}>
                  {t("createShipment.express.steps.step4.remove")}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Text size="xs" style={styles.meta}>
            {category} · {material} · {countryFlag} {countryName}
          </Text>
        </View>

        <View style={styles.priceContainer}>
          <View style={styles.priceRow}>
            <SaudiRiyal size={rs(20)} />

            <Text size="medium" weight="bold" style={styles.totalPrice}>
              {totalPrice}
            </Text>
          </View>

          <View style={styles.unitPriceContainer}>
            <Text size="xs" style={styles.unitPrice}>
              {quantity} x
            </Text>

            <SaudiRiyal size={rs(12)} color={Colors.secondary} />

            <Text size="xs" style={styles.unitPrice}>
              {unitPrice}
            </Text>
          </View>
        </View>
      </View>

      <Pressable
        onPress={onPressHSCode}
        style={[
          styles.hsPill,
          isHighConfidence ? styles.hsPillHigh : styles.hsPillReview,
        ]}
      >
        <View
          style={[
            styles.dot,
            {
              backgroundColor: isHighConfidence ? "#2FB463" : "#F2A93B",
            },
          ]}
        />

        <Text size="xs" weight="bold" style={styles.hsText}>
          {t("createShipment.express.customs.hsCode", {
            code: hsCode,
          })}{" "}
          ·{" "}
          {isHighConfidence
            ? t("createShipment.express.customs.highConfidence")
            : t("createShipment.express.customs.confirmThis")}
        </Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: Colors.white,
    borderRadius: rs(22),
    padding: rs(18),
    marginBottom: rvs(16),
  },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  info: {
    flex: 1,
  },

  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  name: {
    color: Colors.text,
    marginBottom: rvs(2),
  },

  remove: {
    color: "#687994",
  },

  meta: {
    color: Colors.textSecondary,
    paddingStart: rvs(4)
  },

  priceContainer: {
    alignItems: "flex-end",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  totalPrice: {
    paddingStart: rvs(2),
    color: Colors.text,
  },

  unitPriceContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(4),
    color: Colors.secondary,
  },
    unitPrice: {
    color: Colors.secondary,
  },

  hsPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",

    borderRadius: rs(15),
    paddingHorizontal: rs(12),
    paddingVertical: rvs(4),
    marginTop: rvs(4),
    gap: rs(8),
  },

  hsPillHigh: {
    backgroundColor: "#F1FAF4",
  },

  hsPillReview: {
    backgroundColor: "#FFF7EA",
  },

  dot: {
    width: rs(7),
    height: rs(7),
    borderRadius: rs(4),
  },

  hsText: {
    color: Colors.text,
  },
});
