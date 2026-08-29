// components/sections/createShipment/express/SavedAddressCard.tsx

import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
  countryFlag?: string;
  variant?: "select" | "use";
  selected?: boolean;
  onPress: () => void;
}

export const SavedAddressCard = ({
  name,
  address,
  city,
  type = "home",
  defaultAddress = false,
  countryFlag = "🇸🇦",
  variant = "select",
  selected = false,
  onPress,
}: SavedAddressCardProps) => {
  const isUseVariant = variant === "use";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        !isUseVariant && selected && styles.containerSelected,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.iconContainer,
          !isUseVariant && selected && styles.iconContainerSelected,
        ]}
      >
        <Feather
          name={
            isUseVariant
              ? "user"
              : type === "warehouse"
              ? "archive"
              : "home"
          }
          size={rs(20)}
          color={!isUseVariant && selected ? Colors.primary : "#71829C"}
        />
      </View>

      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Text
            size="medium"
            weight="bold"
            style={styles.name}
            numberOfLines={1}
          >
            {name}
          </Text>

          {defaultAddress && !isUseVariant && (
            <Text size="small" weight="bold" style={styles.defaultText}>
              Default
            </Text>
          )}
        </View>

        <Text size="small" style={styles.address} numberOfLines={1}>
          {address}
        </Text>

        <View style={styles.cityRow}>
          <Text size="small" style={styles.city}>
            {city}
          </Text>

          <Text size="large"> · </Text>

          <Text size="large">{countryFlag}</Text>
        </View>
      </View>

      {isUseVariant && (
        <Pressable onPress={onPress} hitSlop={10}>
          <Text size="medium" weight="bold" style={styles.useLabel}>
            Use
          </Text>
        </Pressable>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    minHeight: rvs(100),

    backgroundColor: Colors.white,

    borderRadius: rs(22),

    padding: rvs(15),

    flexDirection: "row",
    alignItems: "flex-start",

    marginBottom: rvs(10),

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
    width: rs(35),
    height: rs(35),

    borderRadius: rs(10),

    backgroundColor: "#F4F6F8",

    alignItems: "center",
    justifyContent: "center",

    marginEnd: rs(15),
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

  useLabel: {
    color: Colors.primary,
    marginStart: rs(10),
    alignSelf: "center",
  },
});