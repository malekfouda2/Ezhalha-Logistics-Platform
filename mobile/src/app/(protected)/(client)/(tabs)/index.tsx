import React from "react";
import {
  ScrollView,
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { StatCard } from "@/components/sections/dashboard/StatCard";
import { RecentShipments } from "@/components/sections/dashboard/RecentShipments";
import { ClientAccount, ClientDashboardStats, Shipment } from "@shared/schema";
import { router } from "expo-router";

export default function ClientDashboard() {
  const { data: account, isLoading: accountLoading } = useQuery<ClientAccount>({
    queryKey: ["/api/client/account"],
  });

  const { data: stats, isLoading: statsLoading } =
    useQuery<ClientDashboardStats>({
      queryKey: ["/api/client/stats"],
    });

  const { data: recentShipments, isLoading: shipmentsLoading } = useQuery<
    Shipment[]
  >({
    queryKey: ["/api/client/shipments/recent"],
  });
  console.log({ account, stats, recentShipments });

  const displayName = account?.companyName || account?.name || "";
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.userInfo}>
            <View style={styles.avatar}>
              <Text size="medium" weight="bold" style={styles.avatarText}>
                {initials}
              </Text>
            </View>

            <View style={styles.userText}>
              <Text
                size="medium"
                weight="bold"
                numberOfLines={1}
                style={styles.companyName}
              >
                {accountLoading ? "Loading…" : displayName}
              </Text>

              <Text size="xs" style={styles.userName} numberOfLines={1}>
                {account?.name} · {account?.accountNumber}
              </Text>
            </View>
          </View>

          <Pressable style={styles.notificationButton} onPress={() => router.push("/notifications")}>
            <Ionicons
              name="notifications-outline"
              size={rs(19)}
              color={Colors.text}
            />

            <View style={styles.notificationDot} />
          </Pressable>
        </View>

        {/* Welcome */}
        <View style={styles.welcomeSection}>
          <Text size="xxl" weight="bold" style={styles.welcome}>
            Welcome back!
          </Text>

          <View style={styles.pricingBadge}>
            <Text size="small" weight="semibold" style={styles.pricingText}>
              Pricing tier
            </Text>

            <Text size="small" weight="bold" style={styles.vip}>
              {account?.profile?.toUpperCase() ?? "—"}
            </Text>
          </View>
        </View>

        {/* Stats */}
        {statsLoading ? (
          <View style={styles.statsLoading}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : (
          <View style={styles.statsGrid}>
            <StatCard
              title="Total shipments"
              value={String(stats?.totalShipments ?? 0)}
              icon="hexagon"
              subtitle={`▲ ${stats?.trends.shipments.value ?? 0}% ${stats?.trends.shipments.label ?? ""}`}
              subtitleColor="#16713B"
            />
            <StatCard
              title="In transit"
              value={String(stats?.shipmentsInTransit ?? 0)}
              icon="truck"
              subtitle={`${stats?.shipmentsDelivered ?? 0} delivered`}
            />
            <StatCard
              title="Outstanding"
              value={String(stats?.pendingInvoices ?? 0)}
              icon="file-text"
              subtitle="invoices due"
              subtitleColor="#9A7410"
            />

            <StatCard
              title="Spent (30d)"
              value={(stats?.totalSpent ?? 0).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
              valuePrefix={true}
              icon="trending-up"
              subtitle={`▲ ${stats?.trends.spent.value ?? 0}%`}
              subtitleColor="#16713B"
            />
          </View>
        )}

        {/* Shipment Activity */}
        <View style={styles.section}>
          <Text size="large" weight="bold" style={styles.sectionTitle}>
            Shipment Activity (Last 6 Months)
          </Text>

          <View style={styles.chartCard}>
            {statsLoading ? (
              <View
                style={[
                  styles.chart,
                  { alignItems: "center", justifyContent: "center" },
                ]}
              >
                <ActivityIndicator color={Colors.primary} />
              </View>
            ) : (
              (() => {
                const rawMax = Math.max(
                  ...(stats?.shipmentsByMonth?.map((m) => m.value) ?? [0]),
                  0,
                );
                const axisMax = Math.max(rawMax, 4);
                const step = Math.ceil(axisMax / 4);
                const niceMax = step * 4;
                const yLabels = [4, 3, 2, 1, 0].map((i) => i * step);

                return (
                  <View style={styles.chartRow}>
                    <View style={styles.yAxis}>
                      {yLabels.map((label) => (
                        <Text key={label} size="xs" style={styles.yAxisLabel}>
                          {label}
                        </Text>
                      ))}
                    </View>

                    <View style={styles.chart}>
                      {(stats?.shipmentsByMonth ?? []).map(
                        (item, index, arr) => (
                          <View key={item.label} style={styles.chartColumn}>
                            <View style={styles.barTrack}>
                              {item.value > 0 && (
                                <View
                                  style={[
                                    styles.bar,
                                    {
                                      height: `${(item.value / niceMax) * 100}%`,
                                      backgroundColor:
                                        index === arr.length - 1
                                          ? Colors.primary
                                          : "#FFD5C3",
                                    },
                                  ]}
                                />
                              )}
                            </View>

                            <Text
                              size="xs"
                              weight="semibold"
                              style={styles.month}
                            >
                              {item.label}
                            </Text>
                          </View>
                        ),
                      )}
                    </View>
                  </View>
                );
              })()
            )}
          </View>
        </View>

        {/* Recent Shipments */}
        <RecentShipments
          shipments={recentShipments}
          isLoading={shipmentsLoading}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(8),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatar: {
    width: rs(42),
    height: rs(42),
    borderRadius: rs(13),
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: Colors.white,
  },
  userText: {
    marginLeft: rs(9),
    flex: 1,
  },
  companyName: {
    color: Colors.text,
  },
  userName: {
    color: "#65748B",
    marginTop: rvs(1),
  },
  notificationButton: {
    width: rs(42),
    height: rs(42),
    borderRadius: rs(13),
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  notificationDot: {
    position: "absolute",
    width: rs(6),
    height: rs(6),
    borderRadius: rs(6),
    backgroundColor: Colors.primary,
    top: rs(12),
    right: rs(14),
  },
  welcomeSection: {
    marginTop: rvs(18),
  },
  welcome: {
    color: Colors.text,
  },
  pricingBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: rvs(10),
    paddingHorizontal: rs(13),
    paddingVertical: rvs(6),
    borderRadius: rs(24),
    backgroundColor: Colors.white,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  pricingText: {
    color: Colors.text,
  },
  vip: {
    color: Colors.primary,
    marginLeft: rs(6),
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: rvs(18),
  },
  statsLoading: {
    marginTop: rvs(18),
    minHeight: rvs(200),
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    marginTop: rvs(12),
  },
  sectionTitle: {
    color: Colors.text,
  },
  chartCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(18),
    paddingHorizontal: rs(10),
    paddingTop: rvs(15),
    paddingBottom: rvs(10),
    marginTop: rvs(10),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.035,
    shadowRadius: 6,
    elevation: 1,
  },
  chartRow: {
    flexDirection: "row",
  },
  yAxis: {
    height: rvs(100),
    justifyContent: "space-between",
    marginRight: rs(8),
  },
  yAxisLabel: {
    color: "#9AA5B4",
    textAlign: "right",
    minWidth: rs(16),
  },
  chart: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  chartColumn: {
    flex: 1,
    alignItems: "center",
  },
  barTrack: {
    height: rvs(90),
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  bar: {
    width: "60%",
    borderTopLeftRadius: rs(8),
    borderTopRightRadius: rs(8),
  },
  month: {
    color: "#65748B",
    marginTop: rvs(6),
  },
});
