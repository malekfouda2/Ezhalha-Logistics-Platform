import React from "react";
import {
  TouchableOpacity,
  TouchableOpacityProps,
  StyleSheet,
  I18nManager,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "@/constants/colors";
import { rs } from "@/utils/responsive";

export interface BackButtonProps extends TouchableOpacityProps {
  onPress?: () => void;
  size?: number;
  color?: string;
}

export const BackButton = ({
  onPress,
  size = 22,
  color = Colors.text,
  style,
  ...otherProps
}: BackButtonProps) => {
  const router = useRouter();
  const isRTL = I18nManager.isRTL;

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    router.back();
  };

  return (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={handlePress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      {...otherProps}
    >
      <Ionicons
        name={isRTL ? "chevron-forward" : "chevron-back"}
        size={rs(size)}
        color={color}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: rs(40),
    height: rs(40),
    borderRadius: rs(12),
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});