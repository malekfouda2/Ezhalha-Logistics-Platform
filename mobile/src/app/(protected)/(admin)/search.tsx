// app/(protected)/(admin)/search.tsx
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { SaudiRiyal } from "lucide-react-native";

import { Text } from "@/components/ui/Text";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AdminDrawer } from "@/components/layout/AdminDrawer";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useAdminSearch } from "@/lib/hooks/useAdminSearch";

export default function AdminSearchScreen() {
  const { t } = useTranslation();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const {
    query,
    setQuery,
    isSearchable,
    isLoading,
    hasResults,
    canSearchClients,
    canSearchShipments,
    canSearchInvoices,
    clients,
    shipments,
    invoices,
  } = useAdminSearch();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => setDrawerVisible(true)} hitSlop={rs(8)}>
          <Ionicons name="menu" size={rs(20)} color={Colors.text} />
        </Pressable>

        <Text size="large" weight="bold" style={styles.title}>
          {t("admin.search.title")}
        </Text>

        <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={rs(8)}>
          <Ionicons name="close" size={rs(20)} color={Colors.text} />
        </Pressable>
      </View>

      <View style={styles.searchBar}>
        <Feather name="search" size={rs(16)} color={Colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("admin.search.placeholder")}
          placeholderTextColor={Colors.placeholder}
          style={styles.searchInput}
          autoFocus
          returnKeyType="search"
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {!isSearchable ? (
          <View style={styles.hint}>
            <Text size="small" dimRate="55%" style={styles.hintText}>
              {t("admin.search.hintMinLength")}
            </Text>
          </View>
        ) : isLoading ? (
          <View style={styles.hint}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : !hasResults ? (
          <View style={styles.hint}>
            <Text size="small" dimRate="55%" style={styles.hintText}>
              {t("admin.search.noResults", { query })}
            </Text>
          </View>
        ) : (
          <>
            {canSearchClients && clients.length > 0 && (
              <View style={styles.section}>
                <Text size="medium" weight="bold" style={styles.sectionTitle}>
                  {t("admin.search.sections.clients")}
                </Text>
                <View style={styles.card}>
                  {clients.map((client, index) => (
                    <View
                      key={client.id}
                      style={[styles.row, index !== clients.length - 1 && styles.rowBorder]}
                    >
                      <View style={styles.avatar}>
                        <Text size="small" weight="bold" style={styles.avatarText}>
                          {client.name.slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.rowInfo}>
                        <Text size="medium" weight="bold" numberOfLines={1}>
                          {client.name}
                        </Text>
                        <Text size="xs" dimRate="55%" numberOfLines={1} style={styles.rowSubtitle}>
                          {t("admin.search.clientMeta", {
                            accountNumber: client.accountNumber,
                            profile: client.profile,
                            status: t(client.isActive ? "admin.search.active" : "admin.search.inactive"),
                          })}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={rs(16)} color={Colors.textSecondary} />
                    </View>
                  ))}
                </View>
              </View>
            )}

            {canSearchShipments && shipments.length > 0 && (
              <View style={styles.section}>
                <Text size="medium" weight="bold" style={styles.sectionTitle}>
                  {t("admin.search.sections.shipments")}
                </Text>
                <View style={styles.card}>
                  {shipments.map((shipment, index) => (
                    <View
                      key={shipment.id}
                      style={[styles.row, index !== shipments.length - 1 && styles.rowBorder]}
                    >
                      <View style={styles.iconBox}>
                        <Feather name="hexagon" size={rs(18)} color={Colors.primary} />
                      </View>
                      <View style={styles.rowInfo}>
                        <Text size="medium" weight="bold" numberOfLines={1}>
                          {shipment.trackingNumber}
                        </Text>
                        <Text size="xs" dimRate="55%" numberOfLines={1} style={styles.rowSubtitle}>
                          {shipment.senderCity} → {shipment.recipientCity}
                        </Text>
                      </View>
                      <StatusBadge status={shipment.status} />
                    </View>
                  ))}
                </View>
              </View>
            )}

            {canSearchInvoices && invoices.length > 0 && (
              <View style={styles.section}>
                <Text size="medium" weight="bold" style={styles.sectionTitle}>
                  {t("admin.search.sections.invoices")}
                </Text>
                <View style={styles.card}>
                  {invoices.map((invoice, index) => (
                    <View
                      key={invoice.id}
                      style={[styles.row, index !== invoices.length - 1 && styles.rowBorder]}
                    >
                      <View style={styles.iconBox}>
                        <Feather name="file-text" size={rs(18)} color={Colors.primary} />
                      </View>
                      <View style={styles.rowInfo}>
                        <Text size="medium" weight="bold" numberOfLines={1}>
                          {invoice.invoiceNumber}
                        </Text>
                        <Text size="xs" dimRate="55%" numberOfLines={1} style={styles.rowSubtitle}>
                          {t("admin.search.dueDate", {
                            date: new Date(invoice.dueDate).toLocaleDateString(),
                          })}
                        </Text>
                      </View>
                      <View style={styles.priceRow}>
                        <SaudiRiyal size={rs(12)} color={Colors.text} style={styles.currencyIcon} />
                        <Text size="small" weight="bold">
                          {Number(invoice.amount).toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={rs(16)} color="#9A7410" />
          <Text size="xs" style={styles.infoText}>
            {t("admin.search.info")}
          </Text>
        </View>
      </ScrollView>

      <AdminDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(16),
    paddingTop: rvs(16),
    paddingBottom: rvs(12),
  },
  iconButton: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(12),
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    marginStart: rs(12),
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(8),
    marginHorizontal: rs(16),
    marginBottom: rvs(14),
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
    height: rvs(48),
  },
  searchInput: {
    flex: 1,
    fontSize: rs(14),
    color: Colors.text,
  },
  content: {
    paddingHorizontal: rs(16),
    paddingBottom: rvs(32),
  },
  hint: {
    minHeight: rvs(120),
    alignItems: "center",
    justifyContent: "center",
  },
  hintText: {
    textAlign: "center",
  },
  section: {
    marginBottom: rvs(16),
  },
  sectionTitle: {
    marginBottom: rvs(8),
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
    paddingHorizontal: rs(14),
    paddingVertical: rvs(13),
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#ECEEF1",
  },
  avatar: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(12),
    backgroundColor: "#FDE4D6",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: Colors.primary,
  },
  iconBox: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(12),
    backgroundColor: "#F4F6F8",
    alignItems: "center",
    justifyContent: "center",
  },
  rowInfo: {
    flex: 1,
  },
  rowSubtitle: {
    marginTop: rvs(3),
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  currencyIcon: {
    marginEnd: rs(3),
  },
  infoBox: {
    flexDirection: "row",
    gap: rs(10),
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: rs(14),
    padding: rs(14),
    marginTop: rvs(4),
  },
  infoText: {
    flex: 1,
    color: "#92400E",
  },
});
