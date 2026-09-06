import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

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
  onSettingsPress: () => void;
}

export function ChannelListItem({ channel, onSettingsPress }: ChannelListItemProps) {
  const { t } = useTranslation();
  const meta = platformMeta(channel.platform);
  const needsReauth = channel.status === "error";

  return (
    <Pressable
      onPress={onSettingsPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      testID={`channel-row-${channel.id}`}
    >
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    padding: rs(14),
    marginBottom: rvs(12),
  },
  cardPressed: {
    opacity: 0.7,
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
});
