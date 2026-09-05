import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Feather, Ionicons } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { PlatformIcon } from "@/components/sections/salesChannels/PlatformIcon";
import { platformMeta } from "@/constants/platforms";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import type { SalesChannel } from "@/lib/services/salesChannels";

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

interface ChannelListItemProps {
  channel: SalesChannel;
  onOrdersPress: () => void;
  onSettingsPress: () => void;
}

export function ChannelListItem({ channel, onOrdersPress, onSettingsPress }: ChannelListItemProps) {
  const { t } = useTranslation();
  const meta = platformMeta(channel.platform);
  const needsReauth = channel.status === "error";

  return (
    <View style={styles.card} testID={`channel-row-${channel.id}`}>
      <View style={styles.row}>
        <PlatformIcon platform={channel.platform} />

        <View style={styles.info}>
          <Text size="medium" weight="bold" numberOfLines={1}>
            {meta.label}
          </Text>
          <Text size="small" dimRate="55%" numberOfLines={1} style={styles.subtitle}>
            {needsReauth
              ? t("salesChannels.reauthNeeded")
              : `${channel.storeUrl || meta.label} · ${t("salesChannels.sync.synced", { time: relativeTime(channel.lastSyncedAt, t) })}`}
          </Text>
        </View>

        <View style={[styles.badge, needsReauth ? styles.badgeAction : styles.badgeLive]}>
          <Text size="xs" weight="bold" style={needsReauth ? styles.badgeActionText : styles.badgeLiveText}>
            {needsReauth ? t("salesChannels.badge.action") : t("salesChannels.badge.live")}
          </Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          onPress={onOrdersPress}
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
        >
          <Feather name="package" size={rs(14)} color={Colors.text} />
          <Text size="small" weight="bold" style={styles.actionButtonLabel}>
            {t("salesChannels.card.orders")}
          </Text>
        </Pressable>

        <Pressable
          onPress={onSettingsPress}
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
        >
          <Ionicons name="settings-outline" size={rs(15)} color={Colors.text} />
          <Text size="small" weight="bold" style={styles.actionButtonLabel}>
            {t("salesChannels.card.settings")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    padding: rs(14),
    marginBottom: rvs(12),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
  },
  info: {
    flex: 1,
  },
  subtitle: {
    marginTop: rvs(2),
  },
  badge: {
    paddingHorizontal: rs(12),
    paddingVertical: rvs(6),
    borderRadius: rs(20),
  },
  badgeLive: {
    backgroundColor: "#E7F7EE",
  },
  badgeLiveText: {
    color: "#1E9E5A",
  },
  badgeAction: {
    backgroundColor: "#FDE8E8",
  },
  badgeActionText: {
    color: Colors.error,
  },
  actionsRow: {
    flexDirection: "row",
    gap: rs(10),
    marginTop: rvs(14),
    paddingTop: rvs(14),
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(6),
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: rs(12),
    paddingVertical: rvs(10),
  },
  actionButtonPressed: {
    opacity: 0.6,
  },
  actionButtonLabel: {
    color: Colors.text,
  },
});
