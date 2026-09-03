import React from "react";
import { StyleSheet, View, Pressable, TextInput } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { Typography } from "@/constants/typography";
import { rs, rvs } from "@/utils/responsive";

interface PackageCardProps {
  index: number;
  weight: string;
  length: string;
  width: string;
  height: string;
  weightUnit: string;
  dimensionUnit: string;
  onChangeWeight: (v: string) => void;
  onChangeLength: (v: string) => void;
  onChangeWidth: (v: string) => void;
  onChangeHeight: (v: string) => void;
  onRemove?: () => void;
  removable?: boolean;
  /** Overrides the "Package" label (e.g. "Pallet" for the door-to-door flow). */
  label?: string;
}

export const PackageCard = ({
  index,
  weight,
  length,
  width,
  height,
  weightUnit,
  dimensionUnit,
  onChangeWeight,
  onChangeLength,
  onChangeWidth,
  onChangeHeight,
  onRemove,
  removable = true,
  label,
}: PackageCardProps) => {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text size="small" weight="bold" style={styles.title}>
          {label ?? t("createShipment.express.steps.step4.package")} {index}
        </Text>

        {removable ? (
          <Pressable onPress={onRemove} hitSlop={10}>
            <Text size="small" weight="semibold" style={styles.remove}>
              {t("createShipment.express.steps.step4.remove")}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.grid}>
        <View style={styles.gridItem}>
          <Text size="xs" weight="bold" style={styles.label}>
            {t("createShipment.express.steps.step4.weight", { unit: weightUnit })}
          </Text>

          <TextInput
            value={weight}
            onChangeText={onChangeWeight}
            keyboardType="decimal-pad"
            placeholderTextColor={Colors.placeholder}
            style={styles.gridInput}
          />
        </View>

        <View style={styles.gridItem}>
          <Text size="xs" weight="bold" style={styles.label}>
            {t("createShipment.express.steps.step4.length", { unit: dimensionUnit })}
          </Text>

          <TextInput
            value={length}
            onChangeText={onChangeLength}
            keyboardType="number-pad"
            placeholderTextColor={Colors.placeholder}
            style={styles.gridInput}
          />
        </View>

        <View style={styles.gridItem}>
          <Text size="xs" weight="bold" style={styles.label}>
            {t("createShipment.express.steps.step4.width", { unit: dimensionUnit })}
          </Text>

          <TextInput
            value={width}
            onChangeText={onChangeWidth}
            keyboardType="number-pad"
            placeholderTextColor={Colors.placeholder}
            style={styles.gridInput}
          />
        </View>

        <View style={styles.gridItem}>
          <Text size="xs" weight="bold" style={styles.label}>
            {t("createShipment.express.steps.step4.height", { unit: dimensionUnit })}
          </Text>

          <TextInput
            value={height}
            onChangeText={onChangeHeight}
            keyboardType="number-pad"
            placeholderTextColor={Colors.placeholder}
            style={styles.gridInput}
          />
        </View>
      </View>
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

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: rvs(14),
  },

  title: {
    color: Colors.text,
  },

  remove: {
    color: "#687994",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: rs(10),
  },

  gridItem: {
    flexGrow: 1,
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: rs(16),
    paddingHorizontal: rs(10),
    paddingTop: rvs(10),
  },

  label: {
    color: Colors.secondary,
    letterSpacing: 1,
  },

  gridInput: {
    width: "100%",
    height: rvs(40),
    paddingHorizontal: 0,
    textAlign: "center",
    fontSize: Typography.size.large,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.text,
  },
});
