// app/credit-billing/[id].tsx
import { View, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { SaudiRiyal } from "lucide-react-native";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/ui/BackButton";
import { SectionLabel, InfoCard, InfoRow } from "@/components/ui/InfoCard";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { formatDateTime, formatEnumLabel, formatMoney, formatShortDate } from "@/utils/invoiceFormat";
import { parseCreditInvoiceItems } from "@/lib/services/invoices";
import type { CreditInvoiceWithShipment } from "@/lib/services/invoices";

export default function CreditInvoiceDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();

  const {
    data: invoice,
    isLoading,
    isError,
  } = useQuery<CreditInvoiceWithShipment>({
    queryKey: [`/api/client/credit-invoices/${id}`],
    enabled: !!id,
  });


  if (isLoading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (isError || !invoice) {
    return (
      <View style={styles.centerScreen}>
        <Text size="medium" dimRate="60%">
          {t("invoices.creditInvoiceDetails.errors.loadFailed")}
        </Text>
      </View>
    );
  }

  const weightDisplay = invoice.shipment?.weight
    ? `${invoice.shipment.weight} ${invoice.shipment.weightUnit ?? "KG"}`
    : "—";

  const items = parseCreditInvoiceItems(invoice.shipment?.itemsData);

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
              {t("invoices.creditInvoiceDetails.title")}
            </Text>
            <Text size="small" weight="semibold" dimRate="60%">
              {invoice.shipment?.trackingNumber ?? invoice.shipmentId}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor:
                  invoice.status === "PAID"
                    ? "#15803D1A"
                    : invoice.status === "OVERDUE"
                      ? `${Colors.error}1A`
                      : Colors.amberBackgroundColor,
              },
            ]}
          >
            <Text
              size="xs"
              weight="bold"
              style={{
                color:
                  invoice.status === "PAID"
                    ? "#15803D"
                    : invoice.status === "OVERDUE"
                      ? Colors.error
                      : Colors.amberTextColor,
              }}
            >
              {invoice.status}
            </Text>
          </View>
        </View>

        <InfoCard>
          <InfoRow
            label={t("invoices.creditInvoiceDetails.issued")}
            value={formatShortDate(invoice.issuedAt)}
          />
          <InfoRow
            label={t("invoices.creditInvoiceDetails.due")}
            value={formatShortDate(invoice.dueAt)}
          />
          <InfoRow
            label={t("invoices.creditInvoiceDetails.terms")}
            value={t("invoices.creditInvoiceDetails.net30")}
          />
          <InfoRow
            label={t("invoices.creditInvoiceDetails.remindersSent")}
            value={String(invoice.remindersSent ?? 0)}
          />
        </InfoCard>

        {invoice.shipment ? (
          <>
            <SectionLabel>{t("invoices.creditInvoiceDetails.shipment")}</SectionLabel>
            <InfoCard>
              <InfoRow
                label={t("invoices.creditInvoiceDetails.carrierTracking")}
                value={invoice.shipment.carrierTrackingNumber ?? "—"}
              />
              <InfoRow
                label={t("invoices.creditInvoiceDetails.type")}
                value={invoice.shipment.shipmentType ?? "—"}
              />
              <InfoRow
                label={t("invoices.creditInvoiceDetails.service")}
                value={formatEnumLabel(invoice.shipment.serviceType)}
              />
              <InfoRow
                label={t("invoices.creditInvoiceDetails.from")}
                value={`${invoice.shipment.senderName ?? "—"} - ${invoice.shipment.senderCity}, ${invoice.shipment.senderCountry}`}
                valueSize="small"
              />
              <InfoRow
                label={t("invoices.creditInvoiceDetails.to")}
                value={`${invoice.shipment.recipientName ?? "—"} - ${invoice.shipment.recipientCity}, ${invoice.shipment.recipientCountry}`}
                valueSize="small"
              />
              <InfoRow
                label={t("invoices.creditInvoiceDetails.weight")}
                value={weightDisplay}
              />
              <InfoRow
                label={t("invoices.creditInvoiceDetails.packages")}
                value={String(invoice.shipment.numberOfPackages ?? 1)}
              />
              <InfoRow
                label={t("invoices.creditInvoiceDetails.created")}
                value={formatDateTime(invoice.shipment.createdAt)}
                valueSize="small"
              />
            </InfoCard>
          </>
        ) : null}

        {items.length > 0 ? (
          <>
            <SectionLabel>{t("invoices.creditInvoiceDetails.items")}</SectionLabel>
            <View style={styles.listCard}>
              {items.map((item, index) => (
                <View key={`${item.itemName}-${index}`}>
                  {index > 0 && <View style={styles.rowDivider} />}
                  <View style={styles.itemRow}>
                    <View style={styles.itemInfo}>
                      <Text size="small" weight="bold" numberOfLines={2}>
                        {item.itemName || t("invoices.creditInvoiceDetails.item")}
                      </Text>
                      <Text size="xs" dimRate="60%" style={styles.itemMeta}>
                        {t("invoices.creditInvoiceDetails.qty", { count: item.quantity ?? 1 })}
                        {item.hsCode ? ` · HS ${item.hsCode}` : ""}
                      </Text>
                    </View>
                    <Text size="small" weight="bold">
                      {item.currency ?? ""} {formatMoney(item.price)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <SectionLabel>{t("invoices.creditInvoiceDetails.amount")}</SectionLabel>
        <View style={styles.totalCard}>
          <Text size="medium" weight="bold">
            {t("invoices.creditInvoiceDetails.amount")}
          </Text>
          <View style={styles.totalValueRow}>
            <SaudiRiyal size={rs(18)} color={Colors.primary} style={styles.riyalIcon} />
            <Text size="xl" weight="bold" style={{ color: Colors.primary }}>
              {formatMoney(invoice.amount)}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
  headerTitleBlock: {
    flex: 1,
    paddingStart: rs(10),
  },
  statusBadge: {
    paddingHorizontal: rs(10),
    paddingVertical: rvs(5),
    borderRadius: rs(10),
  },
  totalCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
    paddingVertical: rvs(16),
  },
  totalValueRow: {
    flexDirection: "row",
    alignItems: "center",
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
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: rvs(12),
    gap: rs(10),
  },
  itemInfo: {
    flex: 1,
  },
  itemMeta: {
    marginTop: rvs(3),
  },
  riyalIcon: {
    marginRight: rs(4),
  },
});
