// components/layout/AdminDrawer.tsx
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs, screenWidth } from "@/utils/responsive";
import { AdminNavItem } from "@/constants/adminNavigation";
import { AdminNavList } from "@/components/layout/AdminNavList";
import { useAdminIdentity } from "@/lib/hooks/useAdminIdentity";
import { useAdminNavAction } from "@/lib/hooks/useAdminNavAction";
import { useLogout } from "@/lib/hooks/useLogout";

const DRAWER_WIDTH = Math.min(screenWidth * 0.82, rs(340));

interface AdminDrawerProps {
  visible: boolean;
  onClose: () => void;
}

export function AdminDrawer({ visible, onClose }: AdminDrawerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { displayName, initials, roleLabel, permissionsLabel } = useAdminIdentity();
  const navAction = useAdminNavAction();
  const { logout } = useLogout();

  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  // The native <Modal> unmounts the instant `visible` goes false, which would cut off
  // the slide-out short — so it stays mounted until the close animation finishes.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
    }

    Animated.parallel([
      Animated.timing(translateX, {
        toValue: visible ? 0 : -DRAWER_WIDTH,
        duration: 240,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: visible ? 1 : 0,
        duration: 240,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished && !visible) {
        setMounted(false);
      }
    });
  }, [visible, translateX, backdropOpacity]);

  const handleItemPress = (item: AdminNavItem, allowed: boolean) => {
    if (!allowed) return;
    onClose();
    navAction(item, allowed);
  };

  const handleSignOut = () => {
    onClose();
    logout();
  };

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.drawer,
            {
              width: DRAWER_WIDTH,
              paddingTop: insets.top + rvs(20),
              paddingBottom: Math.max(insets.bottom, rvs(16)),
              transform: [{ translateX }],
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.avatar}>
              <Text size="medium" weight="bold" style={styles.avatarText}>
                {initials}
              </Text>
            </View>
            <View style={styles.headerText}>
              <Text size="medium" weight="bold" numberOfLines={1}>
                {displayName}
              </Text>
              <Text size="xs" dimRate="60%" numberOfLines={1}>
                {roleLabel}
                {permissionsLabel ? ` · ${permissionsLabel}` : ""}
              </Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
            <AdminNavList onItemPress={handleItemPress} />
          </ScrollView>

          <Pressable
            onPress={handleSignOut}
            style={({ pressed }) => [styles.signOutRow, pressed && styles.rowPressed]}
          >
            <Feather name="log-out" size={rs(18)} color={Colors.error} />
            <Text size="small" weight="bold" style={styles.signOutLabel}>
              {t("admin.signOut")}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 17, 26, 0.5)",
  },
  drawer: {
    height: "100%",
    // The nav drawer is white, unlike the dark drawer on web — set explicitly
    // per the mobile design.
    backgroundColor: Colors.white,
    paddingHorizontal: rs(18),
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: rvs(16),
    marginBottom: rvs(8),
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  avatar: {
    width: rs(44),
    height: rs(44),
    borderRadius: rs(14),
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: Colors.white,
  },
  headerText: {
    flex: 1,
    marginStart: rs(12),
  },
  scroll: {
    flex: 1,
  },
  rowPressed: {
    backgroundColor: "#F4F5F7",
  },
  signOutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
    paddingVertical: rvs(13),
    paddingHorizontal: rs(6),
    marginTop: rvs(6),
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  signOutLabel: {
    color: Colors.error,
  },
});
