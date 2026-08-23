// components/ui/CountrySelect.tsx

import React, { useState } from "react";
import {
  View,
  Modal,
  StyleSheet,
  Pressable,
  I18nManager,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CountryList } from "react-native-country-codes-picker";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { Input } from "@/components/ui/Input";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { Typography } from "@/constants/typography";

export interface CountryOption {
  name: string;
  code: string;
  flag: string;
  dial_code?: string;
}

export interface CountrySelectProps {
  value?: string;
  onChange: (country: CountryOption) => void;
  placeholder?: string;
  error?: string;
  title?: string;
  pickerLang?: string;
  searchPlaceholder?: string;
}

export const CountrySelect = ({
  value,
  onChange,
  placeholder = "Select country",
  error,
  title = "Select country",
  pickerLang = "en",
  searchPlaceholder = "Search countries...",
}: CountrySelectProps) => {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const isRTL = I18nManager.isRTL;

  const handleSelect = (item: any) => {
    onChange({
      name: item.name,
      code: item.code,
      flag: item.flag,
      dial_code: item.dial_code,
    });

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
          style={{ color: value ? Colors.text : Colors.placeholder, flex: 1 }}
        >
          {value || placeholder}
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
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)} />
        <SafeAreaView style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text size="large" weight="bold">
              {title}
            </Text>
            <Pressable onPress={() => setVisible(false)} hitSlop={10}>
              <Ionicons name="close" size={rs(22)} color={Colors.text} />
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

          <CountryList
            searchValue={query}
            lang={pickerLang}
            pickerButtonOnPress={handleSelect}
            itemTemplate={(item: any) => {
              const country = item.item;

              return (
                <Pressable onPress={item.onPress} style={styles.row}>
                  <Text size="medium" style={{ marginHorizontal: rs(10) }}>
                    {country.flag}
                  </Text>

                  <Text size="medium">{item.name}</Text>
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { width: "100%", marginBottom: rvs(20) },
  field: {
    flexDirection: "row",
    alignItems: "center",
    height: rvs(58),
    backgroundColor: Colors.inputBackground,
    borderRadius: rs(16),
    borderWidth: 1.5,
    borderColor: Colors.inputBackground,
    paddingHorizontal: rs(18),
  },
  fieldError: { borderColor: "#E53E3E" },
  errorText: { color: "#E53E3E", marginTop: rvs(6) },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
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
  row: { flexDirection: "row", alignItems: "center", paddingVertical: rvs(14) },
  separator: { height: 1, backgroundColor: Colors.border },
  countryRow: {
    // flex: 1,
    // alignItems: "center",
    paddingVertical: rvs(14),
  },
});
