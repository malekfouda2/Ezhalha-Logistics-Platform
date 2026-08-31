// components/sections/createShipment/express/SavedAddressSelect.tsx

import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SavedAddressCard } from "@/components/sections/createShipment/express/SavedAddressCard";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { AddressBookEntry } from "@/lib/services/createShipment";

interface SavedAddressSelectProps {
  title: string;
  placeholder: string;
  emptyText: string;
  addresses: AddressBookEntry[];
  isLoading: boolean;
  selectedAddressId: string | null;
  onSelect: (address: AddressBookEntry) => void;
}

export const SavedAddressSelect = ({
  title,
  placeholder,
  emptyText,
  addresses,
  isLoading,
  selectedAddressId,
  onSelect,
}: SavedAddressSelectProps) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId) ?? null;

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        <Text
          size="medium"
          weight="semibold"
          style={selectedAddress ? styles.value : styles.placeholder}
          numberOfLines={1}
        >
          {isLoading
            ? t("common.loading")
            : selectedAddress
              ? selectedAddress.label
              : placeholder}
        </Text>

        <Feather name="chevron-down" size={rs(24)} color="#8CA0BC" />
      </Pressable>

      <BottomSheet visible={visible} onClose={() => setVisible(false)}>
        <Text size="xl" weight="bold" style={styles.title}>
          {title}
        </Text>

        {isLoading ? (
          <Text size="small" style={styles.emptyText}>
            {t("common.loading")}
          </Text>
        ) : addresses.length > 0 ? (
          <ScrollView style={styles.list}>
            {addresses.map((address) => (
              <SavedAddressCard
                key={address.id}
                name={address.label}
                address={address.addressLine1}
                city={
                  address.postalCode
                    ? `${address.city} ${address.postalCode}`
                    : address.city
                }
                countryFlag={address.countryCode === "SA" ? "🇸🇦" : "🌍"}
                defaultAddress={address.source === "default_shipping"}
                selected={selectedAddressId === address.id}
                onPress={() => {
                  onSelect(address);
                  setVisible(false);
                }}
              />
            ))}
          </ScrollView>
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

  pressed: {
    opacity: 0.8,
  },

  title: {
    color: Colors.text,
    marginBottom: rvs(12),
  },

  list: {
    maxHeight: rvs(420),
  },

  emptyText: {
    color: "#687994",
    marginBottom: rvs(15),
  },
});
