// components/sections/createShipment/doorToDoor/OriginCountrySelect.tsx

import React, { useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { countryCodeToFlag } from "@/utils/utils";
import { COUNTRY_CODE_SELECT_OPTIONS } from "@shared/countries";

function countryLabel(code: string) {
  return COUNTRY_CODE_SELECT_OPTIONS.find((c) => c.value === code)?.label ?? code;
}

interface OriginCountrySelectProps {
  value: string;
  options: string[];
  placeholder: string;
  title: string;
  emptyText: string;
  onSelect: (code: string) => void;
}

export const OriginCountrySelect = ({
  value,
  options,
  placeholder,
  title,
  emptyText,
  onSelect,
}: OriginCountrySelectProps) => {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        {value ? (
          <Text size="medium" weight="semibold" style={styles.value} numberOfLines={1}>
            {countryCodeToFlag(value)}  {countryLabel(value)}
          </Text>
        ) : (
          <Text size="medium" weight="semibold" style={styles.placeholder} numberOfLines={1}>
            {placeholder}
          </Text>
        )}

        <Feather name="chevron-down" size={rs(24)} color="#8CA0BC" />
      </Pressable>

      <BottomSheet visible={visible} onClose={() => setVisible(false)}>
        <Text size="xl" weight="bold" style={styles.title}>
          {title}
        </Text>

        {options.length > 0 ? (
          <FlatList
            data={options}
            keyExtractor={(code) => code}
            style={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: code }) => (
              <Pressable
                style={styles.row}
                onPress={() => {
                  onSelect(code);
                  setVisible(false);
                }}
              >
                <Text size="medium">
                  {countryCodeToFlag(code)}  {countryLabel(code)}
                </Text>

                {code === value ? <Feather name="check" size={rs(18)} color={Colors.primary} /> : null}
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        ) : (
          <Text size="small" style={styles.emptyText}>
            {emptyText}
          </Text>
        )}
      </BottomSheet>
    </>
  );
};

const styles = StyleSheet.create({
  trigger: {
    width: "100%",
    height: rvs(55),

    backgroundColor: Colors.white,

    borderRadius: rs(18),
    borderWidth: 1,
    borderColor: Colors.border,

    paddingHorizontal: rs(15),

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  pressed: {
    opacity: 0.8,
  },

  value: {
    flex: 1,
    color: Colors.text,
    marginEnd: rs(10),
  },

  placeholder: {
    flex: 1,
    color: Colors.placeholder,
    marginEnd: rs(10),
  },

  title: {
    color: Colors.text,
    marginBottom: rvs(12),
  },

  list: {
    maxHeight: rvs(420),
  },

  row: {
    minHeight: rvs(52),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: rvs(12),
  },

  separator: {
    height: 1,
    backgroundColor: Colors.border,
  },

  emptyText: {
    color: "#687994",
    marginBottom: rvs(15),
  },
});
