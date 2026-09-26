// app/(protected)/(admin)/(tabs)/more.tsx
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { RefreshableScreen } from "@/components/ui/RefreshableScreen";
import { SectionLabel, InfoCard } from "@/components/ui/InfoCard";
import { SettingsRow } from "@/components/sections/profile/SettingsRow";
import { AdminTabHeader } from "@/components/layout/AdminTabHeader";
import { AdminDrawer } from "@/components/layout/AdminDrawer";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { ADMIN_NAV_SECTIONS, AdminNavItem, hasAdminNavAccess } from "@/constants/adminNavigation";
import { useAdminIdentity } from "@/lib/hooks/useAdminIdentity";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { useAdminDashboard } from "@/lib/hooks/useAdminDashboard";
import { useAdminMoreSummary } from "@/lib/hooks/useAdminMoreSummary";
import { useAdminNavAction } from "@/lib/hooks/useAdminNavAction";
import { useOperationsSummary } from "@/lib/hooks/useAdminOperations";
import { useLogout } from "@/lib/hooks/useLogout";
import { useLanguageStore } from "@/store/useLanguageStore";

function NavIcon({ item, color }: { item: AdminNavItem; color: string }) {
  return item.icon.library === "feather" ? (
    <Feather name={item.icon.name} size={rs(19)} color={color} />
  ) : (
    <Ionicons name={item.icon.name} size={rs(19)} color={color} />
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <View style={styles.badge}>
      <Text size="xs" weight="bold" style={styles.badgeText}>
        {count}
      </Text>
    </View>
  );
}

export default function AdminMoreScreen() {
  const { t } = useTranslation();
  const [drawerVisible, setDrawerVisible] = useState(false);

  const { displayName, initials, email } = useAdminIdentity();
  const { permissions } = useAdminAccess();
  const { stats, pendingApplications } = useAdminDashboard();
  const {
    accountManagersCount,
    staffCount,
    pendingInvitesCount,
    rolesCount,
    permissionsCatalogCount,
    hasAllPermissions,
    myTasksCount,
  } = useAdminMoreSummary();
  const { data: operationsSummary } = useOperationsSummary();
  const navAction = useAdminNavAction();
  const { logout } = useLogout();
  const language = useLanguageStore((state) => state.language);

  const permissionsPillText = hasAllPermissions
    ? t("admin.more.allPermissions", { count: permissions.length })
    : t("admin.permissionsCount", { count: permissions.length });

  const applicationsCount = pendingApplications?.length;

  function getSubtitle(item: AdminNavItem): string | undefined {
    switch (item.key) {
      case "clients":
        return stats?.totalClients !== undefined
          ? t("admin.more.clients.subtitle", { count: stats.totalClients })
          : undefined;
      case "applications":
        return applicationsCount !== undefined
          ? t("admin.more.applications.subtitle", { count: applicationsCount })
          : undefined;
      case "account-managers":
        return accountManagersCount !== undefined
          ? t("admin.more.accountManagers.subtitle", { count: accountManagersCount })
          : undefined;
      case "users":
        return staffCount !== undefined && pendingInvitesCount !== undefined
          ? t("admin.more.users.subtitle", { staff: staffCount, invites: pendingInvitesCount })
          : undefined;
      case "access-control":
        return rolesCount !== undefined && permissionsCatalogCount !== undefined
          ? t("admin.more.accessControl.subtitle", { roles: rolesCount, permissions: permissionsCatalogCount })
          : undefined;
      case "operations":
        return operationsSummary
          ? t("adminOperations.hub.subtitle", {
              open: operationsSummary.expressCount + operationsSummary.ddpCount + operationsSummary.localCount,
              attention: operationsSummary.attentionCount,
            })
          : undefined;
      case "tasks":
        return myTasksCount !== undefined
          ? t("admin.more.tasks.subtitle", { count: myTasksCount })
          : undefined;
      default:
        return undefined;
    }
  }

  function getBadge(item: AdminNavItem): number | undefined {
    if (item.key === "applications") return applicationsCount;
    if (item.key === "tasks") return myTasksCount;
    return undefined;
  }

  return (
    <View style={styles.container}>
      <RefreshableScreen contentContainerStyle={styles.content}>
        <AdminTabHeader title={t("admin.more.title")} onMenuPress={() => setDrawerVisible(true)} />

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text size="large" weight="bold" style={styles.avatarText}>
              {initials}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text size="large" weight="bold" numberOfLines={1}>
              {displayName}
            </Text>
            {email ? (
              <Text size="small" dimRate="60%" numberOfLines={1} style={styles.email}>
                {email}
              </Text>
            ) : null}
            <View style={styles.permissionsPill}>
              <Text size="xs" weight="semibold" style={styles.permissionsPillText}>
                {permissionsPillText}
              </Text>
            </View>
          </View>
        </View>

        {ADMIN_NAV_SECTIONS.map((section) => {
          const items = section.items.filter((item) => hasAdminNavAccess(permissions, item));
          if (items.length === 0) return null;

          return (
            <View key={section.titleKey}>
              <SectionLabel style={styles.sectionSpacing}>
                {t(`admin.nav.sections.${section.titleKey}`)}
              </SectionLabel>
              <InfoCard>
                {items.map((item) => {
                  const badge = getBadge(item);
                  return (
                    <SettingsRow
                      key={item.key}
                      iconNode={<NavIcon item={item} color={Colors.primary} />}
                      title={t(`admin.nav.items.${item.labelKey}`)}
                      subtitle={getSubtitle(item)}
                      onPress={() => navAction(item, true)}
                      right={badge && badge > 0 ? <CountBadge count={badge} /> : undefined}
                    />
                  );
                })}
              </InfoCard>
            </View>
          );
        })}

        <SectionLabel style={styles.sectionSpacing}>{t("profile.sections.security")}</SectionLabel>
        <InfoCard>
          <SettingsRow
            icon="lock-closed-outline"
            title={t("profile.rows.changePassword.title")}
            subtitle={t("profile.rows.changePassword.subtitle")}
            onPress={() => router.push("/(protected)/(admin)/change-password")}
          />
        </InfoCard>

        <SectionLabel style={styles.sectionSpacing}>{t("profile.sections.preferences")}</SectionLabel>
        <InfoCard>
          <SettingsRow
            icon="language-outline"
            title={t("profile.rows.language.title")}
            subtitle={language === "en" ? "English" : "العربية"}
            onPress={() => router.push("/(protected)/(admin)/language")}
          />
        </InfoCard>

        <InfoCard>
          <SettingsRow
            icon="log-out-outline"
            title={t("admin.signOut")}
            danger
            showChevron={false}
            onPress={logout}
          />
        </InfoCard>
      </RefreshableScreen>

      <AdminDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: rs(16),
    paddingBottom: rvs(32),
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    padding: rs(16),
    marginBottom: rvs(20),
  },
  avatar: {
    width: rs(56),
    height: rs(56),
    borderRadius: rs(18),
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: Colors.white,
  },
  profileInfo: {
    flex: 1,
    marginStart: rs(14),
  },
  email: {
    marginTop: rvs(2),
  },
  permissionsPill: {
    alignSelf: "flex-start",
    backgroundColor: Colors.background,
    borderRadius: rs(8),
    paddingHorizontal: rs(10),
    paddingVertical: rvs(4),
    marginTop: rvs(8),
  },
  permissionsPillText: {
    color: Colors.textSecondary,
  },
  sectionSpacing: {
    marginTop: rvs(4),
  },
  badge: {
    minWidth: rs(24),
    height: rs(24),
    borderRadius: rs(12),
    paddingHorizontal: rs(6),
    backgroundColor: "#FDECC8",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#9A7410",
  },
});
