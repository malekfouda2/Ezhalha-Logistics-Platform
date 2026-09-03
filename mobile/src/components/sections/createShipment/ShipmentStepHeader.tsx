// components/shipment/ShipmentStepHeader.tsx

import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useTranslation } from "react-i18next";
import { BackButton } from "@/components/ui/BackButton";

interface ShipmentStepHeaderProps {
  step: number;
  totalSteps?: number;
  title: string;
  subtitle: string;
  onBack: () => void;
}

export const ShipmentStepHeader = ({
  step,
  totalSteps = 9,
  title,
  subtitle,
}: ShipmentStepHeaderProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const handleClose = () => router.replace("/createShipment");

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <BackButton />

        <View style={styles.titleContainer}>
          <View style={styles.titleRow}>
            <Text
              size="medium"
              weight="bold"
              numberOfLines={1}
              style={styles.title}
            >
              {title}
            </Text>

            <Pressable
              onPress={handleClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={rs(22)} color={Colors.text} />
            </Pressable>
          </View>

          <Text size="xs" weight="semibold" style={styles.subtitle}>
            {t("createShipment.express.common.step")} {step}{" "}
            {t("createShipment.express.common.of")} {totalSteps} · {subtitle}
          </Text>
        </View>
      </View>

      <View style={styles.progressContainer}>
        {Array.from({ length: totalSteps }).map((_, index) => {
          const active = index < step;

          return (
            <View
              key={index}
              style={[styles.progressItem, active && styles.progressItemActive]}
            />
          );
        })}
      </View>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    paddingHorizontal: rs(16),
    paddingTop: rvs(16),
    marginBottom: rvs(16),
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  titleContainer: {
    flex: 1,
    marginStart: rs(10),
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: rs(10),
  },

  title: {
    color: Colors.text,
  },

  subtitle: {
    color: "#687994",
  },

  progressContainer: {
    flexDirection: "row",
    gap: rs(10),
    marginTop: rvs(20),
  },

  progressItem: {
    flex: 1,
    height: rvs(4),
    borderRadius: rs(5),
    backgroundColor: "#E9EDF2",
  },

  progressItemActive: {
    backgroundColor: Colors.primary,
  },
});
