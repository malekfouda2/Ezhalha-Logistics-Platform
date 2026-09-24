// app/(protected)/(admin)/applications/index.tsx
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { AdminTabHeader } from "@/components/layout/AdminTabHeader";
import { AdminNoAccess } from "@/components/layout/AdminNoAccess";
import { AdminDrawer } from "@/components/layout/AdminDrawer";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { useAdminIdentity } from "@/lib/hooks/useAdminIdentity";
import { useAdminApplicationCounts, useAdminApplicationsList } from "@/lib/hooks/useAdminApplications";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { ApplicationCard } from "@/components/sections/applications/ApplicationCard";
import type { ApplicationStatus } from "@/lib/services/adminApplications";

const REQUIRED_PERMISSION = "applications:read";

type TabKey = "all" | ApplicationStatus;

export default function AdminApplicationsScreen() {
  const { t } = useTranslation();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  // Pending first — it's the queue someone opening this screen came to work through.
  const [activeTab, setActiveTab] = useState<TabKey>("pending");

  const { hasPermission } = useAdminAccess();
  const { roleLabel } = useAdminIdentity();
  const canRead = hasPermission("applications", "read");
  const title = t("adminApplicationsScreen.title");

  const counts = useAdminApplicationCounts();
  const { applications, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    useAdminApplicationsList({
      search: debouncedSearch || undefined,
      status: activeTab === "all" ? undefined : activeTab,
    });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetch(), counts.refetch()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "all", label: t("adminApplicationsScreen.tabs.all"), count: counts.all },
    { key: "pending", label: t("adminApplicationsScreen.status.pending"), count: counts.pending },
    { key: "approved", label: t("adminApplicationsScreen.status.approved"), count: counts.approved },
    { key: "rejected", label: t("adminApplicationsScreen.status.rejected"), count: counts.rejected },
  ];

  if (!canRead) {
    return (
      <View style={styles.container}>
        <View style={styles.headerArea}>
          <AdminTabHeader title={title} subtitle={REQUIRED_PERMISSION} onMenuPress={() => setDrawerVisible(true)} />
        </View>
        <AdminNoAccess screenTitle={title} permission={REQUIRED_PERMISSION} roleName={roleLabel} />
        <AdminDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerArea}>
        <AdminTabHeader
          title={title}
          subtitle={
            counts.pending !== undefined && counts.all !== undefined
              ? t("adminApplicationsScreen.subtitle", { pending: counts.pending, total: counts.all })
              : " "
          }
          onMenuPress={() => setDrawerVisible(true)}
        />

        <Input
          placeholder={t("adminApplicationsScreen.searchPlaceholder")}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          leftElement={<Ionicons name="search" size={rs(18)} color={Colors.placeholder} />}
          style={styles.searchInput}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScrollView}
        contentContainerStyle={styles.tabsRow}
      >
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[styles.tabChip, active && styles.tabChipActive]}
            >
              <Text size="small" weight="semibold" style={{ color: active ? Colors.white : Colors.text }}>
                {tab.label}
              </Text>
              {tab.count !== undefined && (
                <View style={[styles.tabCount, active && styles.tabCountActive]}>
                  <Text size="xs" weight="bold" style={{ color: active ? Colors.white : Colors.textSecondary }}>
                    {tab.count}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={applications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footerLoading}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Feather name="file-text" size={rs(32)} color={Colors.placeholder} />
              <Text size="medium" weight="bold" style={styles.emptyTitle}>
                {t("adminApplicationsScreen.empty.title")}
              </Text>
              <Text size="small" dimRate="60%" style={styles.emptyDescription}>
                {t("adminApplicationsScreen.empty.description")}
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <View
            style={[
              styles.groupItem,
              index === 0 && styles.groupFirst,
              index === applications.length - 1 && styles.groupLast,
            ]}
          >
            <ApplicationCard
              application={item}
              showDivider={index > 0}
              onPress={() => router.push(`/(protected)/(admin)/applications/${item.id}`)}
            />
          </View>
        )}
      />

      <AdminDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerArea: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(16),
  },
  searchInput: {
    height: rvs(48),
  },
  tabsScrollView: {
    flexGrow: 0,
    flexShrink: 0,
  },
  tabsRow: {
    gap: rs(8),
    paddingHorizontal: rs(16),
    paddingBottom: rvs(12),
  },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(6),
    paddingHorizontal: rs(14),
    paddingVertical: rvs(8),
    borderRadius: rs(18),
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tabCount: {
    minWidth: rs(22),
    paddingHorizontal: rs(6),
    paddingVertical: rvs(1),
    borderRadius: rs(10),
    backgroundColor: Colors.background,
    alignItems: "center",
  },
  tabCountActive: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  listContent: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(4),
    paddingBottom: rvs(24),
  },
  groupItem: {
    overflow: "hidden",
  },
  groupFirst: {
    borderTopLeftRadius: rs(16),
    borderTopRightRadius: rs(16),
  },
  groupLast: {
    borderBottomLeftRadius: rs(16),
    borderBottomRightRadius: rs(16),
  },
  loadingState: {
    paddingTop: rvs(60),
    alignItems: "center",
    justifyContent: "center",
  },
  footerLoading: {
    paddingVertical: rvs(16),
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: rvs(60),
    paddingHorizontal: rs(30),
  },
  emptyTitle: {
    marginTop: rvs(10),
  },
  emptyDescription: {
    marginTop: rvs(6),
    textAlign: "center",
    maxWidth: rs(280),
    lineHeight: rvs(18),
  },
});
