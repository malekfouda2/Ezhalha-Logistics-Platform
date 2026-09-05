import React from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { RefreshableScreen } from "@/components/ui/RefreshableScreen";
import InfoBox from "@/components/ui/InfoBox";
import { ScreenHeader } from "@/components/sections/profile/ScreenHeader";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

import { useDevices, useRevokeDevice } from "@/lib/hooks/useAuth";
import type { SignedInDevice } from "@/lib/services/auth";

function relativeTime(dateString: string | null): string {
  if (!dateString) return "";
  const diffMs = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString();
}

export default function SignedInDevicesScreen() {
  const { t } = useTranslation();
  const { data: devices, isLoading } = useDevices();
  const revokeMutation = useRevokeDevice();

  const sorted = [...(devices ?? [])].sort((a, b) => {
    const aTime = new Date(a.lastUsedAt || a.createdAt).getTime();
    const bTime = new Date(b.lastUsedAt || b.createdAt).getTime();
    return bTime - aTime;
  });
  const currentDeviceId = sorted[0]?.id;

  const handleSignOut = (device: SignedInDevice) => {
    Alert.alert(
      t("signedInDevices.signOutConfirmTitle"),
      t("signedInDevices.signOutConfirmMessage", {
        name: device.deviceName || t("signedInDevices.unknownDevice"),
      }),
      [
        { text: t("teamMembers.cancel"), style: "cancel" },
        {
          text: t("signedInDevices.signOut"),
          style: "destructive",
          onPress: async () => {
            try {
              await revokeMutation.mutateAsync(device.id);
            } catch (error) {
              Toast.show({
                type: "error",
                text1: t("signedInDevices.signOutErrorTitle"),
                text2: error instanceof Error ? error.message : undefined,
              });
            }
          },
        },
      ],
    );
  };

  return (
    <RefreshableScreen contentContainerStyle={styles.content}>
      <ScreenHeader
        title={t("signedInDevices.title")}
        subtitle={t("signedInDevices.subtitle")}
      />

      {isLoading ? (
        <ActivityIndicator color={Colors.primary} style={styles.loading} />
      ) : (
        <>
          {sorted.map((device) => {
            const isCurrent = device.id === currentDeviceId;
            return (
              <View key={device.id} style={styles.row}>
                <View style={styles.iconBox}>
                  <Ionicons
                    name={device.platform === "ios" ? "phone-portrait-outline" : "phone-portrait-outline"}
                    size={rs(20)}
                    color={Colors.primary}
                  />
                </View>

                <View style={styles.info}>
                  <Text size="medium" weight="bold">
                    {device.deviceName || t("signedInDevices.unknownDevice")}
                  </Text>
                  <Text size="xs" weight="semibold" dimRate="55%" style={styles.meta}>
                    {isCurrent
                      ? t("signedInDevices.thisDevice")
                      : relativeTime(device.lastUsedAt)}
                  </Text>
                </View>

                {isCurrent ? (
                  <View style={styles.currentBadge}>
                    <Text size="xs" weight="bold" style={styles.currentBadgeText}>
                      {t("signedInDevices.current")}
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => handleSignOut(device)}
                    disabled={revokeMutation.isPending}
                    hitSlop={10}
                  >
                    <Text size="small" weight="bold" style={styles.signOutText}>
                      {t("signedInDevices.signOut")}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })}

          {sorted.length === 0 && (
            <Text size="small" dimRate="60%" style={styles.emptyText}>
              {t("signedInDevices.empty")}
            </Text>
          )}

          <InfoBox text={t("signedInDevices.notice")} />
        </>
      )}
    </RefreshableScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(8),
    paddingBottom: rvs(24),
  },
  loading: {
    marginTop: rvs(60),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    paddingHorizontal: rs(14),
    paddingVertical: rvs(14),
    marginBottom: rvs(12),
    gap: rs(12),
  },
  iconBox: {
    width: rs(40),
    height: rs(40),
    borderRadius: rs(12),
    backgroundColor: "#FFF1E8",
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
  },
  meta: {
    marginTop: rvs(2),
  },
  currentBadge: {
    backgroundColor: "#DDF5E4",
    borderRadius: rs(20),
    paddingHorizontal: rs(10),
    paddingVertical: rvs(5),
  },
  currentBadgeText: {
    color: "#1E8A4C",
  },
  signOutText: {
    color: Colors.error,
  },
  emptyText: {
    textAlign: "center",
    paddingVertical: rvs(20),
  },
});
