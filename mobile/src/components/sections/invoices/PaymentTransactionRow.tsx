// components/sections/invoices/PaymentTransactionRow.tsx
import { View, StyleSheet } from "react-native";
import { SaudiRiyal } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { formatMoney, formatShortDate } from "@/utils/invoiceFormat";
import type { Payment } from "@shared/schema";

interface PaymentTransactionRowProps {
  payment: Payment;
  invoiceNumber?: string;
}

export function PaymentTransactionRow({ payment, invoiceNumber }: PaymentTransactionRowProps) {
  const { t } = useTranslation();
  const isRefund = payment.status === "refunded";

  const title = invoiceNumber
    ? isRefund
      ? `${t("invoices.payments.refund")} ${invoiceNumber}`
      : invoiceNumber
    : t("invoices.payments.payment");

  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text size="medium" weight="bold" numberOfLines={1}>
          {title}
        </Text>
        <Text size="small" dimRate="60%" style={styles.meta}>
          {formatShortDate(payment.createdAt)} · {payment.paymentMethod?.toUpperCase()}
        </Text>
      </View>

      <View style={styles.right}>
        <View style={styles.amountRow}>
          {isRefund ? (
            <Text size="medium" weight="bold" style={styles.refundAmount}>
              -
            </Text>
          ) : null}
          <SaudiRiyal
            size={rs(14)}
            color={isRefund ? Colors.error : Colors.text}
            style={styles.riyalIcon}
          />
          <Text size="medium" weight="bold" style={isRefund ? styles.refundAmount : undefined}>
            {formatMoney(payment.amount)}
          </Text>
        </View>

        <StatusBadge status={payment.status.toLowerCase()} />
      </View>
    </View>
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
  refundAmount: {
    color: Colors.error,
  },
});
