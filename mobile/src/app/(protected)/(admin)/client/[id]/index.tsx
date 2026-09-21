// app/(protected)/(admin)/client/[id]/index.tsx
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { BackButton } from "@/components/ui/BackButton";
import { InfoCard, InfoRow, SectionLabel } from "@/components/ui/InfoCard";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { formatMoney } from "@/utils/invoiceFormat";
import { useAdminClientAnalytics, useAdminClientDetails, useAdminClientProfileOptions } from "@/lib/hooks/useAdminClients";
import { humanizeProfileSlug } from "@/components/sections/clients/profileBadge";

type TabKey = "overview" | "shipments" | "invoices" | "documents";

const FULFILLMENT_BUCKET: Record<string, "express" | "local" | "freight"> = {
  local: "local",
  ddp_manual: "freight",
  dg_manual: "express",
  carrier: "express",
};

function bucketOf(fulfillmentType: string): "express" | "local" | "freight" {
  return FULFILLMENT_BUCKET[fulfillmentType] ?? "express";
}

function StatCard({ label, value, trend, sub }: { label: string; value: string; trend?: string; sub?: string }) {
  return (
    <View style={styles.statCard}>
      <Text size="xs" weight="semibold" dimRate="55%" textTransform="uppercase">
        {label}
      </Text>
      <Text size="xxl" weight="bold" style={styles.statValue}>
        {value}
      </Text>
      {trend ? (
        <Text size="xs" weight="semibold" style={styles.statTrendPositive}>
          {trend}
        </Text>
      ) : sub ? (
        <Text size="xs" weight="semibold" dimRate="60%">
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

export default function AdminClientDetailScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const { data: client, isLoading: isClientLoading } = useAdminClientDetails(id);
  const { data: analytics, isLoading: isAnalyticsLoading } = useAdminClientAnalytics(id);
  const { data: profileOptions } = useAdminClientProfileOptions();

  const profileLabel = useMemo(() => {
    if (!client) return "";
    return profileOptions?.find((option) => option.profile === client.profile)?.displayName ?? humanizeProfileSlug(client.profile);
  }, [client, profileOptions]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: t("adminClientsScreen.detail.tabs.overview") },
    { key: "shipments", label: t("adminClientsScreen.detail.tabs.shipments") },
    { key: "invoices", label: t("adminClientsScreen.detail.tabs.invoices") },
    { key: "documents", label: t("adminClientsScreen.detail.tabs.documents") },
  ];

  const handleTabPress = (key: TabKey) => {
    if (key === "documents") {
      router.push(`/(protected)/(admin)/client/${id}/documents`);
      return;
    }
    setActiveTab(key);
  };

  if (isClientLoading || !client) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  const monthKey = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
  const thisMonthShipments = analytics?.monthly.find((m) => m.month === monthKey)?.shipments;

  const creditLimit = analytics?.credit.limit ?? 0;
  const creditUsed = analytics?.credit.outstanding ?? 0;
  const creditPct = creditLimit > 0 ? Math.round((creditUsed / creditLimit) * 100) : 0;

  const fulfillmentTotals = { express: 0, freight: 0, local: 0 };
  Object.entries(analytics?.breakdown.byFulfillment ?? {}).forEach(([type, count]) => {
    fulfillmentTotals[bucketOf(type)] += count;
  });
  const mixTotal = fulfillmentTotals.express + fulfillmentTotals.freight + fulfillmentTotals.local;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton />
        <View style={styles.headerTitleBlock}>
          <Text size="medium" weight="bold" numberOfLines={1}>
            {client.companyName || client.name}
          </Text>
          <Text size="small" dimRate="60%" numberOfLines={1}>
            {client.accountNumber} · {profileLabel} · {t(client.isActive ? "adminClientsScreen.status.active" : "adminClientsScreen.status.inactive")}
          </Text>
        </View>
        <Pressable style={styles.iconButton} onPress={() => router.push(`/(protected)/(admin)/client/${id}/edit`)} hitSlop={rs(8)}>
          <Ionicons name="options-outline" size={rs(20)} color={Colors.text} />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <Pressable key={tab.key} onPress={() => handleTabPress(tab.key)} style={[styles.tabChip, active && styles.tabChipActive]}>
              <Text size="small" weight="bold" style={{ color: active ? Colors.white : Colors.text }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === "overview" &&
          (isAnalyticsLoading || !analytics ? (
            <ActivityIndicator color={Colors.primary} style={styles.loading} />
          ) : (
            <>
              <View style={styles.statsGrid}>
                <StatCard
                  label={t("adminClientsScreen.detail.stats.shipments")}
                  value={String(analytics.totals.shipments)}
                  trend={thisMonthShipments ? t("adminClientsScreen.detail.stats.thisMonth", { count: thisMonthShipments }) : undefined}
                />
                <StatCard
                  label={t("adminClientsScreen.detail.stats.billedLifetime")}
                  value={`SAR ${formatMoney(analytics.totals.grossBilledSar)}`}
                  sub={t("adminClientsScreen.detail.stats.margin", { pct: analytics.totals.marginPct })}
                />
                <StatCard
                  label={t("adminClientsScreen.detail.stats.outstanding")}
                  value={`SAR ${formatMoney(analytics.totals.outstandingSar)}`}
                  sub={t("adminClientsScreen.detail.stats.invoicesDue", { count: analytics.invoices.openCount })}
                />
                <StatCard
                  label={t("adminClientsScreen.detail.stats.creditUsed")}
                  value={`SAR ${formatMoney(creditUsed)}`}
                  sub={t("adminClientsScreen.detail.stats.ofLimit", { pct: creditPct, limit: formatMoney(creditLimit) })}
                />
              </View>

              <SectionLabel>{t("adminClientsScreen.detail.relationship")}</SectionLabel>
              <InfoCard>
                <InfoRow
                  label={t("adminClientsScreen.detail.accountManager")}
                  value={client.assignedAccountManager?.username ?? t("adminClientsScreen.card.unassigned")}
                />
                <InfoRow label={t("adminClientsScreen.detail.pricingProfile")} value={profileLabel} />
                <InfoRow label={t("adminClientsScreen.detail.accountType")} value={t(`adminClientsScreen.accountType.${client.accountType}`, { defaultValue: client.accountType })} />
                <InfoRow label={t("adminClientsScreen.detail.primaryContact")} value={client.name} />
                <InfoRow
                  label={t("adminClientsScreen.detail.clientSince")}
                  value={new Date(client.createdAt).toLocaleDateString(i18n.language === "ar" ? "ar-SA" : "en-US", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                />
              </InfoCard>

              <SectionLabel>{t("adminClientsScreen.detail.shipmentMix")}</SectionLabel>
              {mixTotal > 0 ? (
                <View style={styles.mixCard}>
                  <View style={styles.mixBar}>
                    {fulfillmentTotals.express > 0 && (
                      <View style={[styles.mixSegment, { flex: fulfillmentTotals.express, backgroundColor: Colors.primary }]} />
                    )}
                    {fulfillmentTotals.freight > 0 && (
                      <View style={[styles.mixSegment, { flex: fulfillmentTotals.freight, backgroundColor: "#3B82F6" }]} />
                    )}
                    {fulfillmentTotals.local > 0 && (
                      <View style={[styles.mixSegment, { flex: fulfillmentTotals.local, backgroundColor: "#22C55E" }]} />
                    )}
                  </View>
                  <View style={styles.mixLegendRow}>
                    <Text size="xs" weight="semibold" dimRate="65%">
                      {t("adminClientsScreen.detail.mix.express", { count: fulfillmentTotals.express })}
                    </Text>
                    <Text size="xs" weight="semibold" dimRate="65%">
                      {t("adminClientsScreen.detail.mix.freight", { count: fulfillmentTotals.freight })}
                    </Text>
                    <Text size="xs" weight="semibold" dimRate="65%">
                      {t("adminClientsScreen.detail.mix.local", { count: fulfillmentTotals.local })}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.mixCard}>
                  <Text size="small" dimRate="55%">
                    {t("adminClientsScreen.detail.noShipments")}
                  </Text>
                </View>
              )}

              <SectionLabel>{t("adminClientsScreen.detail.whereTheyShip")}</SectionLabel>
              {analytics.breakdown.topDestinations.length > 0 ? (
                <InfoCard>
                  {analytics.breakdown.topDestinations.map((row) => (
                    <InfoRow
                      key={row.key}
                      label={row.key}
                      value={t("adminClientsScreen.detail.shipmentsCount", { count: row.count })}
                    />
                  ))}
                </InfoCard>
              ) : (
                <View style={styles.mixCard}>
                  <Text size="small" dimRate="55%">
                    {t("adminClientsScreen.detail.noShipments")}
                  </Text>
                </View>
              )}
            </>
          ))}

        {activeTab === "shipments" && (
          <>
            <SectionLabel>{t("adminClientsScreen.detail.tabs.shipments")}</SectionLabel>
            <InfoCard>
              <InfoRow label={t("adminClientsScreen.detail.totalShipments")} value={String(client.shipmentCount)} />
            </InfoCard>
            <Text size="small" dimRate="55%" style={styles.webOnlyNote}>
              {t("adminClientsScreen.detail.webOnlyShipments")}
            </Text>
          </>
        )}

        {activeTab === "invoices" && (
          <>
            <SectionLabel>{t("adminClientsScreen.detail.tabs.invoices")}</SectionLabel>
            <InfoCard>
              <InfoRow label={t("adminClientsScreen.detail.totalInvoices")} value={String(client.invoiceCount)} />
            </InfoCard>
            <Text size="small" dimRate="55%" style={styles.webOnlyNote}>
              {t("adminClientsScreen.detail.webOnlyInvoices")}
            </Text>
          </>
        )}
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: rs(16),
    paddingTop: rvs(16),
    paddingBottom: rvs(12),
  },
  headerTitleBlock: {
    flex: 1,
    marginHorizontal: rs(10),
  },
  iconButton: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(12),
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  tabsRow: {
    gap: rs(8),
    paddingHorizontal: rs(16),
    paddingBottom: rvs(12),
  },
  tabChip: {
    paddingHorizontal: rs(16),
    paddingVertical: rvs(9),
    borderRadius: rs(18),
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  content: {
    paddingHorizontal: rs(16),
    paddingBottom: rvs(32),
  },
  loading: {
    marginTop: rvs(60),
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: rs(12),
    marginBottom: rvs(4),
  },
  statCard: {
    width: "47%",
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    padding: rs(14),
    marginBottom: rvs(4),
  },
  statValue: {
    marginTop: rvs(6),
    marginBottom: rvs(4),
  },
  statTrendPositive: {
    color: "#1E9E4B",
  },
  mixCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    padding: rs(14),
    marginBottom: rvs(20),
  },
  mixBar: {
    flexDirection: "row",
    height: rvs(10),
    borderRadius: rs(6),
    overflow: "hidden",
    backgroundColor: Colors.background,
  },
  mixSegment: {
    height: "100%",
  },
  mixLegendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: rvs(10),
  },
  webOnlyNote: {
    marginTop: rvs(4),
    lineHeight: rs(18),
  },
});
