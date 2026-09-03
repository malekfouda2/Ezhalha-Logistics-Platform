// components/sections/invoices/InvoiceRow.tsx
import { View, Pressable, StyleSheet } from "react-native";
import { SaudiRiyal } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { formatMoney, formatShortDate } from "@/utils/invoiceFormat";
import type { Invoice } from "@shared/schema";

interface InvoiceRowProps {
  invoice: Invoice;
  onPress?: () => void;
  onPay: () => void;
}

export function InvoiceRow({ invoice, onPress, onPay }: InvoiceRowProps) {
  const { t } = useTranslation();
  const isPaid = invoice.status === "completed";

  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.info}>
        <Text size="medium" weight="bold" numberOfLines={1}>
          {invoice.invoiceNumber}
        </Text>
        <Text size="small" dimRate="60%" style={styles.meta}>
          {isPaid
            ? t("invoices.paidOn", { date: formatShortDate(invoice.paidAt) })
            : t("invoices.issued", {
                date: formatShortDate(invoice.createdAt),
                dueDate: formatShortDate(invoice.dueDate),
              })}
        </Text>
      </View>

      <View style={styles.right}>
        <View style={styles.amountRow}>
          <SaudiRiyal size={rs(14)} color={Colors.text} style={styles.riyalIcon} />
          <Text size="medium" weight="bold">
            {formatMoney(invoice.amount)}
          </Text>
        </View>

        {isPaid ? (
          <StatusBadge status="paid" style={styles.badge} />
        ) : (
          <Pressable onPress={onPay} hitSlop={6} style={styles.payButton}>
            <Text size="small" weight="bold" style={styles.payButtonText}>
              {t("invoices.payNow")}
            </Text>
          </Pressable>
        )}
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
    marginTop: 0,
    alignSelf: "flex-end",
  },
  payButton: {
    backgroundColor: Colors.primary,
    borderRadius: rs(10),
    paddingHorizontal: rs(14),
    paddingVertical: rvs(8),
  },
  payButtonText: {
    color: Colors.white,
  },
});
