import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  I18nManager,
  Modal,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { Typography } from "@/constants/typography";
import { rs, rvs } from "@/utils/responsive";

import {
  COUNTRY_DIAL_OPTIONS,
  DEFAULT_PHONE_COUNTRY,
  composePhoneNumber,
  parsePhoneNumber,
} from "@shared/countries";

import { countryCodeToFlag } from "@/utils/utils";

export interface PhoneInputProps {
  value: string;
  onChangeValue: (phoneNumber: string) => void;

  placeholder?: string;
  error?: string;
  searchPlaceholder?: string;
}

export const PhoneInput = ({
  value,
  onChangeValue,
  placeholder = "5XX XXX XXX",
  error,
  searchPlaceholder = "Search countries...",
}: PhoneInputProps) => {
  const [pickerVisible, setPickerVisible] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [query, setQuery] = useState("");

  const isRTL = I18nManager.isRTL;

  /**
   * Parse the externally stored phone number.
   *
   * Example:
   * +201012345678
   * =>
   * {
   *   countryCode: "EG",
   *   nationalNumber: "1012345678"
   * }
   */
  const parsedPhone = useMemo(
    () => parsePhoneNumber(value, DEFAULT_PHONE_COUNTRY),
    [value],
  );

  /**
   * Keep country selection locally.
   *
   * This is important because when the phone is empty,
   * composePhoneNumber("EG", "") returns "",
   * so the selected country cannot be stored inside `value`.
   */
  const [selectedCountryCode, setSelectedCountryCode] = useState(
    parsedPhone.countryCode,
  );

  /**
   * If the parent changes the phone value externally,
   * update the selected country accordingly.
   *
   * Example:
   * value changes from +966... to +20...
   * => selected country becomes EG.
   *
   * We intentionally don't update it when value is empty,
   * otherwise selecting a country with an empty phone would
   * immediately reset back to the default country.
   */
  useEffect(() => {
    if (value) {
      setSelectedCountryCode(parsedPhone.countryCode);
    }
  }, [value, parsedPhone.countryCode]);

  /**
   * Get the currently selected country.
   */
  const selectedCountry = useMemo(() => {
    return (
      COUNTRY_DIAL_OPTIONS.find(
        (country) => country.code === selectedCountryCode,
      ) ??
      COUNTRY_DIAL_OPTIONS.find(
        (country) => country.code === DEFAULT_PHONE_COUNTRY,
      ) ??
      COUNTRY_DIAL_OPTIONS[0]
    );
  }, [selectedCountryCode]);

  /**
   * Filter countries by name or dialing code.
   *
   * Examples:
   * "egy"    => Egypt
   * "20"     => Egypt
   * "saudi"  => Saudi Arabia
   * "966"    => Saudi Arabia
   */
  const filteredCountries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return COUNTRY_DIAL_OPTIONS;
    }

    return COUNTRY_DIAL_OPTIONS.filter(
      (country) =>
        country.name.toLowerCase().includes(normalizedQuery) ||
        country.dialCode.includes(normalizedQuery),
    );
  }, [query]);

  /**
   * Handle typing the national phone number.
   *
   * The value stored in the parent is always an E.164-style number:
   *
   * country = EG
   * national = 1012345678
   *
   * => +201012345678
   */
  const handlePhoneChange = (nationalNumber: string) => {
    onChangeValue(
      composePhoneNumber(
        selectedCountry.code,
        nationalNumber,
      ),
    );
  };

  /**
   * Handle selecting another country.
   *
   * Keep the existing national number and replace
   * only the country/dialing code.
   */
  const handleCountrySelect = (
    country: (typeof COUNTRY_DIAL_OPTIONS)[number],
  ) => {
    setSelectedCountryCode(country.code);

    const currentNationalNumber = parsedPhone.nationalNumber;

    onChangeValue(
      composePhoneNumber(
        country.code,
        currentNationalNumber,
      ),
    );

    setQuery("");
    setPickerVisible(false);
  };

  return (
    <View style={styles.container}>
      {/* Phone input */}
      <View
        style={[
          styles.row,
          isFocused && styles.rowFocused,
          error && styles.rowError,
        ]}
      >
        {/* Country / Dial Code */}
        <Pressable
          style={styles.dialCodeBtn}
          onPress={() => setPickerVisible(true)}
        >
          <Text size="medium" style={styles.flag}>
            {countryCodeToFlag(selectedCountry.code)}
          </Text>

          <Text size="medium" weight="semibold">
            +{selectedCountry.dialCode}
          </Text>

          <Ionicons
            name="chevron-down"
            size={rs(14)}
            color={Colors.textSecondary}
            style={{ marginStart: rs(4) }}
          />
        </Pressable>

        <View style={styles.divider} />

        {/* National phone number */}
        <TextInput
          value={parsedPhone.nationalNumber}
          onChangeText={handlePhoneChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={Colors.placeholder}
          keyboardType="phone-pad"
          textAlign={isRTL ? "right" : "left"}
          style={[
            styles.input,
            {
              writingDirection: isRTL ? "rtl" : "ltr",
            },
          ]}
        />
      </View>

      {/* Error */}
      {error ? (
        <Text
          size="xs"
          weight="medium"
          style={[
            styles.errorText,
            {
              textAlign: isRTL ? "right" : "left",
            },
          ]}
        >
          {error}
        </Text>
      ) : null}

      {/* Country Picker */}
      <Modal
        visible={pickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerVisible(false)}
      >
        <View style={styles.modalContainer}>
          {/* Backdrop */}
          <Pressable
            style={styles.backdrop}
            onPress={() => setPickerVisible(false)}
          />

          {/* Bottom Sheet */}
          <SafeAreaView style={styles.sheet}>
            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text size="large" weight="bold">
                Select country
              </Text>

              <Pressable
                onPress={() => setPickerVisible(false)}
                hitSlop={10}
              >
                <Ionicons
                  name="close"
                  size={rs(22)}
                  color={Colors.text}
                />
              </Pressable>
            </View>

            {/* Search */}
            <View style={styles.searchRow}>
              <Ionicons
                name="search"
                size={rs(16)}
                color={Colors.textSecondary}
                style={{ marginEnd: rs(8) }}
              />

              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={searchPlaceholder}
                placeholderTextColor={Colors.placeholder}
                style={styles.searchInput}
                autoFocus
                textAlign={isRTL ? "right" : "left"}
              />
            </View>

            {/* Countries */}
            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isSelected =
                  item.code === selectedCountry.code;

                return (
                  <Pressable
                    onPress={() => handleCountrySelect(item)}
                    style={[
                      styles.countryRow,
                      isSelected && styles.selectedCountryRow,
                    ]}
                  >
                    {/* Flag */}
                    <Text
                      size="medium"
                      style={styles.countryFlag}
                    >
                      {countryCodeToFlag(item.code)}
                    </Text>

                    {/* Country Name */}
                    <Text
                      size="medium"
                      style={styles.countryName}
                    >
                      {item.name}
                    </Text>

                    {/* Dial Code */}
                    <Text
                      size="medium"
                      style={styles.countryDialCode}
                    >
                      +{item.dialCode}
                    </Text>

                    {/* Selected Check */}
                    {isSelected && (
                      <Ionicons
                        name="checkmark"
                        size={rs(20)}
                        color={Colors.primary}
                        style={{ marginStart: rs(8) }}
                      />
                    )}
                  </Pressable>
                );
              }}
              ItemSeparatorComponent={() => (
                <View style={styles.separator} />
              )}
            />
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    marginBottom: rvs(20),
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.inputBackground,
    borderRadius: rs(16),
    borderWidth: 1.5,
    borderColor: Colors.inputBackground,
    paddingStart: rs(14),
  },

  rowFocused: {
    borderColor: Colors.primary,
  },

  rowError: {
    borderColor: "#E53E3E",
  },

  dialCodeBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: rvs(16),
    paddingEnd: rs(10),
  },

  flag: {
    marginEnd: rs(6),
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
  },

  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },

  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.4)",
  },

  sheet: {
    height: "75%",
    backgroundColor: Colors.background,
    borderTopLeftRadius: rs(24),
    borderTopRightRadius: rs(24),
    paddingHorizontal: rs(20),
    paddingTop: rvs(16),
  },

  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: rvs(16),
  },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.inputBackground,
    borderRadius: rs(14),
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: rs(14),
    marginBottom: rvs(12),
  },

  searchInput: {
    flex: 1,
    height: rvs(46),
    fontSize: Typography.size.medium,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text,
  },

  countryRow: {
    minHeight: rvs(56),
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: rvs(12),
    paddingHorizontal: rs(10),
  },

  selectedCountryRow: {
    backgroundColor: Colors.inputBackground,
    borderRadius: rs(10),
  },

  countryFlag: {
    width: rs(32),
    fontSize: Typography.size.large,
  },

  countryName: {
    flex: 1,
    marginStart: rs(8),
  },

  countryDialCode: {
    color: Colors.textSecondary,
  },

  separator: {
    height: 1,
    backgroundColor: Colors.border,
  },
});