// components/sections/dashboard/ShipmentStatusChart.tsx
//
// The Performance screen's "Shipment Status" donut — groups the backend's granular
// `statusDistribution` (one row per shipment.status value, e.g. "picked_up",
// "customs_clearance") into the six buckets the screen shows, same grouping a reader would
// make eyeballing StatusBadge's live/terminal split (components/ui/StatusBadge.tsx). "Created"
// and "Awaiting Review" are kept apart (rather than merged into one "Processing" bucket) to
// match the web admin dashboard, which lists every raw status as its own slice
// (client/src/pages/admin/dashboard.tsx).
import { View, StyleSheet } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Skeleton } from "@/components/ui/Skeleton";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import type { StatusDistribution } from "@shared/schema";

const SIZE = rs(140);
const STROKE = rs(20);
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type BucketKey = "created" | "awaitingReview" | "inTransit" | "delivered" | "onHold" | "returned";

const BUCKET_ORDER: BucketKey[] = ["created", "awaitingReview", "inTransit", "delivered", "onHold", "returned"];

const BUCKET_COLORS: Record<BucketKey, string> = {
  created: Colors.primary,
  awaitingReview: "#8B5CF6",
  inTransit: "#3B82F6",
  delivered: "#22C55E",
  onHold: "#F59E0B",
  returned: "#9CA3AF",
};

// Every shipment.status value this app writes (see shared/schema.ts + StatusBadge), sorted
// into which of the six buckets a reader would put it in.
const STATUS_TO_BUCKET: Record<string, BucketKey> = {
  draft: "created",
  payment_pending: "created",
  created: "created",
  processing: "created",
  picked_up: "created",
  pending: "created",
  dg_booking: "created",

  dg_review: "awaitingReview",
  dg_awaiting_carrier: "awaitingReview",
  awaiting_review: "awaitingReview",

  in_transit: "inTransit",
  customs_clearance: "inTransit",
  out_for_delivery: "inTransit",

  delivered: "delivered",
  completed: "delivered",

  on_hold: "onHold",

  returned: "returned",
  cancelled: "returned",
  failed: "returned",
  carrier_error: "returned",
  rejected: "returned",
};

interface ShipmentStatusChartProps {
  statusDistribution?: StatusDistribution[];
  isLoading?: boolean;
}

export function ShipmentStatusChart({ statusDistribution, isLoading }: ShipmentStatusChartProps) {
  const { t } = useTranslation();

  const counts: Record<BucketKey, number> = {
    created: 0,
    awaitingReview: 0,
    inTransit: 0,
    delivered: 0,
    onHold: 0,
    returned: 0,
  };
  (statusDistribution ?? []).forEach((row) => {
    const bucket = STATUS_TO_BUCKET[row.status] ?? "created";
    counts[bucket] += row.count;
  });

  const total = BUCKET_ORDER.reduce((sum, key) => sum + counts[key], 0);
  const labels: Record<BucketKey, string> = {
    created: t("admin.performance.statusLabels.created"),
    awaitingReview: t("admin.performance.statusLabels.awaitingReview"),
    inTransit: t("admin.performance.statusLabels.inTransit"),
    delivered: t("admin.performance.statusLabels.delivered"),
    onHold: t("admin.performance.statusLabels.onHold"),
    returned: t("admin.performance.statusLabels.returned"),
  };

  let cumulative = 0;

  return (
    <View style={styles.card}>
      <Text size="medium" weight="bold" style={styles.title}>
        {t("admin.performance.shipmentStatusTitle")}
      </Text>

      {isLoading ? (
        <Skeleton width={SIZE} height={SIZE} borderRadius={SIZE / 2} style={styles.donutSkeleton} />
      ) : total === 0 ? (
        <View style={[styles.donutSkeleton, styles.emptyDonut]}>
          <Text size="small" style={styles.emptyText}>
            {t("admin.performance.noData")}
          </Text>
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.donutWrap}>
            <Svg width={SIZE} height={SIZE}>
              <G rotation={-90} originX={SIZE / 2} originY={SIZE / 2}>
                <Circle
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  stroke="#EEF0F3"
                  strokeWidth={STROKE}
                  fill="none"
                />
                {BUCKET_ORDER.filter((key) => counts[key] > 0).map((key) => {
                  const segmentLength = (counts[key] / total) * CIRCUMFERENCE;
                  const offset = -cumulative;
                  cumulative += segmentLength;
                  return (
                    <Circle
                      key={key}
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={RADIUS}
                      stroke={BUCKET_COLORS[key]}
                      strokeWidth={STROKE}
                      strokeDasharray={`${segmentLength} ${CIRCUMFERENCE - segmentLength}`}
                      strokeDashoffset={offset}
                      strokeLinecap="butt"
                      fill="none"
                    />
                  );
                })}
              </G>
            </Svg>

            <View style={styles.donutCenter} pointerEvents="none">
              <Text size="large" weight="bold" style={styles.donutTotal}>
                {total}
              </Text>
              <Text size="xs" weight="semibold" style={styles.donutLabel}>
                {t("admin.performance.shipmentStatusActive")}
              </Text>
            </View>
          </View>

          <View style={styles.legend}>
            {BUCKET_ORDER.map((key) => (
              <View key={key} style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: BUCKET_COLORS[key] }]} />
                <Text size="small" style={styles.legendLabel} numberOfLines={1}>
                  {labels[key]}
                </Text>
                <Text size="small" weight="bold" style={styles.legendValue}>
                  {counts[key]}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: rs(18),
    padding: rs(14),
    marginTop: rvs(14),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.035,
    shadowRadius: 6,
    elevation: 1,
  },
  title: {
    color: Colors.text,
    marginBottom: rvs(12),
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  donutWrap: {
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  donutSkeleton: {
    alignSelf: "center",
  },
  emptyDonut: {
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: "#65748B",
  },
  donutCenter: {
    position: "absolute",
    alignItems: "center",
  },
  donutTotal: {
    color: Colors.text,
  },
  donutLabel: {
    color: "#9AA5B4",
    marginTop: rvs(2),
  },
  legend: {
    flex: 1,
    marginStart: rs(18),
    gap: rvs(10),
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendDot: {
    width: rs(9),
    height: rs(9),
    borderRadius: rs(5),
    marginEnd: rs(8),
  },
  legendLabel: {
    flex: 1,
    color: Colors.text,
  },
  legendValue: {
    color: Colors.text,
  },
});
