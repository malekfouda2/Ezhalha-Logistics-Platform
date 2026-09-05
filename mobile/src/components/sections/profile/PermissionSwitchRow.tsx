import React from "react";
import { StyleSheet, Switch, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rvs } from "@/utils/responsive";

interface PermissionSwitchRowProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export function PermissionSwitchRow({
  label,
  value,
  onValueChange,
  disabled,
}: PermissionSwitchRowProps) {
  return (
    <View style={styles.row}>
      <Text size="medium" weight="semibold" dimRate={disabled ? "50%" : undefined}>
        {label}
      </Text>

      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: Colors.border, true: Colors.primary }}
        thumbColor={Colors.white}
        ios_backgroundColor={Colors.border}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: rvs(12),
  },
});
