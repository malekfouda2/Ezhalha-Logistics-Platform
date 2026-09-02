// components/sections/createShipment/doorToDoor/AcceptCheckboxRow.tsx

import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

interface AcceptCheckboxRowProps {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export const AcceptCheckboxRow = ({ checked, onToggle, children }: AcceptCheckboxRowProps) => {
  return (
    <Pressable onPress={onToggle} style={styles.row}>
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Feather name="check" size={rs(13)} color={Colors.white} /> : null}
      </View>

      <View style={styles.textContainer}>{children}</View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(10),

    backgroundColor: Colors.white,
    borderRadius: rs(16),
    borderWidth: 1,
    borderColor: Colors.border,

    paddingHorizontal: rs(14),
    paddingVertical: rvs(12),

    marginBottom: rvs(10),
  },

  box: {
    width: rs(20),
    height: rs(20),
    borderRadius: rs(6),
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: rvs(1),
  },

  boxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },

  textContainer: {
    flex: 1,
  },
});
