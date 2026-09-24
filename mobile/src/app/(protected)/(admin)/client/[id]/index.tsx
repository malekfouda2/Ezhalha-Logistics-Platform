// app/(protected)/(admin)/client/[id]/index.tsx
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SaudiRiyal } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { BackButton } from "@/components/ui/BackButton";
import { InfoCard, InfoRow, SectionLabel } from "@/components/ui/InfoCard";
import { StatCard } from "@/components/sections/dashboard/StatCard";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { formatMoney } from "@/utils/invoiceFormat";
import {
  useAdminClientAnalytics,
  useAdminClientDetails,
  useAdminClientProfileOptions,
} from "@/lib/hooks/useAdminClients";
import { humanizeProfileSlug } from "@/components/sections/clients/profileBadge";
import { carrierBrandName } from "@shared/carriers";
import { COUNTRY_CODE_OPTIONS } from "@shared/countries";

type TabKey = "overview" | "shipments" | "invoices" | "credit" | "documents";

const COUNTRY_NAMES = new Map(COUNTRY_CODE_OPTIONS.map((c) => [c.code, c.name]));

function countryName(code: string) {
  return COUNTRY_NAMES.get(code) ?? code;
}

const FULFILLMENT_LABELS: Record<string, string> = {
  carrier: "adminClientsScreen.detail.fulfillment.express",
  local: "adminClientsScreen.detail.fulfillment.local",
  ddp_manual: "adminClientsScreen.detail.fulfillment.doorToDoor",
};

const FULFILLMENT_BUCKET: Record<string, "express" | "local" | "freight"> = {
  local: "local",
  ddp_manual: "freight",
  dg_manual: "express",
  carrier: "express",
};

function bucketOf(fulfillmentType: string): "express" | "local" | "freight" {
  return FULFILLMENT_BUCKET[fulfillmentType] ?? "express";
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text size="medium" weight="bold" style={styles.sectionTitle}>
      {children}
    </Text>
  );
}

function MoneyValue({ amount, color }: { amount: number; color?: string }) {
  return (
    <View style={styles.moneyRow}>
      <SaudiRiyal size={rs(13)} color={color ?? Colors.text} style={styles.moneyIcon} />
      <Text size="small" weight="bold" style={color ? { color } : undefined}>
        {formatMoney(amount)}
      </Text>
    </View>
  );
}

function CountMoneyValue({ count, amount, color }: { count: number; amount: number; color?: string }) {
  return (
    <View style={styles.moneyRow}>
      <Text size="small" weight="bold" style={color ? { color } : undefined}>
        {count} ·{" "}
      </Text>
      <SaudiRiyal size={rs(13)} color={color ?? Colors.text} style={styles.moneyIcon} />
      <Text size="small" weight="bold" style={color ? { color } : undefined}>
        {formatMoney(amount)}
      </Text>
    </View>
  );
}

export default function AdminClientDetailScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const { data: client, isLoading: isClientLoading } =
    useAdminClientDetails(id);
  const { data: analytics, isLoading: isAnalyticsLoading } =
    useAdminClientAnalytics(id);
  const { data: profileOptions } = useAdminClientProfileOptions();

  const profileLabel = useMemo(() => {
    if (!client) return "";
    return (
      profileOptions?.find((option) => option.profile === client.profile)
        ?.displayName ?? humanizeProfileSlug(client.profile)
    );
  }, [client, profileOptions]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: t("adminClientsScreen.detail.tabs.overview") },
    { key: "shipments", label: t("adminClientsScreen.detail.tabs.shipments") },
    { key: "invoices", label: t("adminClientsScreen.detail.tabs.invoices") },
    { key: "credit", label: t("adminClientsScreen.detail.tabs.credit") },
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
  const thisMonthShipments = analytics?.monthly.find(
    (m) => m.month === monthKey,
  )?.shipments;

  const creditLimit = analytics?.credit.limit ?? 0;
  const creditUsed = analytics?.credit.outstanding ?? 0;
  const creditPct =
    creditLimit > 0 ? Math.round((creditUsed / creditLimit) * 100) : 0;

  const fulfillmentTotals = { express: 0, freight: 0, local: 0 };
  Object.entries(analytics?.breakdown.byFulfillment ?? {}).forEach(
    ([type, count]) => {
      fulfillmentTotals[bucketOf(type)] += count;
    },
  );
  const mixTotal =
    fulfillmentTotals.express +
    fulfillmentTotals.freight +
    fulfillmentTotals.local;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton />
        <View style={styles.headerTitleBlock}>
          <Text size="medium" weight="bold" numberOfLines={1}>
            {client.name || client.companyName}
          </Text>
          <Text size="small" dimRate="60%" numberOfLines={1}>
            {client.accountNumber} · {profileLabel} ·{" "}
            {t(
              client.isActive
                ? "adminClientsScreen.status.active"
                : "adminClientsScreen.status.inactive",
            )}
          </Text>
        </View>
        <Pressable
          style={styles.iconButton}
          onPress={() => router.push(`/(protected)/(admin)/client/${id}/edit`)}
          hitSlop={rs(8)}
        >
          <Ionicons name="options-outline" size={rs(20)} color={Colors.text} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScrollView}
        contentContainerStyle={styles.tabsRow}
      >
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              onPress={() => handleTabPress(tab.key)}
              style={[styles.tabChip, active && styles.tabChipActive]}
            >
              <Text
                size="small"
                weight="bold"
                style={{ color: active ? Colors.white : Colors.text }}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={styles.contentScrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "overview" &&
          (isAnalyticsLoading || !analytics ? (
            <ActivityIndicator color={Colors.primary} style={styles.loading} />
          ) : (
            <>
              <View style={styles.statsGrid}>
                <StatCard
                  title={t("adminClientsScreen.detail.stats.shipments")}
                  value={String(analytics.totals.activeShipments)}
                  icon="package"
                  subtitle={
                    thisMonthShipments
                      ? t("adminClientsScreen.detail.stats.thisMonth", {
                          count: thisMonthShipments,
                        })
                      : undefined
                  }
                  subtitleColor="#16713B"
                />
                <StatCard
                  title={t("adminClientsScreen.detail.stats.billedLifetime")}
                  value={formatMoney(analytics.totals.grossBilledSar)}
                  valuePrefix
                  icon="dollar-sign"
                  subtitle={t("adminClientsScreen.detail.stats.margin", {
                    pct: analytics.totals.marginPct,
                  })}
                />
                <StatCard
                  title={t("adminClientsScreen.detail.stats.outstanding")}
                  value={formatMoney(analytics.totals.outstandingSar)}
                  valuePrefix
                  icon="file-text"
                  subtitle={t("adminClientsScreen.detail.stats.invoicesDue", {
                    count: analytics.invoices.openCount,
                  })}
                  subtitleColor="#9A7410"
                />
                <StatCard
                  title={t("adminClientsScreen.detail.stats.creditUsed")}
                  value={formatMoney(creditUsed)}
                  valuePrefix
                  icon="credit-card"
                  subtitle={t("adminClientsScreen.detail.stats.ofLimit", {
                    pct: creditPct,
                    limit: formatMoney(creditLimit),
                  })}
                  subtitleColor="#9A7410"
                />
              </View>

              <SectionTitle>
                {t("adminClientsScreen.detail.relationship")}
              </SectionTitle>
              <InfoCard>
                <InfoRow
                  label={t("adminClientsScreen.detail.accountManager")}
                  value={
                    client.assignedAccountManager?.username ??
                    t("adminClientsScreen.card.unassigned")
                  }
                />
                <InfoRow
                  label={t("adminClientsScreen.detail.pricingProfile")}
                  value={profileLabel}
                />
                <InfoRow
                  label={t("adminClientsScreen.detail.accountType")}
                  value={t(
                    `adminClientsScreen.accountType.${client.accountType}`,
                    { defaultValue: client.accountType },
                  )}
                />
                <InfoRow
                  label={t("adminClientsScreen.detail.primaryContact")}
                  value={client.name}
                />
                <InfoRow
                  label={t("adminClientsScreen.detail.clientSince")}
                  value={new Date(client.createdAt).toLocaleDateString(
                    i18n.language === "ar" ? "ar-SA" : "en-US",
                    {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    },
                  )}
                />
              </InfoCard>

              <SectionTitle>
                {t("adminClientsScreen.detail.shipmentMix")}
              </SectionTitle>
              {mixTotal > 0 ? (
                <View style={styles.mixCard}>
                  <View style={styles.mixBar}>
                    {fulfillmentTotals.express > 0 && (
                      <View
                        style={[
                          styles.mixSegment,
                          {
                            flex: fulfillmentTotals.express,
                            backgroundColor: Colors.primary,
                          },
                        ]}
                      />
                    )}
                    {fulfillmentTotals.freight > 0 && (
                      <View
                        style={[
                          styles.mixSegment,
                          {
                            flex: fulfillmentTotals.freight,
                            backgroundColor: "#3B82F6",
                          },
                        ]}
                      />
                    )}
                    {fulfillmentTotals.local > 0 && (
                      <View
                        style={[
                          styles.mixSegment,
                          {
                            flex: fulfillmentTotals.local,
                            backgroundColor: "#22C55E",
                          },
                        ]}
                      />
                    )}
                  </View>
                  <View style={styles.mixLegendRow}>
                    <Text size="xs" weight="semibold" dimRate="65%">
                      {t("adminClientsScreen.detail.mix.express", {
                        count: fulfillmentTotals.express,
                      })}
                    </Text>
                    <Text size="xs" weight="semibold" dimRate="65%">
                      {t("adminClientsScreen.detail.mix.freight", {
                        count: fulfillmentTotals.freight,
                      })}
                    </Text>
                    <Text size="xs" weight="semibold" dimRate="65%">
                      {t("adminClientsScreen.detail.mix.local", {
                        count: fulfillmentTotals.local,
                      })}
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

              <SectionTitle>
                {t("adminClientsScreen.detail.carriers.title")}
              </SectionTitle>
              {analytics.breakdown.byCarrier.length > 0 ? (
                <InfoCard>
                  {analytics.breakdown.byCarrier.map((row) => (
                    <InfoRow
                      key={row.carrierCode || "unassigned"}
                      label={
                        carrierBrandName(row.carrierCode) ||
                        t("adminClientsScreen.detail.carriers.notAssigned")
                      }
                      valueNode={
                        <View style={styles.carrierValue}>
                          <Text size="xs" dimRate="60%" style={styles.carrierShipmentsText}>
                            {t("adminClientsScreen.detail.shipmentsCount", { count: row.shipments })} ·
                          </Text>
                          <MoneyValue amount={row.revenueSar} />
                        </View>
                      }
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

              <SectionTitle>
                {t("adminClientsScreen.detail.whereTheyShip")}
              </SectionTitle>

              <SectionLabel>
                {t("adminClientsScreen.detail.topOrigins")}
              </SectionLabel>
              {analytics.breakdown.topOrigins.length > 0 ? (
                <InfoCard>
                  {analytics.breakdown.topOrigins.map((row) => (
                    <InfoRow
                      key={row.key}
                      label={countryName(row.key)}
                      value={String(row.count)}
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

              <SectionLabel>
                {t("adminClientsScreen.detail.topDestinations")}
              </SectionLabel>
              {analytics.breakdown.topDestinations.length > 0 ? (
                <InfoCard>
                  {analytics.breakdown.topDestinations.map((row) => (
                    <InfoRow
                      key={row.key}
                      label={countryName(row.key)}
                      value={String(row.count)}
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

        {activeTab === "shipments" &&
          (isAnalyticsLoading || !analytics ? (
            <ActivityIndicator color={Colors.primary} style={styles.loading} />
          ) : (
            <>
              {Object.keys(analytics.breakdown.byFulfillment).length === 0 &&
              Object.keys(analytics.breakdown.byStatus).length === 0 ? (
                <View style={styles.mixCard}>
                  <Text size="small" dimRate="55%">
                    {t("adminClientsScreen.detail.noShipments")}
                  </Text>
                </View>
              ) : (
                <InfoCard>
                  {Object.entries(analytics.breakdown.byFulfillment).map(
                    ([type, count]) => (
                      <InfoRow
                        key={type}
                        label={
                          FULFILLMENT_LABELS[type]
                            ? t(FULFILLMENT_LABELS[type])
                            : type
                        }
                        value={String(count)}
                      />
                    ),
                  )}
                  {Object.entries(analytics.breakdown.byStatus).map(
                    ([status, count]) => (
                      <InfoRow
                        key={status}
                        label={status.replace(/_/g, " ")}
                        labelSize="xs"
                        value={String(count)}
                        valueSize="small"
                        valueWeight="regular"
                        valueColor={Colors.secondary}
                      />
                    ),
                  )}
                </InfoCard>
              )}
            </>
          ))}

        {activeTab === "invoices" &&
          (isAnalyticsLoading || !analytics ? (
            <ActivityIndicator color={Colors.primary} style={styles.loading} />
          ) : (
            <>
              <InfoCard>
                <InfoRow
                  label={t("adminClientsScreen.detail.invoicesBreakdown.paid")}
                  valueNode={
                    <CountMoneyValue count={analytics.invoices.paidCount} amount={analytics.invoices.paidSar} />
                  }
                />
                <InfoRow
                  label={t("adminClientsScreen.detail.invoicesBreakdown.open")}
                  valueNode={
                    <CountMoneyValue count={analytics.invoices.openCount} amount={analytics.invoices.openSar} />
                  }
                />
                <InfoRow
                  label={t(
                    "adminClientsScreen.detail.invoicesBreakdown.overdue",
                  )}
                  valueNode={
                    <CountMoneyValue
                      count={analytics.invoices.overdueCount}
                      amount={analytics.invoices.overdueSar}
                      color={analytics.invoices.overdueCount > 0 ? Colors.error : undefined}
                    />
                  }
                />
              </InfoCard>
            </>
          ))}

        {activeTab === "credit" &&
          (isAnalyticsLoading || !analytics ? (
            <ActivityIndicator color={Colors.primary} style={styles.loading} />
          ) : (
            <>
              {analytics.credit.enabled ? (
                <InfoCard>
                  <InfoRow
                    label={t("adminClientsScreen.edit.pricing.creditLimit")}
                    valueNode={<MoneyValue amount={analytics.credit.limit} />}
                  />
                  <InfoRow
                    label={t("adminClientsScreen.edit.pricing.outstanding")}
                    valueNode={<MoneyValue amount={analytics.credit.outstanding} />}
                  />
                  <InfoRow
                    label={t("adminClientsScreen.edit.pricing.available")}
                    valueNode={<MoneyValue amount={analytics.credit.available} color="#1E9E4B" />}
                  />
                </InfoCard>
              ) : (
                <View style={styles.mixCard}>
                  <Text size="small" dimRate="55%">
                    {t("adminClientsScreen.detail.creditNotEnabled")}
                  </Text>
                </View>
              )}
            </>
          ))}
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
  tabsScrollView: {
    flexGrow: 0,
    flexShrink: 0,
  },
  tabsRow: {
    flexGrow: 0,
    alignItems: "flex-start",
    gap: rs(8),
    paddingHorizontal: rs(16),
    paddingBottom: rvs(12),
  },
  contentScrollView: {
    flex: 1,
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
    justifyContent: "space-between",
  },
  sectionTitle: {
    marginBottom: rvs(10),
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
  moneyRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  moneyIcon: {
    marginHorizontal: rs(3),
  },
  carrierValue: {
    flexDirection: "row",
    alignItems: "center",
  },
  carrierShipmentsText: {
    marginRight: rs(4),
  },
});
