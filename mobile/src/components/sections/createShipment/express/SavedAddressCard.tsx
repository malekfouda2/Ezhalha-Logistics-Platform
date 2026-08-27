// components/shipment/SavedAddressCard.tsx

import React from "react";
import {
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

interface SavedAddressCardProps {
  name: string;
  address: string;
  city: string;
  type?: "home" | "warehouse";
  defaultAddress?: boolean;
  selected: boolean;
  onPress: () => void;
}

export const SavedAddressCard = ({
  name,
  address,
  city,
  type = "home",
  defaultAddress = false,
  selected,
  onPress,
}: SavedAddressCardProps) => {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        selected && styles.containerSelected,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.iconContainer,
          selected && styles.iconContainerSelected,
        ]}
      >
        <Feather
          name={type === "warehouse" ? "archive" : "home"}
          size={rs(27)}
          color={selected ? Colors.primary : "#71829C"}
        />
      </View>

      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Text
            size="xl"
            weight="bold"
            style={styles.name}
            numberOfLines={1}
          >
            {name}
          </Text>

          {defaultAddress && (
            <Text
              size="large"
              weight="bold"
              style={styles.defaultText}
            >
              Default
            </Text>
          )}
        </View>

        <Text
          size="large"
          style={styles.address}
          numberOfLines={1}
        >
          {address}
        </Text>

        <View style={styles.cityRow}>
          <Text
            size="large"
            style={styles.city}
          >
            {city}
          </Text>

          <Text size="large"> · </Text>

          <Text size="large">🇸🇦</Text>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    minHeight: rvs(140),

    backgroundColor: Colors.white,

    borderRadius: rs(22),

    paddingHorizontal: rs(26),
    paddingVertical: rvs(22),

    flexDirection: "row",
    alignItems: "center",

    marginBottom: rvs(20),

    borderWidth: 1.5,
    borderColor: "transparent",

    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.04,
    shadowRadius: 6,

    elevation: 1,
  },

  containerSelected: {
    borderColor: Colors.primary,
  },

  pressed: {
    opacity: 0.85,
  },

  iconContainer: {
    width: rs(64),
    height: rs(64),

    borderRadius: rs(18),

    backgroundColor: "#F4F6F8",

    alignItems: "center",
    justifyContent: "center",

    marginEnd: rs(22),
  },

  iconContainerSelected: {
    backgroundColor: "#FFF0E9",
  },

  content: {
    flex: 1,
  },

  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",

    marginBottom: rvs(4),
  },

  name: {
    flex: 1,
    color: Colors.text,
    paddingEnd: rs(10),
  },

  defaultText: {
    color: Colors.primary,
  },

  address: {
    color: "#687994",
    marginBottom: rvs(2),
  },

  cityRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  city: {
    color: "#687994",
  },
});