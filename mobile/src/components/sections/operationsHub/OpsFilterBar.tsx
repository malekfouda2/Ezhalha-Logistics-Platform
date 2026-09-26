// Dropdown filter pills under a queue's tabs — the mobile take on the web hub's filter-bar.
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import {
  filterOptionLabel,
  filterOptions,
  type QueueFilterKey,
  type QueueFilters,
} from "@/components/sections/operationsHub/opsFormat";
import type { OperationShipmentSummary } from "@/lib/services/adminOperations";

interface OpsFilterBarProps {
  keys: QueueFilterKey[];
  rows: OperationShipmentSummary[];
  filters: QueueFilters;
  onChange: (filters: QueueFilters) => void;
}

export function OpsFilterBar({ keys, rows, filters, onChange }: OpsFilterBarProps) {
  const { t } = useTranslation();
  const [openKey, setOpenKey] = useState<QueueFilterKey | null>(null);

  const hasActive = keys.some((key) => !!filters[key]);
  const options = openKey ? filterOptions(openKey, rows) : [];

  const select = (key: QueueFilterKey, value: string | undefined) => {
    onChange({ ...filters, [key]: value });
    setOpenKey(null);
  };

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scrollView}
        contentContainerStyle={styles.row}
      >
        {keys.map((key) => {
          const value = filters[key];
          return (
            <Pressable
              key={key}
              onPress={() => setOpenKey(key)}
              style={[styles.pill, value ? styles.pillActive : undefined]}
            >
              <Text
                size="xs"
                weight="semibold"
                numberOfLines={1}
                style={[styles.pillText, { color: value ? Colors.primary : Colors.text }]}
              >
                {value ? filterOptionLabel(key, value, t) : t(`adminOperations.filters.keys.${key}`)}
              </Text>
              <Ionicons name="chevron-down" size={rs(13)} color={value ? Colors.primary : Colors.textSecondary} />
            </Pressable>
          );
        })}
        {hasActive ? (
          <Pressable onPress={() => onChange({})} style={styles.pill}>
            <Text size="xs" weight="semibold">
              {t("adminOperations.filters.clear")}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <BottomSheet visible={openKey !== null} onClose={() => setOpenKey(null)}>
        {openKey ? (
          <>
            <Text size="large" weight="bold" style={styles.sheetTitle}>
              {t(`adminOperations.filters.keys.${openKey}`)}
            </Text>
            <ScrollView style={styles.sheetScroll} bounces={false}>
              <View style={styles.sheetCard}>
                {[undefined, ...options].map((option, index) => {
                  const selected = (filters[openKey] ?? undefined) === option;
                  return (
                    <Pressable
                      key={option ?? "__any"}
                      onPress={() => select(openKey, option)}
                      style={[styles.sheetRow, index > 0 && styles.sheetRowDivider]}
                    >
                      <Text
                        size="medium"
                        weight={selected ? "bold" : "regular"}
                        style={selected ? { color: Colors.primary } : undefined}
                      >
                        {option ? filterOptionLabel(openKey, option, t) : t("adminOperations.filters.any")}
                      </Text>
                      {selected ? <Ionicons name="checkmark" size={rs(18)} color={Colors.primary} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </>
        ) : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flexGrow: 0,
    flexShrink: 0,
  },
  row: {
    gap: rs(6),
    paddingHorizontal: rs(16),
    paddingBottom: rvs(12),
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(4),
    height: rvs(30),
    paddingHorizontal: rs(12),
    borderRadius: rs(15),
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillActive: {
    borderColor: Colors.primary,
    backgroundColor: "#FFF3EC",
  },
  pillText: {
    maxWidth: rs(140),
  },
  sheetTitle: {
    marginBottom: rvs(12),
  },
  sheetScroll: {
    maxHeight: rvs(420),
  },
  sheetCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: rvs(14),
  },
  sheetRowDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
