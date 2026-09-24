// components/layout/AdminTabHeader.tsx
//
// The rich header shared by admin tab screens that want it (Home, More):
// hamburger into the AdminDrawer, title + signed-in admin's name/role, and
// the search/notifications shortcuts. Pass `onBackPress` instead of
// `onMenuPress` to swap the hamburger for a back chevron on pushed screens.
import { I18nManager, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useAdminIdentity } from "@/lib/hooks/useAdminIdentity";
import { useNotifications } from "@/lib/hooks/useNotifications";

interface AdminTabHeaderProps {
  title: string;
  onMenuPress?: () => void;
  onBackPress?: () => void;
}

export function AdminTabHeader({ title, onMenuPress, onBackPress }: AdminTabHeaderProps) {
  const { displayName, roleLabel } = useAdminIdentity();
  const { unreadCount } = useNotifications();
  const isBack = !!onBackPress;

  return (
    <View style={styles.header}>
      <Pressable
        style={[styles.iconButton, { marginStart: 0 }]}
        onPress={isBack ? onBackPress : onMenuPress}
        hitSlop={rs(8)}
      >
        <Ionicons
          name={isBack ? (I18nManager.isRTL ? "chevron-forward" : "chevron-back") : "menu"}
          size={rs(20)}
          color={Colors.text}
        />
      </Pressable>

      <View style={styles.headerText}>
        <Text size="large" weight="bold">
          {title}
        </Text>
        <Text size="xs" dimRate="55%" numberOfLines={1}>
          {displayName} · {roleLabel}
        </Text>
      </View>

      <Pressable
        style={styles.iconButton}
        onPress={() => router.push("/(protected)/(admin)/search")}
        hitSlop={rs(8)}
      >
        <Ionicons name="search" size={rs(19)} color={Colors.text} />
      </Pressable>

      <Pressable
        style={styles.iconButton}
        onPress={() => router.push("/(protected)/(admin)/notifications")}
        hitSlop={rs(8)}
      >
        <Ionicons
          name="notifications-outline"
          size={rs(19)}
          color={Colors.text}
        />
        {unreadCount > 0 && (
          <View style={styles.notificationBadge}>
            <Text size="xs" weight="bold" style={styles.notificationBadgeText}>
              {unreadCount > 9 ? "9+" : unreadCount}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: rvs(18),
  },
  iconButton: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(12),
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    marginStart: rs(8),
  },
  headerText: {
    flex: 1,
    marginStart: rs(12),
  },
  notificationBadge: {
    position: "absolute",
    top: rs(4),
    right: rs(4),
    minWidth: rs(15),
    height: rs(15),
    borderRadius: rs(8),
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: rs(2),
  },
  notificationBadgeText: {
    color: Colors.white,
    fontSize: rs(9),
    lineHeight: rs(11),
  },
});
