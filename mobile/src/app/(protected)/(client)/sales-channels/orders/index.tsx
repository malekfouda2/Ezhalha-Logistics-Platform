import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Feather, Ionicons } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { RefreshableScreen } from "@/components/ui/RefreshableScreen";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ChipSelect } from "@/components/ui/ChipSelect";
import { ScreenHeader } from "@/components/sections/profile/ScreenHeader";
import { OrderListItem } from "@/components/sections/salesChannels/OrderListItem";
import { SalesFeatureGate } from "@/components/sections/salesChannels/SalesFeatureGate";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useOrders } from "@/lib/hooks/useOrders";
import { useSalesChannels } from "@/lib/hooks/useSalesChannels";
import type { OrderRow } from "@/lib/services/orders";

type StatusFilter = "all" | OrderRow["status"];

const STATUS_FILTERS: StatusFilter[] = [
  "all",
  "new",
  "assigned",
  "shipped",
  "delivered",
  "cancelled",
];

export default function OrdersScreen() {
  return (
    <SalesFeatureGate>
      <OrdersScreenContent />
    </SalesFeatureGate>
  );
}

function OrdersScreenContent() {
  const { t } = useTranslation();
  const { data: orders, isLoading } = useOrders();
  const { data: channels } = useSalesChannels();
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [filtersVisible, setFiltersVisible] = useState(false);

  const toFulfilCount = useMemo(
    () => (orders ?? []).filter((o) => o.status === "new").length,
    [orders],
  );

  const filtered = useMemo(
    () =>
      (orders ?? []).filter(
        (o) =>
          (statusFilter === "all" || o.status === statusFilter) &&
          (channelFilter === "all" || o.salesChannelId === channelFilter),
      ),
    [orders, statusFilter, channelFilter],
  );

  const statusLabel = (status: StatusFilter) =>
    status === "all"
      ? t("salesChannels.orders.tabs.all")
      : t(`salesChannels.orders.status.${status}`);

  const activeFilterCount =
    (channelFilter !== "all" ? 1 : 0) + (statusFilter !== "all" ? 1 : 0);

  const channelOptions = [
    { value: "all", label: t("salesChannels.orders.allChannels") },
    ...(channels ?? []).map((channel) => ({
      value: channel.id,
      label: channel.name,
    })),
  ];

  const statusOptions = STATUS_FILTERS.map((status) => ({
    value: status,
    label:
      status === "new" && toFulfilCount > 0
        ? `${statusLabel(status)} · ${toFulfilCount}`
        : statusLabel(status),
  }));

  const handleClearFilters = () => {
    setChannelFilter("all");
    setStatusFilter("all");
  };

  return (
    <View style={styles.screen}>
      <RefreshableScreen contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.headerTitle}>
            <ScreenHeader
              title={t("salesChannels.orders.title")}
              subtitle={t("salesChannels.orders.subtitle")}
            />
          </View>

          <Pressable
            onPress={() => setFiltersVisible(true)}
            style={[
              styles.filterButton,
              activeFilterCount > 0 && styles.filterButtonActive,
            ]}
          >
            <Ionicons
              name="options-outline"
              size={rs(20)}
              color={activeFilterCount > 0 ? Colors.white : Colors.text}
            />
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text size="xs" weight="bold" style={styles.filterBadgeText}>
                  {activeFilterCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {isLoading ? (
          <ActivityIndicator color={Colors.primary} style={styles.loading} />
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="shopping-bag" size={rs(32)} color={Colors.placeholder} />
            <Text size="medium" weight="bold" style={styles.emptyTitle}>
              {t("salesChannels.orders.empty.title")}
            </Text>
            <Text size="small" dimRate="60%" style={styles.emptyDescription}>
              {t("salesChannels.orders.empty.description")}
            </Text>
          </View>
        ) : (
          filtered.map((order) => (
            <OrderListItem
              key={order.id}
              order={order}
              onPress={() => router.push(`/sales-channels/orders/${order.id}`)}
            />
          ))
        )}
      </RefreshableScreen>

      <BottomSheet
        visible={filtersVisible}
        onClose={() => setFiltersVisible(false)}
      >
        <Text size="large" weight="bold" style={styles.sheetTitle}>
          {t("salesChannels.orders.filters.title")}
        </Text>

        {channels && channels.length > 1 && (
          <ChipSelect
            label={t("salesChannels.orders.filters.channel")}
            value={channelFilter}
            onChange={setChannelFilter}
            options={channelOptions}
          />
        )}

        <ChipSelect
          label={t("salesChannels.orders.filters.status")}
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as StatusFilter)}
          options={statusOptions}
        />

        <View style={styles.sheetFooter}>
          {activeFilterCount > 0 && (
            <View style={styles.footerMeta}>
              <Pressable
                onPress={handleClearFilters}
                style={styles.clearAllRow}
                hitSlop={8}
              >
                <Ionicons name="close" size={rs(14)} color={Colors.text} />
                <Text size="small" weight="semibold" style={styles.clearAllText}>
                  {t("salesChannels.orders.filters.clearAll")}
                </Text>
              </Pressable>
            </View>
          )}

          <Button
            title={t("salesChannels.orders.filters.done")}
            onPress={() => setFiltersVisible(false)}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(8),
    paddingBottom: rvs(24),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  headerTitle: {
    flex: 1,
  },
  filterButton: {
    width: rs(44),
    height: rvs(44),
    borderRadius: rs(12),
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: rvs(2),
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
  sheetTitle: {
    marginBottom: rvs(16),
  },
  sheetFooter: {
    gap: rvs(12),
    marginTop: rvs(8),
    marginBottom: rvs(4),
  },
  footerMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  clearAllRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(4),
  },
  clearAllText: {
    color: Colors.text,
  },
  loading: {
    marginTop: rvs(40),
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
