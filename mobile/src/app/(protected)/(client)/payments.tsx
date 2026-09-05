// app/payments.tsx
import { useMemo } from "react";
import { View, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { BackButton } from "@/components/ui/BackButton";
import { SectionLabel, InfoCard, InfoRow } from "@/components/ui/InfoCard";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { BilledPaidChart, BilledPaidPoint } from "@/components/sections/invoices/BilledPaidChart";
import { ExtraFeeNoticeRow } from "@/components/sections/invoices/ExtraFeeNoticeRow";
import { PaymentTransactionRow } from "@/components/sections/invoices/PaymentTransactionRow";
import { formatMoney, toNumber } from "@/utils/invoiceFormat";
import type { ExtraFeeNotice } from "@/lib/services/invoices";
import type { Invoice, Payment } from "@shared/schema";

const MONTH_KEYS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

export default function PaymentsScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const { data: invoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/client/invoices"],
  });

  const { data: payments, isLoading: paymentsLoading } = useQuery<Payment[]>({
    queryKey: ["/api/client/payments"],
  });

  const { data: extraFees, isLoading: feesLoading } = useQuery<ExtraFeeNotice[]>({
    queryKey: ["/api/client/extra-fees"],
  });

  const isLoading = invoicesLoading || paymentsLoading;

  const invoiceById = useMemo(() => {
    const map = new Map<string, Invoice>();
    (invoices ?? []).forEach((inv) => map.set(inv.id, inv));
    return map;
  }, [invoices]);

  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }).map((_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, []);

  const chartData: BilledPaidPoint[] = useMemo(() => {
    return months.map(({ year, month }) => {
      const billed = (invoices ?? [])
        .filter((inv) => {
          const d = new Date(inv.createdAt);
          return d.getFullYear() === year && d.getMonth() === month;
        })
        .reduce((sum, inv) => sum + toNumber(inv.amount), 0);

      const paid = (payments ?? [])
        .filter((p) => {
          if (p.status !== "completed") return false;
          const d = new Date(p.createdAt);
          return d.getFullYear() === year && d.getMonth() === month;
        })
        .reduce((sum, p) => sum + toNumber(p.amount), 0);

      return { label: t(`months.${MONTH_KEYS[month]}`), billed, paid };
    });
  }, [months, invoices, payments, t]);

  const billedTotal = useMemo(
    () => chartData.reduce((sum, m) => sum + m.billed, 0),
    [chartData],
  );
  const paidTotal = useMemo(() => chartData.reduce((sum, m) => sum + m.paid, 0), [chartData]);

  const outstanding = useMemo(
    () =>
      (invoices ?? [])
        .filter((inv) => inv.status !== "completed" && inv.status !== "refunded" && inv.status !== "cancelled")
        .reduce((sum, inv) => sum + toNumber(inv.amount), 0),
    [invoices],
  );

  const sortedPayments = useMemo(
    () =>
      [...(payments ?? [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [payments],
  );

  const sortedFees = useMemo(
    () =>
      [...(extraFees ?? [])].sort(
        (a, b) => new Date(b.extraFeesAddedAt).getTime() - new Date(a.extraFeesAddedAt).getTime(),
      ),
    [extraFees],
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <BackButton />
          <Text size="xl" weight="bold" style={styles.headerTitle}>
            {t("invoices.payments.title")}
          </Text>
          <Pressable onPress={() => router.push("/saved-cards")} style={styles.cardsButton}>
            <Feather name="credit-card" size={rs(18)} color={Colors.text} />
          </Pressable>
        </View>

        {isLoading ? (
          <ActivityIndicator color={Colors.primary} style={styles.loading} />
        ) : (
          <>
            <SectionLabel>{t("invoices.payments.accountSnapshot")}</SectionLabel>
            <InfoCard>
              <InfoRow
                label={t("invoices.payments.billed")}
                value={formatMoney(billedTotal)}
              />
              <InfoRow label={t("invoices.payments.paid")} value={formatMoney(paidTotal)} />
              <InfoRow
                label={t("invoices.payments.outstanding")}
                value={formatMoney(outstanding)}
                valueColor={outstanding > 0 ? Colors.primary : undefined}
              />
            </InfoCard>

            <SectionLabel>{t("invoices.payments.chartTitle")}</SectionLabel>
            <View style={styles.chartCard}>
              <BilledPaidChart data={chartData} />

              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.legendDotBilled]} />
                  <Text size="xs" dimRate="60%">
                    {t("invoices.payments.billed")}
                  </Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.legendDotPaid]} />
                  <Text size="xs" dimRate="60%">
                    {t("invoices.payments.paid")}
                  </Text>
                </View>
              </View>
            </View>

            {feesLoading ? null : sortedFees.length > 0 ? (
              <>
                <SectionLabel>{t("invoices.payments.extraFeeNotices")}</SectionLabel>
                <View style={styles.listCard}>
                  {sortedFees.map((fee, index) => (
                    <View key={`${fee.shipmentId}-${fee.extraFeesType}`}>
                      {index > 0 && <View style={styles.rowDivider} />}
                      <ExtraFeeNoticeRow notice={fee} />
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <SectionLabel>{t("invoices.payments.transactions")}</SectionLabel>
            {sortedPayments.length === 0 ? (
              <Text size="small" dimRate="60%" style={styles.emptyText}>
                {t("invoices.payments.empty")}
              </Text>
            ) : (
              <View style={styles.listCard}>
                {sortedPayments.map((payment, index) => (
                  <View key={payment.id}>
                    {index > 0 && <View style={styles.rowDivider} />}
                    <PaymentTransactionRow
                      payment={payment}
                      invoiceNumber={invoiceById.get(payment.invoiceId)?.invoiceNumber}
                    />
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        <View style={{ height: rvs(20) }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(8),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: rvs(20),
  },
  headerTitle: {
    flex: 1,
    paddingStart: rs(10),
  },
  cardsButton: {
    width: rs(40),
    height: rs(40),
    borderRadius: rs(12),
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  loading: {
    marginTop: rvs(60),
  },
  chartCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    padding: rs(16),
    marginBottom: rvs(20),
  },
  legendRow: {
    flexDirection: "row",
    gap: rs(16),
    marginTop: rvs(14),
    justifyContent: "center",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(6),
  },
  legendDot: {
    width: rs(8),
    height: rs(8),
    borderRadius: rs(4),
  },
  legendDotBilled: {
    backgroundColor: "#FFD5C3",
  },
  legendDotPaid: {
    backgroundColor: Colors.primary,
  },
  listCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
    marginBottom: rvs(20),
  },
  rowDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  emptyText: {
    paddingVertical: rvs(20),
    textAlign: "center",
  },
});
