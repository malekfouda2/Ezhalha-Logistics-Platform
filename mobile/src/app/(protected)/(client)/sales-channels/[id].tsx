import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { RefreshableScreen } from "@/components/ui/RefreshableScreen";
import { InfoRow, SectionLabel } from "@/components/ui/InfoCard";
import { Button } from "@/components/ui/Button";
import { ChipSelect } from "@/components/ui/ChipSelect";
import InfoBox from "@/components/ui/InfoBox";
import { ScreenHeader } from "@/components/sections/profile/ScreenHeader";
import { PlatformIcon } from "@/components/sections/salesChannels/PlatformIcon";
import { CarrierModeSelect } from "@/components/sections/salesChannels/CarrierModeSelect";
import { SalesFeatureGate } from "@/components/sections/salesChannels/SalesFeatureGate";
import { platformMeta } from "@/constants/platforms";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { formatDateTime } from "@/utils/invoiceFormat";
import {
  useDisconnectSalesChannel,
  useSalesChannels,
  useSyncSalesChannel,
  useUpdateSalesChannel,
} from "@/lib/hooks/useSalesChannels";
import type { SalesChannelSyncSettings } from "@/lib/services/salesChannels";

function relativeTime(iso: string | null, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (!iso) return t("salesChannels.sync.never");
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t("salesChannels.sync.justNow");
  if (minutes < 60) return t("salesChannels.sync.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("salesChannels.sync.hoursAgo", { count: hours });
  return t("salesChannels.sync.daysAgo", { count: Math.floor(hours / 24) });
}

const DEFAULT_SYNC: Required<SalesChannelSyncSettings> = {
  importPaidOnly: "paid",
  onNewOrder: "review",
  pickup: "default",
};

export default function ChannelDetailScreen() {
  return (
    <SalesFeatureGate>
      <ChannelDetailScreenContent />
    </SalesFeatureGate>
  );
}

function ChannelDetailScreenContent() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: channels, isLoading } = useSalesChannels();
  const channel = channels?.find((c) => c.id === id);

  const updateMutation = useUpdateSalesChannel();
  const syncMutation = useSyncSalesChannel();
  const disconnectMutation = useDisconnectSalesChannel();

  const [carrierMode, setCarrierMode] = useState<"manual" | "auto">("manual");
  const [sync, setSync] = useState<Required<SalesChannelSyncSettings>>(DEFAULT_SYNC);

  useEffect(() => {
    if (!channel) return;
    setCarrierMode(channel.carrierMode === "auto" ? "auto" : "manual");
    setSync({
      importPaidOnly: channel.syncSettings?.importPaidOnly ?? "paid",
      onNewOrder: channel.syncSettings?.onNewOrder ?? "review",
      pickup: channel.syncSettings?.pickup ?? "default",
    });
  }, [channel]);

  const handleSaveSettings = async () => {
    if (!channel) return;
    try {
      await updateMutation.mutateAsync({ id: channel.id, data: { carrierMode, syncSettings: sync } });
      Toast.show({ type: "success", text1: t("salesChannels.detail.saveSuccessTitle") });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("salesChannels.detail.saveErrorTitle"),
        text2: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleSync = async () => {
    if (!channel) return;
    try {
      const result = await syncMutation.mutateAsync(channel.id);
      Toast.show({
        type: "success",
        text1: t("salesChannels.detail.syncSuccessTitle"),
        text2:
          result.imported > 0
            ? t("salesChannels.detail.syncImported", { count: result.imported })
            : t("salesChannels.detail.syncNothingNew"),
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("salesChannels.detail.syncErrorTitle"),
        text2: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleDisconnect = () => {
    if (!channel) return;
    Alert.alert(
      t("salesChannels.detail.disconnectConfirmTitle"),
      t("salesChannels.detail.disconnectConfirmMessage", { name: channel.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("salesChannels.detail.disconnect"),
          style: "destructive",
          onPress: async () => {
            try {
              await disconnectMutation.mutateAsync(channel.id);
              router.back();
            } catch (error) {
              Toast.show({
                type: "error",
                text1: t("salesChannels.detail.disconnectErrorTitle"),
                text2: error instanceof Error ? error.message : undefined,
              });
            }
          },
        },
      ],
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (!channel) {
    return (
      <View style={styles.content}>
        <ScreenHeader title={t("salesChannels.detail.notFoundTitle")} />
      </View>
    );
  }

  const meta = platformMeta(channel.platform);

  return (
    <View style={styles.screen}>
      <RefreshableScreen contentContainerStyle={styles.content}>
        <ScreenHeader title={meta.label} subtitle={channel.storeUrl || undefined} />

        <View style={styles.identityRow}>
          <PlatformIcon platform={channel.platform} size={48} />
          <View style={styles.identityInfo}>
            <Text size="medium" weight="bold" numberOfLines={1}>
              {channel.name}
            </Text>
            <View style={[styles.statusBadge, channel.status === "error" && styles.statusBadgeError]}>
              <Text
                size="xs"
                weight="bold"
                style={channel.status === "error" ? styles.statusBadgeErrorText : styles.statusBadgeText}
              >
                {channel.status === "error"
                  ? t("salesChannels.badge.action")
                  : t("salesChannels.detail.connected")}
              </Text>
            </View>
          </View>
        </View>

        <SectionLabel>{t("salesChannels.detail.channelSettingsSection")}</SectionLabel>
        <View style={styles.card}>
          <Text size="xs" weight="semibold" dimRate="55%" textTransform="uppercase" style={styles.sectionLabel}>
            {t("salesChannels.connect.carrierMode")}
          </Text>
          <CarrierModeSelect value={carrierMode} onChange={setCarrierMode} />

          <ChipSelect
            label={t("salesChannels.connect.importOrders")}
            value={sync.importPaidOnly}
            onChange={(v) => setSync((s) => ({ ...s, importPaidOnly: v as "paid" | "all" | "tagged" }))}
            options={[
              { value: "paid", label: t("salesChannels.connect.importOrdersPaid") },
              { value: "all", label: t("salesChannels.connect.importOrdersAll") },
              { value: "tagged", label: t("salesChannels.connect.importOrdersTagged") },
            ]}
          />

          <ChipSelect
            label={t("salesChannels.connect.onNewOrder")}
            value={sync.onNewOrder}
            onChange={(v) => setSync((s) => ({ ...s, onNewOrder: v as "review" | "auto" }))}
            options={[
              { value: "review", label: t("salesChannels.connect.onNewOrderReview") },
              { value: "auto", label: t("salesChannels.connect.onNewOrderAuto") },
            ]}
          />

          <ChipSelect
            label={t("salesChannels.connect.pickupLocation")}
            value={sync.pickup}
            onChange={() => undefined}
            options={[{ value: "default", label: t("salesChannels.connect.pickupLocationDefault") }]}
          />

          <Button
            title={updateMutation.isPending ? t("salesChannels.detail.savingSettings") : t("salesChannels.detail.saveSettings")}
            onPress={handleSaveSettings}
            loading={updateMutation.isPending}
            disabled={updateMutation.isPending}
            style={styles.saveButton}
          />
        </View>

        <SectionLabel>{t("salesChannels.detail.connectionSection")}</SectionLabel>
        <View style={styles.card}>
          <InfoRow label={t("salesChannels.detail.storeUrl")} value={channel.storeUrl || "—"} />
          <InfoRow
            label={t("salesChannels.detail.syncStatus")}
            value={channel.lastSyncedAt ? t("salesChannels.detail.syncActive") : t("salesChannels.detail.syncNotSyncedYet")}
            valueColor={channel.lastSyncedAt ? "#1E9E5A" : undefined}
          />
          <InfoRow
            label={t("salesChannels.detail.lastSync")}
            value={channel.lastSyncedAt ? formatDateTime(channel.lastSyncedAt) : relativeTime(channel.lastSyncedAt, t)}
          />
        </View>

        <Button
          title={syncMutation.isPending ? t("salesChannels.detail.syncing") : t("salesChannels.detail.syncNow")}
          variant="outline"
          onPress={handleSync}
          loading={syncMutation.isPending}
          disabled={syncMutation.isPending}
          style={styles.syncButton}
        />

        <InfoBox text={t("salesChannels.detail.autoSyncNote")} />

        <SectionLabel style={styles.dangerLabel}>{t("salesChannels.detail.dangerZone")}</SectionLabel>
        <Pressable
          style={({ pressed }) => [styles.dangerRow, pressed && styles.dangerRowPressed]}
          onPress={handleDisconnect}
          disabled={disconnectMutation.isPending}
        >
          <View style={styles.dangerIconBox}>
            <Ionicons name="close" size={rs(19)} color={Colors.error} />
          </View>
          <View style={styles.dangerInfo}>
            <Text size="medium" weight="bold" style={styles.dangerTitle}>
              {t("salesChannels.detail.disconnect")}
            </Text>
            <Text size="small" dimRate="55%">
              {t("salesChannels.detail.disconnectSubtitle")}
            </Text>
          </View>
        </Pressable>
      </RefreshableScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(8),
    paddingBottom: rvs(24),
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(14),
    backgroundColor: Colors.white,
    borderRadius: rs(18),
    padding: rs(16),
    marginBottom: rvs(16),
  },
  identityInfo: {
    flex: 1,
    gap: rvs(6),
  },
  statusBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#E7F7EE",
    borderRadius: rs(20),
    paddingHorizontal: rs(10),
    paddingVertical: rvs(4),
  },
  statusBadgeError: {
    backgroundColor: "#FDE8E8",
  },
  statusBadgeText: {
    color: "#1E9E5A",
  },
  statusBadgeErrorText: {
    color: Colors.error,
  },
  sectionLabel: {
    marginBottom: rvs(8),
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    padding: rs(14),
    marginBottom: rvs(16),
  },
  saveButton: {
    marginTop: rvs(4),
  },
  syncButton: {
    marginBottom: rvs(16),
  },
  dangerLabel: {
    marginTop: rvs(16),
    marginBottom: rvs(8),
  },
  dangerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
    paddingVertical: rvs(14),
  },
  dangerRowPressed: {
    opacity: 0.7,
  },
  dangerIconBox: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(11),
    backgroundColor: "#FDE8E8",
    alignItems: "center",
    justifyContent: "center",
  },
  dangerInfo: {
    flex: 1,
  },
  dangerTitle: {
    color: Colors.error,
  },
});
