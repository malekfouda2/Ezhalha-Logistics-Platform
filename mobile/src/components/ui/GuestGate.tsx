// components/ui/GuestGate.tsx

import React from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

/**
 * The one wall in guest mode — modeled on `SalesFeatureGate`/`DangerousGoodsGate` and on web's
 * `GuestCheckoutGate`. Guests can walk the whole portal and get a real live rate; this is the
 * single point where an account is asked for, and it sits exactly where the money is (checkout)
 * or where the surface has no public equivalent (Quick Quote).
 */
export function GuestGate({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.iconWrapper}>
          <Ionicons name="lock-closed-outline" size={rs(34)} color={Colors.primary} />
        </View>

        <Text size="xl" weight="bold" style={styles.title}>
          {title}
        </Text>
        <Text size="small" dimRate="60%" style={styles.description}>
          {description}
        </Text>

        <Button
          title={t("guest.gate.cta")}
          onPress={() => router.push("/apply")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: rs(24),
  },
  iconWrapper: {
    alignSelf: "center",
    width: rs(76),
    height: rs(76),
    borderRadius: rs(22),
    backgroundColor: "#FFF3EC",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: rvs(16),
  },
  title: {
    textAlign: "center",
  },
  description: {
    textAlign: "center",
    marginTop: rvs(8),
    marginBottom: rvs(20),
  },
});
