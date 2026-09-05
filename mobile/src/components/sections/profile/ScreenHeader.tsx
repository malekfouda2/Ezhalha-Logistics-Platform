import React from "react";
import { StyleSheet, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { BackButton } from "@/components/ui/BackButton";
import { rs, rvs } from "@/utils/responsive";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}

export function ScreenHeader({ title, subtitle, onBack }: ScreenHeaderProps) {
  return (
    <View style={styles.headerRow}>
      <BackButton onPress={onBack} />
      <View style={styles.headerTitleBlock}>
        <Text size="medium" weight="bold">
          {title}
        </Text>
        {subtitle ? (
          <Text size="small" weight="semibold" dimRate="60%">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: rvs(20),
  },
  headerTitleBlock: {
    flex: 1,
    paddingStart: rs(10),
  },
});
