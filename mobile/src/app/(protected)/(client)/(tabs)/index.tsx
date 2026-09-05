import React from "react";
import {
  ScrollView,
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
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
import { LanguageSwitch } from "@/components/ui/LanguageSwitch";
import { useTranslation } from "react-i18next";
import { useNotifications } from "@/lib/hooks/useNotifications";
import { useGlobalRefresh } from "@/lib/hooks/useRefreshOnFocus";
import { RefreshableScreen } from "@/components/ui/RefreshableScreen";
import { useCurrentUser } from "@/lib/hooks/useAuth";

export default function ClientDashboard() {
  const { t } = useTranslation();
  const { data: account, isLoading: accountLoading } = useQuery<ClientAccount>({
    queryKey: ["/api/client/account"],
  });
  const { data: user } = useCurrentUser();

  const { data: stats, isLoading: statsLoading } =
    useQuery<ClientDashboardStats>({
      queryKey: ["/api/client/stats"],
    });

  const { data: recentShipments, isLoading: shipmentsLoading } = useQuery<
    Shipment[]
  >({
    queryKey: ["/api/client/shipments/recent"],
  });

  const { unreadCount } = useNotifications();

  const displayName = user?.username || account?.name || t("profile.noCompanyName");
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";

  const translateMonth = (label: string) => {
    const monthMap: Record<string, string> = {
      jan: t("months.jan"),
      january: t("months.jan"),

      feb: t("months.feb"),
      february: t("months.feb"),

      mar: t("months.mar"),
      march: t("months.mar"),

      apr: t("months.apr"),
      april: t("months.apr"),

      may: t("months.may"),

      jun: t("months.jun"),
      june: t("months.jun"),

      jul: t("months.jul"),
      july: t("months.jul"),

      aug: t("months.aug"),
      august: t("months.aug"),

      sep: t("months.sep"),
      september: t("months.sep"),

      oct: t("months.oct"),
      october: t("months.oct"),

      nov: t("months.nov"),
      november: t("months.nov"),

      dec: t("months.dec"),
      december: t("months.dec"),
    };

    return monthMap[label.trim().toLowerCase()] ?? label;
  };

  return (
    <RefreshableScreen contentContainerStyle={styles.content}>
      {/* <LanguageSwitch /> */}
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

        <Pressable
          style={styles.notificationButton}
          onPress={() => router.push("/quick-quote")}
        >
          <Ionicons name="calculator-outline" size={rs(19)} color={Colors.text} />
        </Pressable>

        <Pressable
          style={[styles.notificationButton, styles.notificationButtonSpacing]}
          onPress={() => router.push("/notifications")}
        >
          <Ionicons
            name="notifications-outline"
            size={rs(19)}
            color={Colors.text}
          />

          {unreadCount > 0 && (
            <View style={styles.notificationBadge}>
              <Text
                size="xs"
                weight="bold"
                style={styles.notificationBadgeText}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Welcome */}
      <View style={styles.welcomeSection}>
        <Text size="xxl" weight="bold" style={styles.welcome}>
          {t("dashboard.welcomeBack")}
        </Text>

        <View style={styles.pricingBadge}>
          <Text size="small" weight="semibold" style={styles.pricingText}>
            {t("dashboard.pricingTier")}
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
            title={t("dashboard.stats.totalShipments")}
            value={String(stats?.totalShipments ?? 0)}
            icon="hexagon"
            subtitle={`▲ ${stats?.trends.shipments.value ?? 0}%`}
            subtitleColor="#16713B"
          />

          <StatCard
            title={t("dashboard.stats.inTransit")}
            value={String(stats?.shipmentsInTransit ?? 0)}
            icon="truck"
            subtitle={`${stats?.shipmentsDelivered ?? 0} ${t(
              "dashboard.stats.delivered",
            )}`}
          />

          <StatCard
            title={t("dashboard.stats.outstanding")}
            value={String(stats?.pendingInvoices ?? 0)}
            icon="file-text"
            subtitle={t("dashboard.stats.invoicesDue")}
            subtitleColor="#9A7410"
          />

          <StatCard
            title={t("dashboard.stats.spent30d")}
            value={(stats?.totalSpent ?? 0).toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
            valuePrefix
            icon="trending-up"
            subtitle={`▲ ${stats?.trends.spent.value ?? 0}%`}
            subtitleColor="#16713B"
          />
        </View>
      )}

      {/* Shipment Activity */}
      <View style={styles.section}>
        <Text size="large" weight="bold" style={styles.sectionTitle}>
          {t("dashboard.shipmentActivity")}
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
                    {(stats?.shipmentsByMonth ?? []).map((item, index, arr) => (
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

                        <Text size="xs" weight="semibold" style={styles.month}>
                          {translateMonth(item.label)}
                        </Text>
                      </View>
                    ))}
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
    </RefreshableScreen>
  );
}

const styles = StyleSheet.create({
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
    marginStart: rs(9),
    flex: 1,
  },
  companyName: {
    color: Colors.text,
  },
  userName: {
    color: "#65748B",
    marginTop: rvs(1),
  },
  notificationButtonSpacing: {
    marginStart: rs(8),
  },
  notificationButton: {
    width: rs(40),
    height: rs(40),
    borderRadius: rs(10),
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    position: "relative", // important
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },

  notificationBadge: {
    position: "absolute",
    top: -rs(12),
    right: -rs(4),
    minWidth: rs(25),
    height: rs(25),
    paddingHorizontal: rs(3),
    borderRadius: 50,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.white,
  },

  notificationBadgeText: {
    color: Colors.white,
    fontSize: rs(9),
    lineHeight: rs(11),
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
    marginStart: rs(6),
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
