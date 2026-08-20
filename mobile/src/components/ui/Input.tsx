// components/ui/Input.tsx

import { forwardRef, useState } from "react";
import {
  TextInput,
  TextInputProps,
  View,
  StyleSheet,
  Pressable,
  I18nManager,
} from "react-native";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { Typography } from "@/constants/typography";
import { rs, rvs } from "@/utils/responsive";

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  rightElement?: React.ReactNode;
  onRightElementPress?: () => void;
}

export const Input = forwardRef<TextInput, InputProps>(
  (props, ref) => {
    const {
      label,
      error,
      rightElement,
      onRightElementPress,
      style,
      ...otherProps
    } = props;

    const [isFocused, setIsFocused] = useState(false);

    const isRTL = I18nManager.isRTL;

    return (
      <View style={styles.container}>
        {/* Label */}
        {label ? (
          <Text
            size="medium"
            weight="semibold"
            style={styles.label}
          >
            {label}
          </Text>
        ) : null}

        {/* Input */}
        <View
          style={[
            styles.inputWrapper,
            isFocused && styles.inputWrapperFocused,
            error && styles.inputWrapperError,
          ]}
        >
          <TextInput
            ref={ref}
            {...otherProps}
            onFocus={(e) => {
              setIsFocused(true);
              otherProps.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              otherProps.onBlur?.(e);
            }}
            placeholderTextColor={Colors.placeholder}
            textAlign={isRTL ? "right" : "left"}
            style={[
              styles.input,
              {
                writingDirection: isRTL ? "rtl" : "ltr",
              },
              style,
            ]}
          />

          {/* Right/End Element */}
          {rightElement ? (
            <Pressable
              onPress={onRightElementPress}
              hitSlop={10}
              style={styles.rightElement}
            >
              {rightElement}
            </Pressable>
          ) : null}
        </View>

        {/* Error */}
        {error ? (
          <Text
            size="xs"
            weight="medium"
            style={styles.errorText}
          >
            {error}
          </Text>
        ) : null}
      </View>
    );
  }
);

Input.displayName = "Input";

const styles = StyleSheet.create({
  container: {
    width: "100%",
    marginBottom: rvs(20),
  },

  label: {
    color: Colors.text,
    marginBottom: rvs(10),
  },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",

    backgroundColor: Colors.inputBackground,

    borderRadius: rs(16),
    borderWidth: 1.5,
    borderColor: Colors.inputBackground,

    paddingStart: rs(18),
    paddingEnd: rs(18),
  },

  inputWrapperFocused: {
    borderColor: Colors.primary,
  },

  inputWrapperError: {
    borderColor: "#E53E3E",
  },

  input: {
    flex: 1,
    height: rvs(58),

    fontSize: Typography.size.medium,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text,
  },

  rightElement: {
    paddingVertical: rs(8),

    // Automatically:
    // LTR -> margin-left
    // RTL -> margin-right
    marginStart: rs(8),
  },

  errorText: {
    color: "#E53E3E",
    marginTop: rvs(6),

    textAlign: I18nManager.isRTL ? "right" : "left",
  },
});