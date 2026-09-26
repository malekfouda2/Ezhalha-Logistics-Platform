// The Operations Hub landing screen — rendered by the Ops tab (hamburger) and by the
// operations-hub route pushed from the drawer / More tab (back chevron).
import { useState } from "react";
import { I18nManager, Pressable, StyleSheet, View } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Skeleton } from "@/components/ui/Skeleton";
import { RefreshableScreen } from "@/components/ui/RefreshableScreen";
import { AdminTabHeader } from "@/components/layout/AdminTabHeader";
import { AdminNoAccess } from "@/components/layout/AdminNoAccess";
import { AdminDrawer } from "@/components/layout/AdminDrawer";
import { SectionTitle } from "@/components/sections/operationsHub/OpsPrimitives";
import { QUEUE_ORDER } from "@/components/sections/operationsHub/opsFormat";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { useAdminIdentity } from "@/lib/hooks/useAdminIdentity";
import { useOperationsSummary } from "@/lib/hooks/useAdminOperations";
import type { OperationQueue, OperationsSummary } from "@/lib/services/adminOperations";

const REQUIRED_PERMISSION = "operations:read";

type FeatherName = keyof typeof Feather.glyphMap;

const QUEUE_META: Record<
  OperationQueue,
  { icon: FeatherName; count: (s: OperationsSummary) => number; badge?: "red" | "amber" | "gray" }
> = {
  attention: { icon: "alert-triangle", count: (s) => s.attentionCount, badge: "red" },
  special: { icon: "flag", count: (s) => s.specialHandlingCount, badge: "amber" },
  dangerous_goods: { icon: "alert-octagon", count: (s) => s.dangerousGoodsCount, badge: "amber" },
  express: { icon: "truck", count: (s) => s.expressCount },
  ddp: { icon: "package", count: (s) => s.ddpCount },
  local: { icon: "map-pin", count: (s) => s.localCount },
  delivered: { icon: "check", count: (s) => s.deliveredCount },
  returned: { icon: "rotate-ccw", count: (s) => s.returnedCount, badge: "gray" },
};

const BADGE_COLORS = {
  red: { background: "#FDE8E8", text: "#B91C1C" },
  amber: { background: "#FEF3C7", text: "#92400E" },
  gray: { background: "#E8ECF1", text: "#475569" },
};

// The first stat card sits on the pale-orange active fill; the default gray sweep reads as a
// hole in it, so that card shimmers in its own tint.
const ACTIVE_SHIMMER_COLORS = ["#FCDCCB", "#FFEDE3", "#FCDCCB"];

export function openQueue(queue: OperationQueue) {
  router.push(`/(protected)/(admin)/operations-hub/queue/${queue}`);
}

export function OperationsHubView({ mode }: { mode: "tab" | "stack" }) {
  const { t } = useTranslation();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const { hasPermission } = useAdminAccess();
  const { roleLabel } = useAdminIdentity();
  const canRead = hasPermission("operations", "read");
  const title = t("adminOperations.hub.title");
  const { data: summary, isLoading: summaryLoading } = useOperationsSummary();

  const headerNav =
    mode === "tab" ? { onMenuPress: () => setDrawerVisible(true) } : { onBackPress: () => router.back() };

  if (!canRead) {
    return (
      <View style={styles.container}>
        <View style={styles.headerArea}>
          <AdminTabHeader title={title} subtitle={REQUIRED_PERMISSION} {...headerNav} />
        </View>
        <AdminNoAccess screenTitle={title} permission={REQUIRED_PERMISSION} roleName={roleLabel} />
        <AdminDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
      </View>
    );
  }

  const open = summary ? summary.expressCount + summary.ddpCount + summary.localCount : undefined;

  const stats: { queue: OperationQueue; value?: number; label: string }[] = [
    { queue: "express", value: summary?.expressCount, label: t("adminOperations.queues.express.short") },
    { queue: "ddp", value: summary?.ddpCount, label: t("adminOperations.queues.ddp.short") },
    { queue: "local", value: summary?.localCount, label: t("adminOperations.queues.local.short") },
  ];

  return (
    <View style={styles.container}>
      <RefreshableScreen contentContainerStyle={styles.content}>
        <AdminTabHeader
          title={title}
          subtitle={
            summary
              ? t("adminOperations.hub.subtitle", { open, attention: summary.attentionCount })
              : " "
          }
          {...headerNav}
        />

        <View style={styles.statsRow}>
          {stats.map((stat, index) => (
            <Pressable
              key={stat.queue}
              onPress={() => openQueue(stat.queue)}
              style={({ pressed }) => [styles.statCard, index === 0 && styles.statCardActive, pressed && styles.pressed]}
            >
              {summaryLoading ? (
                <Skeleton
                  width={rs(40)}
                  height={rvs(24)}
                  borderRadius={rs(6)}
                  style={styles.statValueSkeleton}
                  shimmerColors={index === 0 ? ACTIVE_SHIMMER_COLORS : undefined}
                />
              ) : (
                <Text size="xxl" weight="bold" style={index === 0 ? { color: Colors.primary } : undefined}>
                  {stat.value ?? "—"}
                </Text>
              )}
              <Text size="xs" weight="semibold" dimRate="60%" textTransform="uppercase" style={styles.statLabel}>
                {stat.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <SectionTitle>{t("adminOperations.hub.queues")}</SectionTitle>
        <View style={styles.queueCard}>
          {QUEUE_ORDER.map((queue, index) => {
            const meta = QUEUE_META[queue];
            const count = summary ? meta.count(summary) : undefined;
            const badge = meta.badge && count !== undefined && count > 0 ? BADGE_COLORS[meta.badge] : undefined;
            return (
              <Pressable
                key={queue}
                onPress={() => openQueue(queue)}
                style={({ pressed }) => [styles.queueRow, pressed && styles.pressed]}
              >
                {index > 0 && <View style={styles.divider} />}
                <View style={styles.queueContent}>
                  <View style={styles.queueIcon}>
                    <Feather name={meta.icon} size={rs(19)} color={Colors.primary} />
                  </View>
                  <View style={styles.queueText}>
                    <Text size="medium" weight="bold">
                      {t(`adminOperations.queues.${queue}.title`)}
                    </Text>
                    <Text size="xs" dimRate="60%" numberOfLines={1} style={styles.queueSubtitle}>
                      {t(`adminOperations.queues.${queue}.subtitle`)}
                      {count !== undefined ? ` · ${count}` : ""}
                    </Text>
                  </View>
                  {badge ? (
                    <View style={[styles.badge, { backgroundColor: badge.background }]}>
                      <Text size="xs" weight="bold" style={{ color: badge.text }}>
                        {count}
                      </Text>
                    </View>
                  ) : (
                    <Ionicons
                      name={I18nManager.isRTL ? "chevron-back" : "chevron-forward"}
                      size={rs(16)}
                      color={Colors.placeholder}
                    />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </RefreshableScreen>

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
    paddingTop: rvs(16),
  },
  content: {
    paddingHorizontal: rs(16),
    paddingBottom: rvs(32),
  },
  statsRow: {
    flexDirection: "row",
    gap: rs(10),
    marginBottom: rvs(22),
  },
  statCard: {
    flex: 1,
    minHeight: rvs(80),
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    borderWidth: 1.5,
    borderColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: rvs(12),
    paddingHorizontal: rs(6),
  },
  statCardActive: {
    backgroundColor: "#FFF3EC",
    borderColor: Colors.primary,
  },
  statValueSkeleton: {
    marginVertical: rvs(4),
  },
  statLabel: {
    marginTop: rvs(4),
    textAlign: "center",
    letterSpacing: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
  queueCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    overflow: "hidden",
  },
  queueRow: {
    backgroundColor: Colors.white,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  queueContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: rs(14),
    gap: rs(12),
  },
  queueIcon: {
    width: rs(40),
    height: rs(40),
    borderRadius: rs(12),
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  queueText: {
    flex: 1,
  },
  queueSubtitle: {
    marginTop: rvs(3),
  },
  badge: {
    minWidth: rs(30),
    height: rs(26),
    borderRadius: rs(13),
    paddingHorizontal: rs(8),
    alignItems: "center",
    justifyContent: "center",
  },
});
