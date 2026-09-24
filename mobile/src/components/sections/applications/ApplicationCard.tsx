import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { ClientApplication } from "@shared/schema";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import {
  applicationDisplayName,
  applicationInitials,
  applicationLocation,
  applicationStatusColors,
  applicationTimeAgo,
} from "@/components/sections/applications/applicationFormat";

interface ApplicationCardProps {
  application: ClientApplication;
  onPress: () => void;
  /** Divider above the row — the list renders as one grouped card. */
  showDivider?: boolean;
}

export function ApplicationCard({ application, onPress, showDivider }: ApplicationCardProps) {
  const { t } = useTranslation();
  const name = applicationDisplayName(application);
  const isPending = application.status === "pending";
  const statusColors = applicationStatusColors(application.status);

  const meta = [
    applicationLocation(application),
    t(`adminApplicationsScreen.accountType.${application.accountType}`, { defaultValue: application.accountType }),
    t("adminApplicationsScreen.card.applied", { time: applicationTimeAgo(application.createdAt, t) }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {showDivider && <View style={styles.divider} />}
      <View style={styles.content}>
        <View style={[styles.avatar, isPending && styles.avatarPending]}>
          <Text size="small" weight="bold" style={{ color: isPending ? Colors.primary : Colors.textSecondary }}>
            {applicationInitials(name)}
          </Text>
        </View>

        <View style={styles.info}>
          <Text size="medium" weight="bold" numberOfLines={1}>
            {name}
          </Text>
          <Text size="xs" dimRate="65%" style={styles.contactLine}>
            {application.email} · {application.phone}
          </Text>
          <Text size="xs" dimRate="50%" style={styles.metaLine}>
            {meta}
          </Text>
        </View>

        <View style={[styles.badge, { backgroundColor: statusColors.background }]}>
          <Text size="xs" weight="bold" style={{ color: statusColors.text }}>
            {t(`adminApplicationsScreen.status.${application.status}`, { defaultValue: application.status })}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: Colors.white,
  },
  pressed: {
    opacity: 0.7,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  content: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(12),
    padding: rs(14),
  },
  avatar: {
    width: rs(40),
    height: rs(40),
    borderRadius: rs(12),
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPending: {
    backgroundColor: "#FFE9DE",
  },
  info: {
    flex: 1,
  },
  contactLine: {
    marginTop: rvs(4),
  },
  metaLine: {
    marginTop: rvs(3),
  },
  badge: {
    borderRadius: rs(20),
    paddingHorizontal: rs(10),
    paddingVertical: rvs(5),
  },
});
