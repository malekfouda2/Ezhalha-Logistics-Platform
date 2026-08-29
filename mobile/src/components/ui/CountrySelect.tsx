import React, { useMemo, useState } from "react";
import {
  View,
  Modal,
  StyleSheet,
  Pressable,
  I18nManager,
  TextInput,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { Typography } from "@/constants/typography";
import { normalizeCountryCode, COUNTRY_CODE_SELECT_OPTIONS } from "@shared/countries";



export interface CountrySelectProps {
  value?: string;
  onChange: (country: {
    code: string;
    name: string;
  }) => void;
  placeholder?: string;
  error?: string;
  title?: string;
  searchPlaceholder?: string;
}

export const CountrySelect = ({
  value,
  onChange,
  placeholder = "Select country",
  error,
  title = "Select country",
  searchPlaceholder = "Search countries...",
}: CountrySelectProps) => {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");

  const isRTL = I18nManager.isRTL;

  const selectedCountry = useMemo(() => {
    const code = normalizeCountryCode(value);

    return COUNTRY_CODE_SELECT_OPTIONS.find(
      (country) => country.value === code,
    );
  }, [value]);

  const filteredCountries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return COUNTRY_CODE_SELECT_OPTIONS;
    }

    return COUNTRY_CODE_SELECT_OPTIONS.filter((country) =>
      country.label.toLowerCase().includes(normalizedQuery),
    );
  }, [query]);

  const handleSelect = (country: {
    value: string;
    label: string;
  }) => {
    onChange({
      code: country.value,
      name: country.label,
    });

    setQuery("");
    setVisible(false);
  };

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.field, error && styles.fieldError]}
        onPress={() => setVisible(true)}
      >
        <Text
          size="medium"
          style={{
            color: selectedCountry ? Colors.text : Colors.placeholder,
            flex: 1,
          }}
        >
          {selectedCountry?.label || placeholder}
        </Text>

        <Ionicons
          name="chevron-down"
          size={rs(16)}
          color={Colors.textSecondary}
        />
      </Pressable>

      {error ? (
        <Text size="xs" weight="medium" style={styles.errorText}>
          {error}
        </Text>
      ) : null}

      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalContainer}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setVisible(false)}
          />

          <SafeAreaView style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text size="large" weight="bold">
                {title}
              </Text>

              <Pressable
                onPress={() => setVisible(false)}
                hitSlop={10}
              >
                <Ionicons
                  name="close"
                  size={rs(22)}
                  color={Colors.text}
                />
              </Pressable>
            </View>

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

            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => item.value}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isSelected =
                  item.value === selectedCountry?.value;

                return (
                  <Pressable
                    onPress={() => handleSelect(item)}
                    style={[
                      styles.countryRow,
                      isSelected && styles.selectedCountryRow,
                    ]}
                  >
                    <Text
                      size="medium"
                      style={styles.countryName}
                    >
                      {item.label}
                    </Text>

                    {isSelected && (
                      <Ionicons
                        name="checkmark"
                        size={rs(20)}
                        color={Colors.primary}
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

  field: {
    flexDirection: "row",
    alignItems: "center",
    height: rvs(50),
    backgroundColor: Colors.inputBackground,
    borderRadius: rs(16),
    borderWidth: 1.5,
    borderColor: Colors.inputBackground,
    paddingHorizontal: rs(18),
  },

  fieldError: {
    borderColor: "#E53E3E",
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
    minHeight: rvs(52),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: rvs(12),
  },

  selectedCountryRow: {
    backgroundColor: Colors.inputBackground,
    borderRadius: rs(10),
    paddingHorizontal: rs(10),
  },

  countryName: {
    flex: 1,
  },

  separator: {
    height: 1,
    backgroundColor: Colors.border,
  },
});