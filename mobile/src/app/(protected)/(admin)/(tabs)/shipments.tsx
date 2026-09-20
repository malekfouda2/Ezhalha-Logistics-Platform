// app/(protected)/(admin)/(tabs)/shipments.tsx
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { SaudiRiyal } from "lucide-react-native";

import { Text } from "@/components/ui/Text";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AdminScreenHeader } from "@/components/layout/AdminScreenHeader";
import { AdminNoAccess } from "@/components/layout/AdminNoAccess";
import { AdminEmptyState } from "@/components/layout/AdminEmptyState";
import { AdminDrawer } from "@/components/layout/AdminDrawer";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { fetchPaginated } from "@/api/pagination";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { useAdminIdentity } from "@/lib/hooks/useAdminIdentity";
import type { Shipment } from "@shared/schema";

const PAGE_SIZE = 20;
const REQUIRED_PERMISSION = "shipments:read";

export default function AdminShipmentsScreen() {
  const { t } = useTranslation();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [page, setPage] = useState(1);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [shipments, setShipments] = useState<Shipment[]>([]);

  const { hasPermission } = useAdminAccess();
  const { roleLabel } = useAdminIdentity();
  const canReadShipments = hasPermission("shipments", "read");
  const title = t("admin.shipmentsTab.title");

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["/api/admin/shipments", "list", page, refreshIndex],
    queryFn: () => fetchPaginated<Shipment>("/api/admin/shipments", page, PAGE_SIZE),
    enabled: canReadShipments,
  });

  useEffect(() => {
    if (!data) return;
    setShipments((prev) => (page === 1 ? data.data : [...prev, ...data.data]));
  }, [data, page]);

  const handleRefresh = () => {
    setPage(1);
    setRefreshIndex((i) => i + 1);
  };

  const handleLoadMore = () => {
    if (data?.pagination.hasNextPage && !isFetching) {
      setPage((p) => p + 1);
    }
  };

  return (
    <View style={styles.container}>
      <AdminScreenHeader
        title={title}
        subtitle={canReadShipments ? undefined : REQUIRED_PERMISSION}
        onMenuPress={() => setDrawerVisible(true)}
      />

      {!canReadShipments ? (
        <AdminNoAccess screenTitle={title} permission={REQUIRED_PERMISSION} roleName={roleLabel} />
      ) : isLoading && shipments.length === 0 ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={shipments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.4}
          onEndReached={handleLoadMore}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && page === 1}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          ListEmptyComponent={
            <AdminEmptyState
              icon="hexagon"
              title={t("admin.shipmentsTab.empty.title")}
              description={t("admin.shipmentsTab.empty.description")}
            />
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text size="medium" weight="bold" numberOfLines={1}>
                  {item.trackingNumber}
                </Text>
                <Text size="xs" dimRate="55%" numberOfLines={1} style={styles.rowSubtitle}>
                  {item.senderCity} → {item.recipientCity}
                </Text>
              </View>

              <View style={styles.rowRight}>
                <View style={styles.priceRow}>
                  <SaudiRiyal size={rs(13)} color={Colors.text} style={styles.currencyIcon} />
                  <Text size="small" weight="bold">
                    {Number(item.finalPrice).toLocaleString()}
                  </Text>
                </View>
                <StatusBadge status={item.status} style={styles.statusBadge} />
              </View>
            </View>
          )}
          ListFooterComponent={
            data?.pagination.hasNextPage ? (
              <Pressable onPress={handleLoadMore} style={styles.loadMore} disabled={isFetching}>
                {isFetching && page > 1 ? (
                  <ActivityIndicator color={Colors.primary} />
                ) : (
                  <Text size="small" weight="bold" style={styles.loadMoreText}>
                    {t("admin.shipmentsTab.loadMore")}
                  </Text>
                )}
              </Pressable>
            ) : null
          }
        />
      )}

      <AdminDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: rs(16),
    paddingBottom: rvs(24),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    paddingHorizontal: rs(14),
    paddingVertical: rvs(13),
    marginBottom: rvs(10),
  },
  rowInfo: {
    flex: 1,
    marginEnd: rs(8),
  },
  rowSubtitle: {
    marginTop: rvs(3),
  },
  rowRight: {
    alignItems: "flex-end",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  currencyIcon: {
    marginEnd: rs(3),
  },
  statusBadge: {
    marginTop: rvs(5),
  },
  loadMore: {
    paddingVertical: rvs(16),
    alignItems: "center",
  },
  loadMoreText: {
    color: Colors.primary,
  },
});
