// components/shipment/ShipmentStepHeader.tsx

import React from "react";
import {
  StyleSheet,
  View,
} from "react-native";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
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
  onBack,
}: ShipmentStepHeaderProps) => {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <BackButton/>

        <View style={styles.titleContainer}>
          <Text
            size="medium"
            weight="bold"
            numberOfLines={1}
            style={styles.title}
          >
            {title}
          </Text>

          <Text
            size="xs"
            weight="semibold"
            style={styles.subtitle}
          >
            Step {step} of {totalSteps} · {subtitle}
          </Text>
        </View>
      </View>

      <View style={styles.progressContainer}>
        {Array.from({ length: totalSteps }).map((_, index) => {
          const active = index < step;

          return (
            <View
              key={index}
              style={[
                styles.progressItem,
                active && styles.progressItemActive,
              ]}
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
    marginBottom: rvs(20),
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  backButton: {
    width: rs(68),
    height: rvs(68),
    borderRadius: rs(20),
    backgroundColor: Colors.white,

    alignItems: "center",
    justifyContent: "center",

    borderWidth: 1,
    borderColor: Colors.border,

    marginEnd: rs(20),
  },

  titleContainer: {
    flex: 1,
    marginStart: rs(10)
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