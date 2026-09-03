// components/sections/invoices/CreditInvoiceRow.tsx
import { View, Pressable, StyleSheet } from "react-native";
import { SaudiRiyal } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Colors, setOpacity } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { daysUntil, formatMoney, formatShortDate } from "@/utils/invoiceFormat";
import type { CreditInvoiceWithShipment } from "@/lib/services/invoices";

interface CreditInvoiceRowProps {
  invoice: CreditInvoiceWithShipment;
  onPress: () => void;
}

function DueBadge({ dueAt }: { dueAt: string | Date }) {
  const { t } = useTranslation();
  const days = daysUntil(dueAt);

  if (days === null) return null;

  if (days < 0) {
    return (
      <View style={[styles.badge, styles.badgeOverdue]}>
        <Text size="xs" weight="bold" style={styles.badgeTextOverdue}>
          {t("invoices.creditBilling.overdueBy", { count: Math.abs(days) })}
        </Text>
      </View>
    );
  }

  if (days === 0) {
    return (
      <View style={[styles.badge, styles.badgeUrgent]}>
        <Text size="xs" weight="bold" style={styles.badgeTextUrgent}>
          {t("invoices.creditBilling.dueToday")}
        </Text>
      </View>
    );
  }

  const urgent = days <= 7;
  return (
    <View style={[styles.badge, urgent ? styles.badgeUrgent : styles.badgeNeutral]}>
      <Text
        size="xs"
        weight="bold"
        style={urgent ? styles.badgeTextUrgent : styles.badgeTextNeutral}
      >
        {t("invoices.creditBilling.daysLeft", { count: days })}
      </Text>
    </View>
  );
}

export function CreditInvoiceRow({ invoice, onPress }: CreditInvoiceRowProps) {
  const { t } = useTranslation();
  const isPaid = invoice.status === "PAID";

  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.info}>
        <Text size="medium" weight="bold" numberOfLines={1}>
          {invoice.shipment?.trackingNumber ?? invoice.shipmentId}
        </Text>
        <Text size="small" dimRate="60%" style={styles.meta}>
          {isPaid
            ? t("invoices.paidOn", { date: formatShortDate(invoice.paidAt) })
            : t("invoices.creditBilling.due", { date: formatShortDate(invoice.dueAt) })}
        </Text>
      </View>

      <View style={styles.right}>
        <View style={styles.amountRow}>
          <SaudiRiyal size={rs(14)} color={Colors.text} style={styles.riyalIcon} />
          <Text size="medium" weight="bold">
            {formatMoney(invoice.amount)}
          </Text>
        </View>

        {isPaid ? <StatusBadge status="paid" /> : <DueBadge dueAt={invoice.dueAt} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: rvs(16),
    gap: rs(10),
  },
  info: {
    flex: 1,
  },
  meta: {
    marginTop: rvs(3),
  },
  right: {
    alignItems: "flex-end",
    gap: rvs(8),
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  riyalIcon: {
    marginRight: rs(3),
  },
  badge: {
    paddingHorizontal: rs(10),
    paddingVertical: rvs(4),
    borderRadius: rs(10),
  },
  badgeUrgent: {
    backgroundColor: Colors.amberBackgroundColor,
  },
  badgeTextUrgent: {
    color: Colors.amberTextColor,
  },
  badgeNeutral: {
    backgroundColor: setOpacity(Colors.secondary, 0.12),
  },
  badgeTextNeutral: {
    color: Colors.secondary,
  },
  badgeOverdue: {
    backgroundColor: setOpacity(Colors.error, 0.12),
  },
  badgeTextOverdue: {
    color: Colors.error,
  },
});
