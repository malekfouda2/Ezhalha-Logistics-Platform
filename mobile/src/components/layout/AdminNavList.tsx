// components/layout/AdminNavList.tsx
//
// The admin section/permission list — rendered inside the slide-in AdminDrawer
// and, full-page, as the "More" tab (app/(protected)/(admin)/(tabs)/more.tsx).
// One implementation so the two surfaces can't drift out of sync.
import { Pressable, StyleSheet, View } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { ADMIN_NAV_SECTIONS, AdminNavItem, hasAdminNavAccess } from "@/constants/adminNavigation";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { useAdminDashboard } from "@/lib/hooks/useAdminDashboard";

interface AdminNavListProps {
  onItemPress: (item: AdminNavItem, allowed: boolean) => void;
}

export function AdminNavList({ onItemPress }: AdminNavListProps) {
  const { t } = useTranslation();
  const { permissions } = useAdminAccess();
  const { pendingApplications, canReadApplications } = useAdminDashboard();

  return (
    <>
      {ADMIN_NAV_SECTIONS.map((section) => (
        <View key={section.titleKey} style={styles.section}>
          <Text size="xs" weight="bold" style={styles.sectionTitle}>
            {t(`admin.nav.sections.${section.titleKey}`).toUpperCase()}
          </Text>

          {section.items.map((item) => {
            const allowed = hasAdminNavAccess(permissions, item);
            const badge =
              item.key === "applications" && canReadApplications
                ? pendingApplications?.length
                : undefined;

            return (
              <Pressable
                key={item.key}
                onPress={() => onItemPress(item, allowed)}
                style={({ pressed }) => [styles.row, pressed && allowed && styles.rowPressed]}
              >
                {item.icon.library === "feather" ? (
                  <Feather
                    name={item.icon.name}
                    size={rs(18)}
                    color={allowed ? Colors.text : Colors.textSecondary}
                  />
                ) : (
                  <Ionicons
                    name={item.icon.name}
                    size={rs(18)}
                    color={allowed ? Colors.text : Colors.textSecondary}
                  />
                )}

                <Text
                  size="small"
                  weight="medium"
                  style={[styles.rowLabel, !allowed && styles.rowLabelDisabled]}
                  numberOfLines={1}
                >
                  {t(`admin.nav.items.${item.labelKey}`)}
                </Text>

                {!allowed ? (
                  <Text size="xs" dimRate="45%">
                    {t("admin.noAccess")}
                  </Text>
                ) : !!badge && badge > 0 ? (
                  <View style={styles.badge}>
                    <Text size="xs" weight="bold" style={styles.badgeText}>
                      {badge}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: rvs(10),
  },
  sectionTitle: {
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    marginTop: rvs(10),
    marginBottom: rvs(4),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
    paddingVertical: rvs(11),
    paddingHorizontal: rs(6),
    borderRadius: rs(10),
  },
  rowPressed: {
    backgroundColor: "#F4F5F7",
  },
  rowLabel: {
    flex: 1,
    color: Colors.text,
  },
  rowLabelDisabled: {
    color: Colors.textSecondary,
  },
  badge: {
    minWidth: rs(20),
    height: rs(20),
    borderRadius: rs(10),
    paddingHorizontal: rs(5),
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: Colors.white,
  },
});
