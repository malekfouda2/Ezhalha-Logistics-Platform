import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import type { AdminClientListItem } from "@/lib/services/adminClients";
import { humanizeProfileSlug, profileBadgeColors } from "@/components/sections/clients/profileBadge";

function initialsFor(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}

function formatJoined(dateString: string | Date, locale: string) {
  try {
    return new Date(dateString).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

interface ClientCardProps {
  client: AdminClientListItem;
  onPress: () => void;
  /** Resolved from `/api/admin/client-profile-options`; falls back to a humanized slug. */
  profileLabel?: string;
}

export function ClientCard({ client, onPress, profileLabel }: ClientCardProps) {
  const { t, i18n } = useTranslation();
  const profileColors = profileBadgeColors(client.profile);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.topRow}>
        <View style={styles.avatar}>
          <Text size="medium" weight="bold" style={styles.avatarText}>
            {initialsFor(client.name)}
          </Text>
        </View>

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text size="medium" weight="bold" numberOfLines={1} style={styles.nameText}>
              {client.companyName || client.name}
            </Text>
            <View style={styles.accountBadge}>
              <Text size="xs" weight="bold" style={styles.accountBadgeText}>
                {client.accountNumber}
              </Text>
            </View>
          </View>

          <Text size="xs" dimRate="60%" numberOfLines={1} style={styles.contactLine}>
            {client.email} · {client.phone}
          </Text>

          <Text size="xs" dimRate="55%" numberOfLines={1} style={styles.metaLine}>
            {client.assignedAccountManager
              ? t("adminClientsScreen.card.manager", { name: client.assignedAccountManager.username })
              : t("adminClientsScreen.card.unassigned")}
            {" · "}
            {t("adminClientsScreen.card.joined", { date: formatJoined(client.createdAt, i18n.language) })}
          </Text>
        </View>

        <View style={styles.badges}>
          <View style={[styles.badge, { backgroundColor: profileColors.background }]}>
            <Text size="xs" weight="bold" style={{ color: profileColors.text }}>
              {profileLabel ?? humanizeProfileSlug(client.profile)}
            </Text>
          </View>
          <View
            style={[
              styles.badge,
              { backgroundColor: client.isActive ? "#E4F7EA" : "#F1F2F4" },
            ]}
          >
            <Text size="xs" weight="bold" style={{ color: client.isActive ? "#1E9E4B" : Colors.textSecondary }}>
              {t(client.isActive ? "adminClientsScreen.status.active" : "adminClientsScreen.status.inactive")}
            </Text>
          </View>
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
  pressed: {
    opacity: 0.7,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(12),
  },
  avatar: {
    width: rs(44),
    height: rs(44),
    borderRadius: rs(14),
    backgroundColor: "#FDE0CE",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: Colors.primary,
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(8),
  },
  nameText: {
    flexShrink: 1,
  },
  accountBadge: {
    backgroundColor: Colors.background,
    borderRadius: rs(8),
    paddingHorizontal: rs(8),
    paddingVertical: rvs(3),
  },
  accountBadgeText: {
    color: Colors.textSecondary,
  },
  contactLine: {
    marginTop: rvs(4),
  },
  metaLine: {
    marginTop: rvs(4),
  },
  badges: {
    alignItems: "flex-end",
    gap: rvs(8),
  },
  badge: {
    borderRadius: rs(20),
    paddingHorizontal: rs(10),
    paddingVertical: rvs(5),
  },
});
