import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { RefreshableScreen } from "@/components/ui/RefreshableScreen";
import { ScreenHeader } from "@/components/sections/profile/ScreenHeader";
import { OrderListItem } from "@/components/sections/salesChannels/OrderListItem";
import { SalesFeatureGate } from "@/components/sections/salesChannels/SalesFeatureGate";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useOrders } from "@/lib/hooks/useOrders";
import type { OrderRow } from "@/lib/services/orders";

type TabId = "toFulfil" | "fulfilled" | "all";

function matchesTab(order: OrderRow, tab: TabId): boolean {
  if (tab === "all") return true;
  if (tab === "toFulfil") return order.status === "new";
  return order.status !== "new" && order.status !== "cancelled";
}

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
  const [tab, setTab] = useState<TabId>("toFulfil");

  const toFulfilCount = useMemo(() => (orders ?? []).filter((o) => o.status === "new").length, [orders]);
  const filtered = useMemo(() => (orders ?? []).filter((o) => matchesTab(o, tab)), [orders, tab]);

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "toFulfil", label: `${t("salesChannels.orders.tabs.toFulfil")} · ${toFulfilCount}` },
    { id: "fulfilled", label: t("salesChannels.orders.tabs.fulfilled") },
    { id: "all", label: t("salesChannels.orders.tabs.all") },
  ];

  return (
    <View style={styles.screen}>
      <RefreshableScreen contentContainerStyle={styles.content}>
        <ScreenHeader title={t("salesChannels.orders.title")} subtitle={t("salesChannels.orders.subtitle")} />

        <View style={styles.tabsRow}>
          {tabs.map((tabItem) => {
            const active = tabItem.id === tab;
            return (
              <Pressable
                key={tabItem.id}
                onPress={() => setTab(tabItem.id)}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text size="small" weight="bold" style={active ? styles.tabLabelActive : styles.tabLabel}>
                  {tabItem.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {isLoading ? (
          <ActivityIndicator color={Colors.primary} style={styles.loading} />
        ) : filtered.length === 0 ? (
          <Text size="small" dimRate="55%" style={styles.empty}>
            {t("salesChannels.orders.empty")}
          </Text>
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
  tabsRow: {
    flexDirection: "row",
    gap: rs(8),
    marginBottom: rvs(16),
  },
  tab: {
    paddingHorizontal: rs(14),
    paddingVertical: rvs(9),
    borderRadius: rs(20),
    backgroundColor: Colors.white,
  },
  tabActive: {
    backgroundColor: Colors.primary,
  },
  tabLabel: {
    color: Colors.textSecondary,
  },
  tabLabelActive: {
    color: Colors.white,
  },
  loading: {
    marginTop: rvs(40),
  },
  empty: {
    textAlign: "center",
    marginTop: rvs(40),
  },
});
