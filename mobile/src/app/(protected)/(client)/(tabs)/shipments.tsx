// app/(tabs)/shipments.tsx
import { useState, useMemo } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  RefreshControl,
  FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, Feather } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { ShipmentCard } from "@/components/sections/shipments/ShipmentCard";
import { Shipment } from "@shared/schema";
import { AttentionShipmentCard } from "@/components/sections/shipments/AttentionShipmentCard";
import { Button } from "@/components/ui/Button";

type FilterKey =
  | "all"
  | "processing"
  | "attention"
  | "delivered"
  | "in_transit";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "processing", label: "Processing" },
  { key: "attention", label: "Attention" },
  { key: "delivered", label: "Delivered" },
  { key: "in_transit", label: "In Transit" },
];

const STATUS_MAP: Record<FilterKey, string[]> = {
  all: [],
  processing: ["draft", "payment_pending", "created", "processing"],
  in_transit: [
    "picked_up",
    "in_transit",
    "customs_clearance",
    "out_for_delivery",
  ],
  attention: ["on_hold", "returned", "carrier_error"],
  delivered: ["delivered"],
};

export default function ShipmentsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const {
    data: shipments,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<Shipment[]>({
    queryKey: ["/api/client/shipments"],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    let list = shipments ?? [];

    if (activeFilter !== "all") {
      const statuses = STATUS_MAP[activeFilter];
      list = list.filter((s) => statuses.includes(s.status.toLowerCase()));
    }

    if (search.trim().length > 0) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.trackingNumber.toLowerCase().includes(q) ||
          s.recipientName.toLowerCase().includes(q),
      );
    }

    return list;
  }, [shipments, activeFilter, search]);

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <Text size="xl" weight="bold">
          Shipments
        </Text>
        <Text size="small" dimRate="70%" style={styles.subtitle}>
          Track all your shipments
        </Text>

        <Input
          placeholder="Search by ID or recipient..."
          value={search}
          onChangeText={setSearch}
          leftElement={
            <Ionicons
              name="location-outline"
              size={rs(20)}
              color={Colors.placeholder}
            />
          }
          style={styles.searchInput}
        />
      </View>

      {/* Filters */}
      <View style={styles.filtersWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}
        >
          {FILTERS.map((f) => {
            const active = f.key === activeFilter;
            return (
              <Pressable
                key={f.key}
                onPress={() => setActiveFilter(f.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text
                  size="small"
                  weight="semibold"
                  style={{ color: active ? Colors.white : Colors.text }}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={refetch}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <Feather
                name="hexagon"
                size={rs(32)}
                color={Colors.placeholder}
              />

              <Text size="medium" weight="bold" style={styles.emptyTitle}>
                No shipments yet
              </Text>

              <Text size="small" dimRate="60%" style={styles.emptyDescription}>
                Create your first shipment and it will show up here with live
                tracking.
              </Text>

              <Button
                title="Create a shipment"
                style={styles.createButton}
                onPress={() => router.push("createShipment")}
              />
            </View>
          ) : null
        }
        renderItem={({ item }) =>
          activeFilter === "attention" ? (
            <AttentionShipmentCard
              shipment={item}
              onPress={() => router.push(`/shipments/${item.id}` as any)}
            />
          ) : (
            <ShipmentCard
              shipment={item}
              onPress={() => router.push(`/shipments/${item.id}` as any)}
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(16),
  },
  subtitle: {
    marginTop: rvs(2),
    marginBottom: rvs(12),
  },
  searchInput: {
    marginBottom: 0,
  },
  filtersWrapper: {
    marginTop: rvs(10),
  },
  filtersRow: {
    paddingHorizontal: rs(16),
    gap: rs(8),
  },
  filterChip: {
    paddingHorizontal: rs(14),
    paddingVertical: rvs(7),
    borderRadius: rs(16),
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  listContent: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(12),
    paddingBottom: rvs(15),
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

  createButton: {
    marginTop: rvs(20),
    width: "70%",
  },
});
