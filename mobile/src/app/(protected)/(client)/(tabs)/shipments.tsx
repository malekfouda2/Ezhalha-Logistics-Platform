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
import {
  FiltersModal,
  ShipmentFilters,
  EMPTY_FILTERS,
  countActiveFilters,
} from "@/components/sections/shipments/FiltersModal";
import { useTranslation } from "react-i18next";

type FilterKey =
  | "all"
  | "processing"
  | "attention"
  | "delivered"
  | "in_transit";

const FILTERS: { key: FilterKey; labelKey: string }[] = [
  { key: "all", labelKey: "shipments.filters.all" },
  { key: "processing", labelKey: "shipments.filters.processing" },
  { key: "attention", labelKey: "shipments.filters.attention" },
  { key: "delivered", labelKey: "shipments.filters.delivered" },
  { key: "in_transit", labelKey: "shipments.filters.inTransit" },
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

// Maps a shipment's shipmentType to the "method" filter options used in FiltersModal
function matchesMethod(shipment: Shipment, method: string) {
  return shipment.shipmentType?.toLowerCase() === method.toLowerCase();
}

function matchesOrigin(shipment: Shipment, origin: string) {
  const country = shipment.senderCountry?.toLowerCase() ?? "";
  switch (origin) {
    case "cn":
      return country.includes("china");
    case "uae":
      return country.includes("emirates") || country.includes("uae");
    case "sa":
      return country.includes("saudi");
    default:
      return true; // "other" - fallback, treat as match-all beyond known ones
  }
}

function matchesDestination(shipment: Shipment, destination: string) {
  const country = shipment.recipientCountry?.toLowerCase() ?? "";
  switch (destination) {
    case "cn":
      return country.includes("china");
    case "uae":
      return country.includes("emirates") || country.includes("uae");
    case "sa":
      return country.includes("saudi");
    default:
      return true;
  }
}

export default function ShipmentsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [filtersModalVisible, setFiltersModalVisible] = useState(false);
  const [appliedFilters, setAppliedFilters] =
    useState<ShipmentFilters>(EMPTY_FILTERS);
  const { t } = useTranslation();

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

  const activeFilterCount = useMemo(
    () => countActiveFilters(appliedFilters),
    [appliedFilters],
  );

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
          s.recipientName.toLowerCase().includes(q) ||
          s.recipientCity.toLowerCase().includes(q) ||
          s.senderName.toLowerCase().includes(q),
      );
    }

    if (appliedFilters.carrier) {
      list = list.filter(
        (s) =>
          s.carrierName?.toLowerCase() ===
          appliedFilters.carrier?.toLowerCase(),
      );
    }

    if (appliedFilters.paymentStatus) {
      list = list.filter(
        (s) =>
          s.paymentStatus?.toLowerCase() ===
          appliedFilters.paymentStatus?.toLowerCase(),
      );
    }

    if (appliedFilters.method) {
      list = list.filter((s) => matchesMethod(s, appliedFilters.method!));
    }

    if (appliedFilters.origin) {
      list = list.filter((s) => matchesOrigin(s, appliedFilters.origin!));
    }

    if (appliedFilters.destination) {
      list = list.filter((s) =>
        matchesDestination(s, appliedFilters.destination!),
      );
    }

    if (appliedFilters.createdFrom) {
      const from = new Date(appliedFilters.createdFrom);
      from.setHours(0, 0, 0, 0);
      list = list.filter((s) => new Date(s.createdAt) >= from);
    }

    if (appliedFilters.createdTo) {
      const to = new Date(appliedFilters.createdTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter((s) => new Date(s.createdAt) <= to);
    }

    return list;
  }, [shipments, activeFilter, search, appliedFilters]);

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <Text size="xl" weight="bold">
          {t("shipments.title")}
        </Text>

        <Text size="small" dimRate="70%" style={styles.subtitle}>
          {t("shipments.subtitle")}
        </Text>
        <View style={styles.searchRow}>
          <View style={styles.searchInputContainer}>
            <Input
              placeholder={t("shipments.searchPlaceholder")}
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

          <Pressable
            onPress={() => setFiltersModalVisible(true)}
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
                  {t(f.labelKey)}
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
            colors={[Colors.primary]}
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
                {t("shipments.empty.title")}
              </Text>

              <Text size="small" dimRate="60%" style={styles.emptyDescription}>
                {t("shipments.empty.description")}
              </Text>

              <Button
                title={t("shipments.empty.create")}
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
              onPress={() =>
                item.isQuote
                  ? router.push(`/shipments/${item.id}/quotation`)
                  : router.push(`/shipments/${item.id}`)
              }
            />
          ) : (
            <ShipmentCard
              shipment={item}
              onPress={() =>
                item.isQuote
                  ? router.push(`/shipments/${item.id}/quotation`)
                  : router.push(`/shipments/${item.id}`)
              }
            />
          )
        }
      />

      <FiltersModal
        visible={filtersModalVisible}
        initialFilters={appliedFilters}
        matchCount={filtered.length}
        onClose={() => setFiltersModalVisible(false)}
        onApply={setAppliedFilters}
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
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(10),
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
    marginBottom: rvs(20),
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
