// components/ui/Button.tsx
import {
  Pressable,
  PressableProps,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
} from "react-native";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

export interface ButtonProps extends PressableProps {
  title: string;
  variant?: "primary" | "outline";
  loading?: boolean;
  style?: ViewStyle;
}

export const Button = ({
  title,
  variant = "primary",
  loading = false,
  disabled,
  style,
  ...otherProps
}: ButtonProps) => {
  const isOutline = variant === "outline";

  return (
    <Pressable
      disabled={disabled || loading}
      {...otherProps}
      style={({ pressed }) => [
        styles.base,
        isOutline ? styles.outline : styles.primary,
        pressed && !disabled ? { opacity: 0.85 } : null,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={isOutline ? Colors.text : Colors.white}
        />
      ) : (
        <Text
          size="medium"
          weight="semibold"
          style={isOutline ? styles.outlineText : styles.primaryText}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    width: "100%",
    height: rvs(58),
    borderRadius: rs(16),
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: rvs(6) },
    shadowOpacity: 0.3,
    shadowRadius: rs(10),
    elevation: 4,
  },
  outline: {
    backgroundColor: Colors.inputBackground,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  primaryText: {
    color: Colors.white,
  },
  outlineText: {
    color: Colors.text,
  },
  disabled: {
    opacity: 0.6,
  },
});