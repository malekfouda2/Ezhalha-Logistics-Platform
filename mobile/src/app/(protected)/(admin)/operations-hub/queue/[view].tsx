// app/(protected)/(admin)/operations-hub/queue/[view].tsx
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import InfoBox from "@/components/ui/InfoBox";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { AdminTabHeader } from "@/components/layout/AdminTabHeader";
import { AdminNoAccess } from "@/components/layout/AdminNoAccess";
import { FilterTabs, type FilterTab } from "@/components/sections/operationsHub/OpsPrimitives";
import { OpsShipmentCard } from "@/components/sections/operationsHub/OpsShipmentCard";
import { OpsFilterBar } from "@/components/sections/operationsHub/OpsFilterBar";
import {
  applyQueueFilters,
  attentionTabs,
  isOperationQueue,
  QUEUE_FILTERS,
  queueTabs,
  type QueueFilters,
} from "@/components/sections/operationsHub/opsFormat";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { useAdminIdentity } from "@/lib/hooks/useAdminIdentity";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useOperationsQueue } from "@/lib/hooks/useAdminOperations";
import type { OperationSort } from "@/lib/services/adminOperations";

const REQUIRED_PERMISSION = "operations:read";
const SORTS: OperationSort[] = ["queue", "newest", "updated", "stale", "amount_desc", "amount_asc"];

export default function AdminOperationsQueueScreen() {
  const { t } = useTranslation();
  const { view } = useLocalSearchParams<{ view: string }>();
  const queue = isOperationQueue(view) ? view : "express";

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [sort, setSort] = useState<OperationSort>("queue");
  const [sortVisible, setSortVisible] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [filters, setFilters] = useState<QueueFilters>({});
  const filterKeys = QUEUE_FILTERS[queue] ?? [];

  const { hasPermission } = useAdminAccess();
  const { roleLabel } = useAdminIdentity();
  const canRead = hasPermission("operations", "read");
  const title = t(`adminOperations.queues.${queue}.title`);

  const { data, isLoading, refetch } = useOperationsQueue({
    queue,
    search: debouncedSearch.trim() || undefined,
    sort,
  });
  const allRows = data ?? [];
  // Dropdown filters narrow the whole queue; the tabs (and their counts) then split what is left.
  const rows = useMemo(() => applyQueueFilters(allRows, filters), [allRows, filters]);

  const tabDefs = useMemo(
    () =>
      queue === "attention"
        ? attentionTabs(rows, t)
        : queueTabs(queue).map((tab) => ({ ...tab, label: t(tab.labelKey) })),
    [queue, rows, t],
  );

  const tabs: FilterTab<string>[] = [
    { key: "all", label: t("adminOperations.tabs.all"), count: data ? rows.length : undefined },
    ...tabDefs.map((tab) => ({ key: tab.key, label: tab.label, count: data ? rows.filter(tab.match).length : undefined })),
  ];

  const activeDef = tabDefs.find((tab) => tab.key === activeTab);
  const visible = activeDef ? rows.filter(activeDef.match) : rows;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  const scanButton = (
    <Pressable
      style={styles.iconButton}
      onPress={() => router.push("/(protected)/(admin)/operations-hub/scan")}
      hitSlop={rs(8)}
    >
      <Ionicons name="scan-outline" size={rs(19)} color={Colors.text} />
    </Pressable>
  );

  if (!canRead) {
    return (
      <View style={styles.container}>
        <View style={styles.headerArea}>
          <AdminTabHeader title={title} subtitle={REQUIRED_PERMISSION} onBackPress={() => router.back()} />
        </View>
        <AdminNoAccess screenTitle={title} permission={REQUIRED_PERMISSION} roleName={roleLabel} />
      </View>
    );
  }

  const footerNote =
    queue === "ddp"
      ? { text: t("adminOperations.notes.ddp"), tone: "amber" as const }
      : queue === "attention"
        ? { text: t("adminOperations.notes.attention"), tone: "red" as const }
        : queue === "dangerous_goods"
          ? { text: t("adminOperations.notes.dangerousGoods"), tone: "amber" as const }
          : undefined;

  return (
    <View style={styles.container}>
      <View style={styles.headerArea}>
        <AdminTabHeader
          title={title}
          subtitle={data ? t("adminOperations.queue.subtitle", { count: rows.length }) : " "}
          onBackPress={() => router.back()}
          actions={queue === "express" ? scanButton : undefined}
          hideShortcuts={queue === "express"}
        />

        <View style={styles.searchRow}>
          <View style={styles.searchInput}>
            <Input
              placeholder={t("adminOperations.queue.searchPlaceholder")}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              leftElement={<Ionicons name="search" size={rs(18)} color={Colors.placeholder} />}
              style={styles.searchField}
            />
          </View>
          <Pressable style={styles.sortButton} onPress={() => setSortVisible(true)} hitSlop={rs(4)}>
            <Feather name="filter" size={rs(18)} color={sort === "queue" ? Colors.text : Colors.primary} />
          </Pressable>
        </View>
        <Text size="xs" dimRate="55%" style={styles.sortCaption}>
          {t(`adminOperations.sort.${sort}`)}
        </Text>
      </View>

      <FilterTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      {filterKeys.length > 0 ? (
        <OpsFilterBar keys={filterKeys} rows={allRows} filters={filters} onChange={setFilters} />
      ) : null}

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Feather name="inbox" size={rs(32)} color={Colors.placeholder} />
              <Text size="medium" weight="bold" style={styles.emptyTitle}>
                {t("adminOperations.queue.emptyTitle")}
              </Text>
              <Text size="small" dimRate="60%" style={styles.emptyDescription}>
                {t("adminOperations.queue.emptyDescription")}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          footerNote && visible.length > 0 ? (
            <View style={styles.footerNote}>
              {footerNote.tone === "red" ? (
                <InfoBox
                  text={footerNote.text}
                  iconName="alert-triangle"
                  backgroundColor="#FEF2F2"
                  borderColor="#FBD5D5"
                  textColor="#B91C1C"
                  iconColor="#B91C1C"
                />
              ) : (
                <InfoBox
                  text={footerNote.text}
                  iconName="alert-triangle"
                  backgroundColor={Colors.amberBackgroundColor}
                  borderColor={Colors.amberBorderColor}
                  textColor={Colors.amberTextColor}
                  iconColor={Colors.amberTextColor}
                />
              )}
            </View>
          ) : null
        }
        renderItem={({ item, index }) => (
          <View
            style={[
              styles.groupItem,
              index === 0 && styles.groupFirst,
              index === visible.length - 1 && styles.groupLast,
            ]}
          >
            <OpsShipmentCard
              shipment={item}
              queue={queue}
              showDivider={index > 0}
              highlight={index === 0}
              onPress={() => router.push(`/(protected)/(admin)/operations-hub/shipment/${item.id}`)}
            />
          </View>
        )}
      />

      <BottomSheet visible={sortVisible} onClose={() => setSortVisible(false)}>
        <Text size="large" weight="bold" style={styles.sortTitle}>
          {t("adminOperations.sort.title")}
        </Text>
        <View style={styles.sortCard}>
          {SORTS.map((option, index) => {
            const selected = option === sort;
            return (
              <Pressable
                key={option}
                onPress={() => {
                  setSort(option);
                  setSortVisible(false);
                }}
                style={[styles.sortRow, index > 0 && styles.sortRowDivider]}
              >
                <Text size="medium" weight={selected ? "bold" : "regular"} style={selected ? { color: Colors.primary } : undefined}>
                  {t(`adminOperations.sort.${option}`)}
                </Text>
                {selected ? <Ionicons name="checkmark" size={rs(18)} color={Colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
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
  iconButton: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(12),
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    marginStart: rs(8),
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(10),
  },
  searchInput: {
    flex: 1,
  },
  searchField: {
    height: rvs(48),
  },
  sortButton: {
    width: rvs(48),
    height: rvs(48),
    borderRadius: rs(14),
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  sortCaption: {
    marginTop: rvs(-6),
    marginBottom: rvs(10),
    marginStart: rs(4),
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
  footerNote: {
    marginTop: rvs(16),
  },
  loadingState: {
    paddingTop: rvs(60),
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
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
  sortTitle: {
    marginBottom: rvs(12),
  },
  sortCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: rvs(14),
  },
  sortRowDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
