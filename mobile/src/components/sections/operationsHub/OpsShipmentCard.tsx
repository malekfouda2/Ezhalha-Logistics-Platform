import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { MONO_FONT, Money, Pill, type PillTone } from "@/components/sections/operationsHub/OpsPrimitives";
import {
  ageLabel,
  dangerousGoodsTab,
  issueLabel,
  openAttentionFlags,
  route,
  statusLabel,
  statusTone,
} from "@/components/sections/operationsHub/opsFormat";
import type { OperationQueue, OperationShipmentSummary } from "@/lib/services/adminOperations";

type FeatherName = keyof typeof Feather.glyphMap;

const KIND_ICON: Record<OperationShipmentSummary["shipmentKind"], FeatherName> = {
  EXPRESS: "hexagon",
  DDP: "package",
  LOCAL: "map-pin",
  DANGEROUS_GOODS: "alert-triangle",
};

interface OpsShipmentCardProps {
  shipment: OperationShipmentSummary;
  queue?: OperationQueue;
  onPress: () => void;
  showDivider?: boolean;
  /** Highlights the icon — used for the oldest/first row in the queue. */
  highlight?: boolean;
}

export function OpsShipmentCard({ shipment, queue, onPress, showDivider, highlight }: OpsShipmentCardProps) {
  const { t } = useTranslation();
  const flag = openAttentionFlags(shipment)[0];

  // The pill says why the row is in this queue: the issue in Needs Attention, the priority in
  // Special Handling, the DG stage in Dangerous Goods — the shipment status everywhere else.
  let pill: { label: string; tone: PillTone };
  if (queue === "attention" && flag) {
    pill = { label: issueLabel(flag.issueType, t), tone: flag.issueType.startsWith("carrier") ? "red" : "amber" };
  } else if (queue === "special") {
    const priority = shipment.specialHandlingPriority ?? shipment.specialHandling?.priority ?? "normal";
    pill = {
      label: t(`adminOperations.priority.${priority}`, { defaultValue: priority }),
      tone: priority === "urgent" ? "red" : priority === "high" ? "amber" : "gray",
    };
  } else if (queue === "dangerous_goods") {
    const tab = dangerousGoodsTab(shipment);
    pill = {
      label: t(`adminOperations.tabs.dg.${tab}`),
      tone: tab === "carrier" || tab === "review" ? "amber" : tab === "live" ? "green" : "blue",
    };
  } else if (shipment.paymentStatus === "unpaid" && queue !== "delivered") {
    pill = { label: t("adminOperations.card.unpaid"), tone: "amber" };
  } else {
    pill = { label: statusLabel(shipment.status, t), tone: statusTone(shipment.status) };
  }

  const line1 = [shipment.clientName, route(shipment)].filter(Boolean).join(" · ");

  const detail =
    (queue === "attention" && flag?.details) ||
    (queue === "special" && shipment.specialHandling?.reason) ||
    [
      shipment.carrierName || t("adminOperations.card.notBooked"),
      queue !== "attention" && queue !== "special" && pill.label !== statusLabel(shipment.status, t)
        ? statusLabel(shipment.status, t)
        : undefined,
      shipment.assignedToName,
    ]
      .filter(Boolean)
      .join(" · ");

  const meta = `${detail} · ${t("adminOperations.card.sinceUpdate", { age: ageLabel(shipment.updatedAt, t) })}`;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {showDivider && <View style={styles.divider} />}
      <View style={styles.content}>
        <View style={[styles.icon, highlight && styles.iconHighlight]}>
          <Feather
            name={KIND_ICON[shipment.shipmentKind]}
            size={rs(18)}
            color={highlight ? Colors.primary : Colors.textSecondary}
          />
        </View>

        <View style={styles.info}>
          <View style={styles.titleRow}>
            <Text size="medium" weight="bold" style={styles.mono} numberOfLines={1}>
              {shipment.trackingNumber}
            </Text>
            {shipment.hasDangerousGoods && queue !== "dangerous_goods" ? <Pill label="DG" tone="red" /> : null}
          </View>
          {line1 ? (
            <Text size="xs" dimRate="70%" style={styles.line}>
              {line1}
            </Text>
          ) : null}
          <Text size="xs" dimRate="50%" style={styles.line} numberOfLines={2}>
            {meta}
          </Text>
        </View>

        <View style={styles.side}>
          <Pill label={pill.label} tone={pill.tone} />
          {queue !== "attention" ? (
            <View style={styles.amount}>
              <Money amount={shipment.finalPrice} size="small" />
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: Colors.white,
  },
  pressed: {
    opacity: 0.7,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  content: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(12),
    padding: rs(14),
  },
  icon: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(12),
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  iconHighlight: {
    backgroundColor: "#FFE9DE",
  },
  info: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(6),
  },
  mono: {
    fontFamily: MONO_FONT,
    flexShrink: 1,
  },
  line: {
    marginTop: rvs(3),
  },
  side: {
    alignItems: "flex-end",
    maxWidth: "38%",
  },
  amount: {
    marginTop: rvs(8),
  },
});
