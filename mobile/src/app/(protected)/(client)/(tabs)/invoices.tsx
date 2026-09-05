// app/(tabs)/invoices.tsx
import { useMemo, useState } from "react";
import { View, FlatList, Pressable, StyleSheet, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { DarkSummaryCard } from "@/components/sections/invoices/DarkSummaryCard";
import { InvoiceRow } from "@/components/sections/invoices/InvoiceRow";
import { ConfirmPaymentSheet } from "@/components/sections/invoices/ConfirmPaymentSheet";
import { formatMoney, formatShortDate } from "@/utils/invoiceFormat";
import type { Invoice } from "@shared/schema";
import { useMyPermissions } from "@/lib/hooks/useTeam";
import { ClientPermission } from "@shared/domain";

type FilterKey = "all" | "pending" | "paid";

export default function InvoicesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const { data: myPerms } = useMyPermissions();

  const canViewPayments =
    !!myPerms?.isPrimaryContact ||
    !!myPerms?.permissions.includes(ClientPermission.VIEW_PAYMENTS);

  const {
    data: invoices,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<Invoice[]>({
    queryKey: ["/api/client/invoices"],
    staleTime: 30_000,
  });

  const list = invoices ?? [];

  const unpaid = useMemo(() => list.filter((i) => i.status !== "completed"), [list]);

  const outstanding = useMemo(
    () => unpaid.reduce((sum, i) => sum + parseFloat(String(i.amount)), 0),
    [unpaid],
  );

  const overdueCount = useMemo(
    () => unpaid.filter((i) => new Date(i.dueDate).getTime() < Date.now()).length,
    [unpaid],
  );

  const nextDue = useMemo(() => {
    if (unpaid.length === 0) return null;
    return unpaid.reduce(
      (earliest, i) => (new Date(i.dueDate) < new Date(earliest) ? i.dueDate : earliest),
      unpaid[0].dueDate,
    );
  }, [unpaid]);

  const filtered = useMemo(() => {
    if (filter === "pending") return unpaid;
    if (filter === "paid") return list.filter((i) => i.status === "completed");
    return list;
  }, [filter, list, unpaid]);

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "all", label: t("invoices.tabs.all") },
    { key: "pending", label: t("invoices.tabs.pending") },
    { key: "paid", label: t("invoices.tabs.paid") },
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text size="xl" weight="bold">
          {t("tabs.invoices")}
        </Text>

        <View style={styles.linksRow}>
          <Pressable style={styles.linkChip} onPress={() => router.push("/credit-billing")}>
            <Feather name="credit-card" size={rs(14)} color={Colors.text} />
            <Text size="xs" weight="semibold" style={styles.linkChipText}>
              {t("invoices.creditBillingLink")}
            </Text>
          </Pressable>

          {canViewPayments && (
            <Pressable style={styles.linkChip} onPress={() => router.push("/payments")}>
              <Feather name="bar-chart-2" size={rs(14)} color={Colors.text} />
              <Text size="xs" weight="semibold" style={styles.linkChipText}>
                {t("invoices.payments.title")}
              </Text>
            </Pressable>
          )}
        </View>

        <View style={styles.filtersRow}>
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text
                  size="small"
                  weight="semibold"
                  style={{ color: active ? Colors.white : Colors.text }}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={refetch}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        ListHeaderComponent={
          <DarkSummaryCard
            label={t("invoices.outstandingBalance")}
            amount={formatMoney(outstanding).split(".")[0]}
            decimals={`.${formatMoney(outstanding).split(".")[1]}`}
            stats={[
              {
                label: t("invoices.invoicesOpen"),
                value: t("invoices.invoicesOpenCount", { count: unpaid.length }),
              },
              {
                label: t("invoices.nextDue"),
                value: nextDue ? formatShortDate(nextDue) : t("invoices.none"),
              },
              {
                label: t("invoices.overdue"),
                value: overdueCount > 0 ? String(overdueCount) : t("invoices.none"),
                valueColor: overdueCount > 0 ? Colors.error : undefined,
              },
            ]}
          />
        }
        ItemSeparatorComponent={() => <View style={styles.rowDivider} />}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <Feather name="file-text" size={rs(32)} color={Colors.placeholder} />
              <Text size="medium" weight="bold" style={styles.emptyTitle}>
                {t("invoices.empty.title")}
              </Text>
              <Text size="small" dimRate="60%" style={styles.emptyDescription}>
                {t("invoices.empty.description")}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <InvoiceRow invoice={item} onPay={() => setSelectedInvoice(item)} />
          </View>
        )}
      />

      <ConfirmPaymentSheet
        visible={!!selectedInvoice}
        invoice={selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        onPaid={() => setSelectedInvoice(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(8),
  },
  linksRow: {
    flexDirection: "row",
    gap: rs(8),
    marginTop: rvs(12),
  },
  linkChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(6),
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: rs(20),
    paddingHorizontal: rs(12),
    paddingVertical: rvs(7),
  },
  linkChipText: {
    color: Colors.text,
  },
  filtersRow: {
    flexDirection: "row",
    gap: rs(8),
    marginTop: rvs(14),
  },
  filterChip: {
    paddingHorizontal: rs(16),
    paddingVertical: rvs(8),
    borderRadius: rs(18),
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  listContent: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(16),
    paddingBottom: rvs(24),
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
  },
  rowDivider: {
    height: rvs(10),
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: rvs(60),
    paddingHorizontal: rs(30),
  },
  emptyTitle: {
    marginTop: rvs(10),
  },
  emptyDescription: {
    marginTop: rvs(6),
    textAlign: "center",
    maxWidth: rs(280),
    lineHeight: rvs(18),
  },
});
