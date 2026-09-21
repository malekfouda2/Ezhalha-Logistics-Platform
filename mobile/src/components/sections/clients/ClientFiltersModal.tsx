import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { ChipSelect } from "@/components/ui/ChipSelect";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { useAdminAccountManagerOptions, useAdminClientProfileOptions } from "@/lib/hooks/useAdminClients";

export interface ClientFilters {
  status: "all" | "active" | "inactive";
  profile: string | null;
  accountManagerUserId: string | null;
  salesFeaturesEnabled: boolean;
}

export const EMPTY_CLIENT_FILTERS: ClientFilters = {
  status: "all",
  profile: null,
  accountManagerUserId: null,
  salesFeaturesEnabled: false,
};

export function countActiveClientFilters(filters: ClientFilters): number {
  let count = 0;
  if (filters.status !== "all") count += 1;
  if (filters.profile) count += 1;
  if (filters.accountManagerUserId) count += 1;
  if (filters.salesFeaturesEnabled) count += 1;
  return count;
}

interface ClientFiltersModalProps {
  visible: boolean;
  initialFilters: ClientFilters;
  matchCount?: number;
  onClose: () => void;
  onApply: (filters: ClientFilters) => void;
}

export function ClientFiltersModal({ visible, initialFilters, matchCount, onClose, onApply }: ClientFiltersModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { hasPermission } = useAdminAccess();
  const canReadAccountManagers = hasPermission("account-managers", "read");

  const { data: profileOptions } = useAdminClientProfileOptions();
  const { data: accountManagers } = useAdminAccountManagerOptions();

  const [draft, setDraft] = useState<ClientFilters>(initialFilters);
  const [managerPickerOpen, setManagerPickerOpen] = useState(false);

  useEffect(() => {
    if (visible) setDraft(initialFilters);
  }, [visible, initialFilters]);

  const activeCount = countActiveClientFilters(draft);

  const selectedManagerLabel =
    draft.accountManagerUserId === null
      ? t("adminClientsScreen.filters.anyManager")
      : draft.accountManagerUserId === "unassigned"
        ? t("adminClientsScreen.filters.unassigned")
        : accountManagers?.find((m) => m.id === draft.accountManagerUserId)?.username ??
          t("adminClientsScreen.filters.anyManager");

  const profileChipOptions = [
    { value: "", label: t("adminClientsScreen.filters.allProfiles") },
    ...(profileOptions ?? []).map((option) => ({ value: option.profile, label: option.displayName })),
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.container, { paddingBottom: rvs(20) + insets.bottom }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text size="medium" weight="bold">
              {t("adminClientsScreen.filters.title")}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={rs(24)} color={Colors.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            <ChipSelect
              label={t("adminClientsScreen.filters.status")}
              value={draft.status}
              onChange={(value) => setDraft((prev) => ({ ...prev, status: value as ClientFilters["status"] }))}
              options={[
                { value: "all", label: t("adminClientsScreen.filters.all") },
                { value: "active", label: t("adminClientsScreen.status.active") },
                { value: "inactive", label: t("adminClientsScreen.status.inactive") },
              ]}
            />

            <ChipSelect
              label={t("adminClientsScreen.filters.pricingProfile")}
              value={draft.profile ?? ""}
              onChange={(value) => setDraft((prev) => ({ ...prev, profile: value || null }))}
              options={profileChipOptions}
            />

            {canReadAccountManagers && (
              <View style={styles.fieldWrapper}>
                <Text size="xs" weight="semibold" dimRate="55%" textTransform="uppercase" style={styles.fieldLabel}>
                  {t("adminClientsScreen.filters.accountManager")}
                </Text>
                <Pressable style={styles.selectBox} onPress={() => setManagerPickerOpen(true)}>
                  <Text size="small" style={{ color: draft.accountManagerUserId ? Colors.text : Colors.placeholder }}>
                    {selectedManagerLabel}
                  </Text>
                  <Ionicons name="chevron-down" size={rs(18)} color={Colors.placeholder} />
                </Pressable>
              </View>
            )}

            <ChipSelect
              label={t("adminClientsScreen.filters.salesChannelFeature")}
              value={draft.salesFeaturesEnabled ? "enabled" : "any"}
              onChange={(value) => setDraft((prev) => ({ ...prev, salesFeaturesEnabled: value === "enabled" }))}
              options={[
                { value: "any", label: t("adminClientsScreen.filters.any") },
                { value: "enabled", label: t("adminClientsScreen.filters.enabled") },
              ]}
            />
          </ScrollView>

          <View style={styles.footer}>
            {activeCount > 0 && (
              <Pressable onPress={() => setDraft(EMPTY_CLIENT_FILTERS)} style={styles.clearAllRow} hitSlop={8}>
                <Ionicons name="close" size={rs(14)} color={Colors.text} />
                <Text size="small" weight="semibold" style={styles.clearAllText}>
                  {t("adminClientsScreen.filters.clear")}
                </Text>
              </Pressable>
            )}
            <Button
              title={
                typeof matchCount === "number"
                  ? t("adminClientsScreen.filters.showClients", { count: matchCount })
                  : t("adminClientsScreen.filters.apply")
              }
              onPress={() => {
                onApply(draft);
                onClose();
              }}
            />
          </View>
        </Pressable>
      </Pressable>

      {managerPickerOpen && (
        <BottomSheet visible onClose={() => setManagerPickerOpen(false)}>
          <Text size="medium" weight="bold" style={styles.pickerTitle}>
            {t("adminClientsScreen.filters.accountManager")}
          </Text>
          <ScrollView>
            {[
              { id: null, label: t("adminClientsScreen.filters.anyManager") },
              { id: "unassigned", label: t("adminClientsScreen.filters.unassigned") },
              ...(accountManagers ?? []).map((m) => ({ id: m.id, label: m.username })),
            ].map((option) => {
              const isSelected = draft.accountManagerUserId === option.id;
              return (
                <Pressable
                  key={option.id ?? "any"}
                  style={styles.pickerOption}
                  onPress={() => {
                    setDraft((prev) => ({ ...prev, accountManagerUserId: option.id }));
                    setManagerPickerOpen(false);
                  }}
                >
                  <Text size="small" weight={isSelected ? "semibold" : "regular"}>
                    {option.label}
                  </Text>
                  {isSelected && <Ionicons name="checkmark" size={rs(18)} color={Colors.primary} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </BottomSheet>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: rs(20),
    borderTopRightRadius: rs(20),
    maxHeight: "88%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(16),
    paddingTop: rvs(16),
    paddingBottom: rvs(12),
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  body: {
    paddingHorizontal: rs(16),
  },
  bodyContent: {
    paddingTop: rvs(16),
    paddingBottom: rvs(8),
  },
  fieldWrapper: {
    marginBottom: rvs(14),
  },
  fieldLabel: {
    marginBottom: rvs(8),
    letterSpacing: 0.5,
  },
  selectBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: rvs(48),
    paddingHorizontal: rs(14),
    borderRadius: rs(12),
    backgroundColor: Colors.inputBackground,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  footer: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(12),
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: rvs(12),
  },
  clearAllRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(4),
    alignSelf: "flex-start",
  },
  clearAllText: {
    color: Colors.text,
  },
  pickerTitle: {
    paddingBottom: rvs(8),
  },
  pickerOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: rvs(12),
  },
});
