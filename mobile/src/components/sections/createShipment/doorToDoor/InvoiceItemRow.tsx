// components/sections/createShipment/doorToDoor/InvoiceItemRow.tsx
// Inline-editable row for one invoice/customs item — deliberately not a modal, so every
// field (name, category, origin, qty, price, HS code) can be edited directly in place.

import React from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Colors } from "@/constants/colors";
import { Typography } from "@/constants/typography";
import { rs, rvs } from "@/utils/responsive";
import { CustomsItem } from "@/store/createExpressShipmentStore";

interface InvoiceItemRowProps {
  item: CustomsItem;
  onChange: (patch: Partial<CustomsItem>) => void;
  onRemove?: () => void;
  placeholders: {
    itemName: string;
    category: string;
    origin: string;
    quantity: string;
    price: string;
    hsCode: string;
  };
}

export const InvoiceItemRow = ({ item, onChange, onRemove, placeholders }: InvoiceItemRowProps) => {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <TextInput
          style={[styles.field, styles.fieldWide]}
          placeholder={placeholders.itemName}
          placeholderTextColor={Colors.placeholder}
          value={item.itemName}
          onChangeText={(v) => onChange({ itemName: v })}
        />

        <TextInput
          style={styles.field}
          placeholder={placeholders.category}
          placeholderTextColor={Colors.placeholder}
          value={item.category}
          onChangeText={(v) => onChange({ category: v })}
        />

        <TextInput
          style={styles.field}
          placeholder={placeholders.origin}
          placeholderTextColor={Colors.placeholder}
          value={item.countryOfOrigin}
          onChangeText={(v) => onChange({ countryOfOrigin: v.toUpperCase().slice(0, 2) })}
          autoCapitalize="characters"
          maxLength={2}
        />

        <TextInput
          style={[styles.field, styles.fieldNarrow]}
          placeholder={placeholders.quantity}
          placeholderTextColor={Colors.placeholder}
          value={item.quantity ? String(item.quantity) : ""}
          onChangeText={(v) => onChange({ quantity: Number(v) || 0 })}
          keyboardType="number-pad"
          textAlign="center"
        />

        <TextInput
          style={[styles.field, styles.fieldNarrow]}
          placeholder={placeholders.price}
          placeholderTextColor={Colors.placeholder}
          value={item.price ? String(item.price) : ""}
          onChangeText={(v) => onChange({ price: Number(v) || 0 })}
          keyboardType="decimal-pad"
          textAlign="center"
        />

        <TextInput
          style={styles.field}
          placeholder={placeholders.hsCode}
          placeholderTextColor={Colors.placeholder}
          value={item.hsCode}
          onChangeText={(v) => onChange({ hsCode: v })}
        />

        {onRemove ? (
          <Pressable onPress={onRemove} hitSlop={10} style={styles.removeBtn}>
            <Feather name="trash-2" size={rs(18)} color="#E53E3E" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: Colors.white,
    borderRadius: rs(18),
    borderWidth: 1,
    borderColor: Colors.border,
    padding: rs(10),
    marginBottom: rvs(10),
  },

  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: rs(8),
  },

  field: {
    minWidth: rs(76),
    flexGrow: 1,
    flexBasis: rs(76),
    height: rvs(40),
    backgroundColor: Colors.background,
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: rs(10),
    fontSize: Typography.size.small,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text,
  },

  fieldWide: {
    flexBasis: "100%",
  },

  fieldNarrow: {
    flexGrow: 0,
    flexBasis: rs(56),
    minWidth: rs(56),
  },

  removeBtn: {
    marginStart: "auto",
    padding: rs(6),
  },
});
