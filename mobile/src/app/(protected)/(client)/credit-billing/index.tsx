// app/credit-billing/index.tsx
import { useMemo, useState } from "react";
import { View, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/ui/BackButton";
import InfoBox from "@/components/ui/InfoBox";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { DarkSummaryCard } from "@/components/sections/invoices/DarkSummaryCard";
import { CreditInvoiceRow } from "@/components/sections/invoices/CreditInvoiceRow";
import { RequestCreditAccessSheet } from "@/components/sections/invoices/RequestCreditAccessSheet";
import { formatMoney, toNumber } from "@/utils/invoiceFormat";
import type { CreditAccessStatus, CreditInvoiceWithShipment } from "@/lib/services/invoices";
import type { ClientAccount } from "@shared/schema";

type FilterKey = "all" | "unpaid" | "overdue" | "paid";

export default function CreditBillingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [requestSheetVisible, setRequestSheetVisible] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");

  const { data: account, isLoading: accountLoading } = useQuery<ClientAccount>({
    queryKey: ["/api/client/account"],
  });

  const { data: creditAccess, isLoading: accessLoading } = useQuery<CreditAccessStatus>({
    queryKey: ["/api/client/credit-access"],
  });

  const creditEnabled = account?.creditEnabled ?? false;

  const { data: creditInvoices, isLoading: invoicesLoading } = useQuery<
    CreditInvoiceWithShipment[]
  >({
    queryKey: ["/api/client/credit-invoices"],
    enabled: creditEnabled,
  });

  const outstandingInvoices = useMemo(
    () => (creditInvoices ?? []).filter((i) => i.status === "UNPAID" || i.status === "OVERDUE"),
    [creditInvoices],
  );

  const sortedOutstanding = useMemo(
    () =>
      [...outstandingInvoices].sort(
        (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
      ),
    [outstandingInvoices],
  );

  const used = useMemo(
    () => outstandingInvoices.reduce((sum, i) => sum + toNumber(i.amount), 0),
    [outstandingInvoices],
  );

  const limit = toNumber(account?.creditLimitSar);
  const available = Math.max(limit - used, 0);
  const nextDue = sortedOutstanding[0]?.dueAt ?? null;

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "all", label: t("invoices.creditBilling.tabs.all") },
    { key: "unpaid", label: t("invoices.creditBilling.tabs.unpaid") },
    { key: "overdue", label: t("invoices.creditBilling.tabs.overdue") },
    { key: "paid", label: t("invoices.creditBilling.tabs.paid") },
  ];

  const filteredList = useMemo(() => {
    const all = creditInvoices ?? [];
    const list =
      filter === "unpaid"
        ? all.filter((i) => i.status === "UNPAID")
        : filter === "overdue"
          ? all.filter((i) => i.status === "OVERDUE")
          : filter === "paid"
            ? all.filter((i) => i.status === "PAID")
            : all;

    return [...list].sort((a, b) =>
      filter === "paid"
        ? new Date(b.paidAt ?? b.dueAt).getTime() - new Date(a.paidAt ?? a.dueAt).getTime()
        : new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
    );
  }, [creditInvoices, filter]);

  const handlePay = () => {
    Toast.show({
      type: "info",
      text1: t("invoices.creditBilling.settleNoticeTitle"),
      text2: t("invoices.creditBilling.settleNotice"),
    });
  };

  const isLoading = accountLoading || accessLoading;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <BackButton />
          <View style={styles.headerTitleBlock}>
            <Text size="medium" weight="bold">
              {t("invoices.creditBilling.title")}
            </Text>
            <Text size="small" weight="semibold" dimRate="60%">
              {t("invoices.creditBilling.subtitle")}
            </Text>
          </View>
        </View>

        {creditEnabled && (
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
        )}

        {isLoading ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        ) : !creditEnabled ? (
          <View style={styles.noAccessBox}>
            <View style={styles.noAccessHeading}>
              <Feather name="lock" size={rs(18)} color={Colors.textSecondary} />
              <Text size="medium" weight="bold" style={styles.noAccessTitle}>
                {t("invoices.creditBilling.notEnabled.title")}
              </Text>
            </View>

            <Text size="small" dimRate="60%" style={styles.noAccessText}>
              {t(
                creditAccess?.request?.status === "pending"
                  ? "invoices.creditBilling.notEnabled.pending"
                  : creditAccess?.request?.status === "rejected"
                    ? "invoices.creditBilling.notEnabled.rejected"
                    : "invoices.creditBilling.notEnabled.description",
              )}
            </Text>

            {creditAccess?.request?.status !== "pending" && (
              <Button
                title={t("invoices.requestCreditAccess.title")}
                onPress={() => setRequestSheetVisible(true)}
                style={styles.requestButton}
              />
            )}
          </View>
        ) : (
          <>
            <DarkSummaryCard
              label={t("invoices.creditBilling.availableCredit")}
              amount={formatMoney(available).split(".")[0]}
              decimals={`.${formatMoney(available).split(".")[1]}`}
              progress={limit > 0 ? used / limit : 0}
              stats={[
                { label: t("invoices.creditBilling.limit"), value: formatMoney(limit) },
                { label: t("invoices.creditBilling.used"), value: formatMoney(used) },
                {
                  label: t("invoices.creditBilling.nextDue"),
                  value: nextDue
                    ? new Date(nextDue).toLocaleDateString("en-US", {
                        day: "numeric",
                        month: "short",
                      })
                    : t("invoices.none"),
                },
              ]}
            />

            <Text
              size="xs"
              weight="semibold"
              dimRate="55%"
              textTransform="uppercase"
              style={styles.sectionLabel}
            >
              {t("invoices.creditBilling.creditInvoices")}
            </Text>

            {invoicesLoading ? (
              <ActivityIndicator color={Colors.primary} style={styles.listLoading} />
            ) : filteredList.length === 0 ? (
              <Text size="small" dimRate="60%" style={styles.emptyText}>
                {t("invoices.creditBilling.empty")}
              </Text>
            ) : (
              <View style={styles.listCard}>
                {filteredList.map((invoice, index) => (
                  <View key={invoice.id}>
                    {index > 0 && <View style={styles.rowDivider} />}
                    <CreditInvoiceRow
                      invoice={invoice}
                      onPress={() => router.push(`/credit-billing/${invoice.id}`)}
                    />
                  </View>
                ))}
              </View>
            )}

            {outstandingInvoices.length > 0 && (
              <InfoBox text={t("invoices.creditBilling.lateNotice")} />
            )}
          </>
        )}

        <View style={{ height: rvs(20) }} />
      </ScrollView>

      {creditEnabled && sortedOutstanding.length > 0 && (
        <View style={styles.footer}>
          <Button
            title={t("invoices.creditBilling.pay", {
              amount: formatMoney(sortedOutstanding[0].amount),
            })}
            onPress={handlePay}
          />
        </View>
      )}

      <RequestCreditAccessSheet
        visible={requestSheetVisible}
        onClose={() => setRequestSheetVisible(false)}
      />
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
    paddingTop: rvs(16),
    paddingBottom: rvs(100),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: rvs(20),
  },
  headerTitleBlock: {
    flex: 1,
    paddingStart: rs(10),
  },
  centerBlock: {
    paddingTop: rvs(60),
    alignItems: "center",
  },
  noAccessBox: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: rs(16),
    padding: rs(16),
    gap: rvs(10),
  },
  noAccessHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(8),
  },
  noAccessTitle: {
    color: Colors.text,
  },
  noAccessText: {
    lineHeight: rvs(18),
  },
  requestButton: {
    marginTop: rvs(6),
  },
  sectionLabel: {
    marginBottom: rvs(10),
    letterSpacing: 0.5,
  },
  listCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
    marginBottom: rvs(16),
  },
  rowDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  listLoading: {
    marginTop: rvs(20),
  },
  emptyText: {
    paddingVertical: rvs(20),
    textAlign: "center",
  },
  filtersRow: {
    flexDirection: "row",
    gap: rs(8),
    marginBottom: rvs(16),
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
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: rs(16),
    paddingTop: rvs(10),
    paddingBottom: rvs(20),
    backgroundColor: Colors.background,
  },
});
