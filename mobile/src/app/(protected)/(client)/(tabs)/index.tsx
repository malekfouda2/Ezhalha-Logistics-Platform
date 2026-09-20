import React from "react";
import {
  ScrollView,
  View,
  StyleSheet,
  Pressable,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

import { Text } from "@/components/ui/Text";
import { Skeleton } from "@/components/ui/Skeleton";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { StatCard } from "@/components/sections/dashboard/StatCard";
import { StatCardSkeleton } from "@/components/sections/dashboard/StatCardSkeleton";
import { RecentShipments } from "@/components/sections/dashboard/RecentShipments";
import { ShipmentActivityChart } from "@/components/sections/dashboard/ShipmentActivityChart";
import { ClientAccount, ClientDashboardStats, Shipment } from "@shared/schema";
import { router } from "expo-router";
import { LanguageSwitch } from "@/components/ui/LanguageSwitch";
import { useTranslation } from "react-i18next";
import { useNotifications } from "@/lib/hooks/useNotifications";
import { useGlobalRefresh } from "@/lib/hooks/useRefreshOnFocus";
import { RefreshableScreen } from "@/components/ui/RefreshableScreen";
import { useCurrentUser } from "@/lib/hooks/useAuth";
import { useGuestMode } from "@/store/useGuestStore";

export default function ClientDashboard() {
  const { t } = useTranslation();
  const { isGuest, end: endGuest } = useGuestMode();
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

  const handleExitGuest = () => {
    endGuest();
    router.replace("/(auth)/login");
  };

  return (
    <RefreshableScreen contentContainerStyle={styles.content}>
      {/* <LanguageSwitch /> */}

      {isGuest && (
        <View style={styles.guestBanner} testID="guest-banner">
          <Text size="small" style={styles.guestBannerText}>
            {t("guest.banner.message")}
          </Text>
          <View style={styles.guestBannerActions}>
            <Pressable style={styles.guestBannerButton} onPress={() => router.push("/apply")}>
              <Text size="xs" weight="bold" style={styles.guestBannerButtonText}>
                {t("guest.banner.createAccount")}
              </Text>
            </Pressable>
            <Pressable onPress={handleExitGuest}>
              <Text size="xs" weight="semibold" style={styles.guestBannerExit}>
                {t("guest.banner.exit")}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.userInfo}>
          {accountLoading && !isGuest ? (
            <Skeleton width={rs(42)} height={rs(42)} borderRadius={rs(13)} />
          ) : (
            <View style={styles.avatar}>
              <Text size="medium" weight="bold" style={styles.avatarText}>
                {initials}
              </Text>
            </View>
          )}

          <View style={styles.userText}>
            {accountLoading && !isGuest ? (
              <Skeleton
                width={rs(120)}
                height={rvs(15)}
                borderRadius={rs(4)}
                style={styles.companyNameSkeleton}
              />
            ) : (
              <Text
                size="medium"
                weight="bold"
                numberOfLines={1}
                style={styles.companyName}
              >
                {displayName}
              </Text>
            )}

            {accountLoading && !isGuest ? (
              <Skeleton
                width={rs(90)}
                height={rvs(11)}
                borderRadius={rs(4)}
                style={styles.userNameSkeleton}
              />
            ) : (
              <Text size="xs" style={styles.userName} numberOfLines={1}>
                {isGuest ? t("guest.notSignedIn") : `${account?.name} · ${account?.accountNumber}`}
              </Text>
            )}
          </View>
        </View>

        <Pressable
          style={styles.notificationButton}
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

          {accountLoading && !isGuest ? (
            <Skeleton
              width={rs(50)}
              height={rvs(13)}
              borderRadius={rs(4)}
              style={styles.vipSkeleton}
            />
          ) : (
            <Text size="small" weight="bold" style={styles.vip}>
              {account?.profile?.toUpperCase() ?? "—"}
            </Text>
          )}
        </View>
      </View>

      {/* Stats */}
      {statsLoading ? (
        <View style={styles.statsGrid}>
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
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
      <ShipmentActivityChart data={stats?.shipmentsByMonth} isLoading={statsLoading} />

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
  guestBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF3EC",
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
    paddingVertical: rvs(10),
    marginBottom: rvs(12),
    gap: rs(10),
  },
  guestBannerText: {
    flex: 1,
    color: Colors.text,
  },
  guestBannerActions: {
    alignItems: "center",
    gap: rs(10),
  },
  guestBannerButton: {
    backgroundColor: Colors.primary,
    borderRadius: rs(20),
    paddingHorizontal: rs(12),
    paddingVertical: rvs(6),
  },
  guestBannerButtonText: {
    color: Colors.white,
  },
  guestBannerExit: {
    color: Colors.primary,
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
  companyNameSkeleton: {
    marginBottom: rvs(2),
  },
  userName: {
    color: "#65748B",
    marginTop: rvs(1),
  },
  userNameSkeleton: {
    marginTop: rvs(3),
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
  vipSkeleton: {
    marginStart: rs(6),
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: rvs(18),
  },
});
