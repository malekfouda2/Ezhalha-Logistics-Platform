// components/ui/PhoneInput.tsx
import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  I18nManager,
} from "react-native";
import { CountryPicker } from "react-native-country-codes-picker";
import { Ionicons } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { Typography } from "@/constants/typography";
import { rs, rvs } from "@/utils/responsive";

export interface PhoneInputProps {
  value: string;
  onChangeValue: (nationalNumber: string) => void;
  dialCode: string;
  onChangeDialCode: (dialCode: string) => void;
  countryFlag?: string;
  onChangeCountryFlag?: (flag: string) => void;
  placeholder?: string;
  error?: string;
  defaultCountryCode?: string;
  pickerLang?: string;
  searchPlaceholder?: string;
}

export const PhoneInput = ({
  value,
  onChangeValue,
  dialCode,
  onChangeDialCode,
  countryFlag,
  onChangeCountryFlag,
  placeholder = "5XX XXX XXX",
  error,
  defaultCountryCode = "SA",
  pickerLang = "en",
  searchPlaceholder = "Search countries...",
}: PhoneInputProps) => {
  const [pickerVisible, setPickerVisible] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const isRTL = I18nManager.isRTL;

  const handleSelect = (item: { dial_code: string; flag: string }) => {
    onChangeDialCode(item.dial_code);
    onChangeCountryFlag?.(item.flag);
    setPickerVisible(false);
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.row,
          isFocused && styles.rowFocused,
          error && styles.rowError,
        ]}
      >
        <Pressable
          style={styles.dialCodeBtn}
          onPress={() => setPickerVisible(true)}
        >
          <Text size="medium" weight="medium" style={{ marginEnd: rs(4) }}>
            {countryFlag ?? "🇸🇦"}
          </Text>
          <Text size="medium" weight="semibold" style={{ marginEnd: rs(4) }}>
            {dialCode}
          </Text>
          <Ionicons
            name="chevron-down"
            size={rs(14)}
            color={Colors.textSecondary}
          />
        </Pressable>

        <View style={styles.divider} />

        <TextInput
          value={value}
          onChangeText={onChangeValue}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={Colors.placeholder}
          keyboardType="phone-pad"
          textAlign={isRTL ? "right" : "left"}
          style={[styles.input, { writingDirection: isRTL ? "rtl" : "ltr" }]}
        />
      </View>

      {error ? (
        <Text size="xs" weight="medium" style={styles.errorText}>
          {error}
        </Text>
      ) : null}

      <CountryPicker
        inputPlaceholder={searchPlaceholder}
        show={pickerVisible}
        pickerButtonOnPress={handleSelect}
        onBackdropPress={() => setPickerVisible(false)}
        lang={pickerLang}
        style={{
          modal: { height: rvs(500) },
          textInput: {
            height: rvs(50),
            borderRadius: rs(12),
            fontFamily: Typography.fontFamily.regular,
          },
          countryButtonStyles: { height: rvs(56) },
          searchMessageText: { fontFamily: Typography.fontFamily.regular },
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { width: "100%", marginBottom: rvs(20) },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.inputBackground,
    borderRadius: rs(16),
    borderWidth: 1.5,
    borderColor: Colors.inputBackground,
    paddingStart: rs(14),
  },
  rowFocused: { borderColor: Colors.primary },
  rowError: { borderColor: "#E53E3E" },
  dialCodeBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: rvs(16),
    paddingEnd: rs(10),
  },
  divider: {
    width: 1.5,
    height: rvs(28),
    backgroundColor: Colors.border,
    marginEnd: rs(12),
  },
  input: {
    flex: 1,
    height: rvs(58),
    fontSize: Typography.size.medium,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text,
    paddingEnd: rs(18),
  },
  errorText: {
    color: "#E53E3E",
    marginTop: rvs(6),
    textAlign: I18nManager.isRTL ? "right" : "left",
  },
});
