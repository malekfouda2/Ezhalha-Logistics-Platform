// components/sections/invoices/ExtraFeeNoticeRow.tsx
import { View, StyleSheet } from "react-native";
import { SaudiRiyal } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { formatMoney, formatShortDate, daysUntil } from "@/utils/invoiceFormat";
import type { ExtraFeeNotice } from "@/lib/services/invoices";

interface ExtraFeeNoticeRowProps {
  notice: ExtraFeeNotice;
}

export function ExtraFeeNoticeRow({ notice }: ExtraFeeNoticeRowProps) {
  const { t } = useTranslation();

  const title =
    notice.extraFeesType === "EXTRA_WEIGHT"
      ? t("invoices.payments.extraWeight")
      : t("invoices.payments.extraCost");

  const isNew = (daysUntil(notice.extraFeesAddedAt) ?? -99) >= -3;

  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text size="medium" weight="bold" numberOfLines={1}>
          {title}
        </Text>
        <Text size="small" dimRate="60%" style={styles.meta}>
          {notice.trackingNumber} · {formatShortDate(notice.extraFeesAddedAt)}
        </Text>
      </View>

      <View style={styles.right}>
        <View style={styles.amountRow}>
          <SaudiRiyal size={rs(14)} color={Colors.text} style={styles.riyalIcon} />
          <Text size="medium" weight="bold">
            {formatMoney(notice.extraFeesAmountSar)}
          </Text>
        </View>

        {isNew ? (
          <View style={styles.badge}>
            <Text size="xs" weight="bold" style={styles.badgeText}>
              {t("invoices.payments.new")}
            </Text>
          </View>
        ) : null}
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
  badge: {
    backgroundColor: Colors.amberBackgroundColor,
    paddingHorizontal: rs(10),
    paddingVertical: rvs(4),
    borderRadius: rs(10),
  },
  badgeText: {
    color: Colors.amberTextColor,
  },
});
