import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";

import { Text } from "@/components/ui/Text";
import { platformMeta } from "@/constants/platforms";
import { rs } from "@/utils/responsive";

interface PlatformIconProps {
  platform: string;
  size?: number;
  style?: ViewStyle;
}

export function PlatformIcon({ platform, size = 42, style }: PlatformIconProps) {
  const meta = platformMeta(platform);

  return (
    <View
      style={[
        styles.box,
        { width: rs(size), height: rs(size), borderRadius: rs(size * 0.3), backgroundColor: meta.color },
        style,
      ]}
    >
      <Text weight="bold" style={[styles.code, { fontSize: rs(size * 0.36) }]}>
        {meta.code}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "center",
  },
  code: {
    color: "#FFFFFF",
  },
});
