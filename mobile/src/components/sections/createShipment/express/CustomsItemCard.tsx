import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";

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
  currency: string;
  totalPrice: string;
  quantity: number;
  unitPrice: string;
  hsCode: string;
  confidence: HSConfidence;
  onPressHSCode?: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
  removable?: boolean;
}

export const CustomsItemCard = ({
  name,
  category,
  material,
  countryFlag,
  countryName,
  currency,
  totalPrice,
  quantity,
  unitPrice,
  hsCode,
  confidence,
  onPressHSCode,
  onEdit,
  onRemove,
  removable = false,
}: CustomsItemCardProps) => {
  const { t } = useTranslation();

  const isHighConfidence = confidence === "high";
  const isSar = currency === "SAR";

  const metaText = [
    category,
    material,
    countryName ? `${countryFlag} ${countryName}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text size="small" weight="bold" style={styles.name}>
            {name}
          </Text>

          <Text size="xs" style={styles.meta}>
            {metaText}
          </Text>
        </View>

        <View style={styles.priceContainer}>
          <View style={styles.priceRow}>
            {isSar ? (
              <SaudiRiyal size={rs(20)} />
            ) : (
              <Text size="medium" weight="bold" style={styles.currencyCode}>
                {currency}
              </Text>
            )}

            <Text size="medium" weight="bold" style={styles.totalPrice}>
              {totalPrice}
            </Text>
          </View>

          <View style={styles.unitPriceContainer}>
            <Text size="xs" style={styles.unitPrice}>
              {quantity} x
            </Text>

            {isSar ? (
              <SaudiRiyal size={rs(12)} color={Colors.secondary} />
            ) : (
              <Text size="xs" style={styles.unitPrice}>
                {currency}
              </Text>
            )}

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

      {onEdit || removable ? (
        <View style={styles.actionsRow}>
          {onEdit ? (
            <Pressable onPress={onEdit} hitSlop={10} style={styles.actionButton}>
              <Feather name="edit-2" size={rs(15)} color={Colors.secondary} />
            </Pressable>
          ) : null}

          {removable ? (
            <Pressable onPress={onRemove} hitSlop={10} style={styles.actionButton}>
              <Feather name="trash-2" size={rs(15)} color={Colors.error} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
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
    justifyContent: "space-between",
  },

  info: {
    flex: 1,
    marginEnd: rs(10),
  },

  name: {
    color: Colors.text,
    marginBottom: rvs(2),
  },

  meta: {
    color: Colors.textSecondary,
    paddingStart: rvs(4),
  },

  priceContainer: {
    alignItems: "flex-end",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(2),
  },
  totalPrice: {
    paddingStart: rvs(2),
    color: Colors.text,
  },

  currencyCode: {
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
    marginTop: rvs(10),
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

  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: rs(14),
    marginTop: rvs(10),
    paddingTop: rvs(10),
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },

  actionButton: {
    padding: rs(2),
  },
});
