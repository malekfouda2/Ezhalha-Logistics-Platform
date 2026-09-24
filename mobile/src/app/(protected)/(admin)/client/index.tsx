// app/(protected)/(admin)/client/index.tsx
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { useAdminClientProfileOptions, useAdminClientsList } from "@/lib/hooks/useAdminClients";
import { ClientCard } from "@/components/sections/clients/ClientCard";
import {
  ClientFiltersModal,
  ClientFilters,
  EMPTY_CLIENT_FILTERS,
  countActiveClientFilters,
} from "@/components/sections/clients/ClientFiltersModal";
import { CreateClientSheet } from "@/components/sections/clients/CreateClientSheet";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

const REQUIRED_PERMISSION = "clients:read";

export default function AdminClientsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const [filtersModalVisible, setFiltersModalVisible] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [filters, setFilters] = useState<ClientFilters>(EMPTY_CLIENT_FILTERS);

  const { hasPermission } = useAdminAccess();
  const { roleLabel } = useAdminIdentity();
  const canRead = hasPermission("clients", "read");
  const canCreate = hasPermission("clients", "create");
  const title = t("adminClientsScreen.title");

  const { data: profileOptions } = useAdminClientProfileOptions();
  const profileLabelByValue = useMemo(
    () => new Map((profileOptions ?? []).map((option) => [option.profile, option.displayName])),
    [profileOptions],
  );

  const { clients, total, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } = useAdminClientsList({
    search: debouncedSearch || undefined,
    profile: filters.profile ?? undefined,
    status: filters.status === "all" ? undefined : filters.status,
    accountManagerUserId: filters.accountManagerUserId ?? undefined,
  });

  const visibleClients = useMemo(
    () => (filters.salesFeaturesEnabled ? clients.filter((c) => c.salesFeaturesEnabled) : clients),
    [clients, filters.salesFeaturesEnabled],
  );

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  const activeFilterCount = countActiveClientFilters(filters);

  const quickTabs = useMemo(() => {
    const base: { key: string; label: string; status?: "active" | "inactive"; profile?: string }[] = [
      { key: "all", label: t("adminClientsScreen.filters.all") },
      { key: "active", label: t("adminClientsScreen.status.active"), status: "active" },
      { key: "inactive", label: t("adminClientsScreen.status.inactive"), status: "inactive" },
    ];
    (profileOptions ?? []).forEach((option) => {
      base.push({ key: `profile:${option.profile}`, label: option.displayName, profile: option.profile });
    });
    return base;
  }, [profileOptions, t]);

  const activeTabKey = filters.profile
    ? `profile:${filters.profile}`
    : filters.status !== "all"
      ? filters.status
      : "all";

  const selectTab = (tab: (typeof quickTabs)[number]) => {
    setFilters((prev) => ({
      ...prev,
      status: tab.status ?? "all",
      profile: tab.profile ?? null,
    }));
  };

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
          subtitle={t("adminClientsScreen.subtitle", { count: total })}
          onMenuPress={() => setDrawerVisible(true)}
        />
      </View>

      <View style={styles.searchArea}>
        <View style={styles.searchRow}>
          <View style={styles.searchInputContainer}>
            <Input
              placeholder={t("adminClientsScreen.searchPlaceholder")}
              value={search}
              onChangeText={setSearch}
              leftElement={<Ionicons name="search" size={rs(18)} color={Colors.placeholder} />}
              style={styles.searchInput}
            />
          </View>

          <Pressable
            onPress={() => setFiltersModalVisible(true)}
            style={[styles.filterButton, activeFilterCount > 0 && styles.filterButtonActive]}
          >
            <Ionicons name="options-outline" size={rs(20)} color={activeFilterCount > 0 ? Colors.white : Colors.text} />
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text size="xs" weight="bold" style={styles.filterBadgeText}>
                  {activeFilterCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          {quickTabs.map((tab) => {
            const active = tab.key === activeTabKey;
            return (
              <Pressable key={tab.key} onPress={() => selectTab(tab)} style={[styles.tabChip, active && styles.tabChipActive]}>
                <Text size="small" weight="semibold" style={{ color: active ? Colors.white : Colors.text }}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={visibleClients}
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
              <Feather name="users" size={rs(32)} color={Colors.placeholder} />
              <Text size="medium" weight="bold" style={styles.emptyTitle}>
                {t("adminClientsScreen.empty.title")}
              </Text>
              <Text size="small" dimRate="60%" style={styles.emptyDescription}>
                {t("adminClientsScreen.empty.description")}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <ClientCard
            client={item}
            profileLabel={profileLabelByValue.get(item.profile)}
            onPress={() => router.push(`/(protected)/(admin)/client/${item.id}`)}
          />
        )}
      />

      {canCreate && (
        <Pressable
          style={({ pressed }) => [styles.fab, { bottom: insets.bottom + rvs(20) }, pressed && styles.fabPressed]}
          onPress={() => setCreateVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={t("adminClientsScreen.create.title")}
        >
          <Ionicons name="add" size={rs(28)} color={Colors.white} />
        </Pressable>
      )}

      <ClientFiltersModal
        visible={filtersModalVisible}
        initialFilters={filters}
        matchCount={visibleClients.length}
        onClose={() => setFiltersModalVisible(false)}
        onApply={setFilters}
      />

      <CreateClientSheet visible={createVisible} onClose={() => setCreateVisible(false)} />

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
  },
  fab: {
    position: "absolute",
    end: rs(20),
    width: rs(56),
    height: rs(56),
    borderRadius: rs(28),
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: rvs(6) },
    shadowOpacity: 0.35,
    shadowRadius: rs(10),
    elevation: 6,
  },
  fabPressed: {
    opacity: 0.85,
  },
  searchArea: {
    paddingHorizontal: rs(16),
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(10),
    marginBottom: rvs(12),
  },
  searchInputContainer: {
    flex: 1,
  },
  searchInput: {
    height: rvs(48),
  },
  filterButton: {
    width: rs(48),
    height: rvs(48),
    borderRadius: rs(12),
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: rvs(15),
  },
  filterButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterBadge: {
    position: "absolute",
    top: -rvs(4),
    right: -rs(4),
    minWidth: rs(16),
    height: rs(16),
    borderRadius: rs(8),
    backgroundColor: Colors.error,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: rs(3),
    borderWidth: 1.5,
    borderColor: Colors.white,
  },
  filterBadgeText: {
    color: Colors.white,
    fontSize: rs(10),
    lineHeight: rs(12),
  },
  tabsRow: {
    gap: rs(8),
    paddingBottom: rvs(10),
  },
  tabChip: {
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
  listContent: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(4),
    // Room for the floating create button over the last card.
    paddingBottom: rvs(120),
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
