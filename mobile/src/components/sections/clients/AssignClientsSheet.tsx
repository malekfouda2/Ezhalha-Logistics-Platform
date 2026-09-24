import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useKeyboardHeight } from "@/lib/hooks/useKeyboardHeight";
import { useAdminAccountManagerOptions, useAdminClientsList, useAssignClientsToAccountManager } from "@/lib/hooks/useAdminClients";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import type { AccountManagerSummary } from "@/lib/services/adminClients";

interface AssignClientsSheetProps {
  manager: AccountManagerSummary | null;
  onClose: () => void;
}

export function AssignClientsSheet({ manager, onClose }: AssignClientsSheetProps) {
  const { t } = useTranslation();
  const { height: screenHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();
  const listMaxHeight = Math.min(screenHeight * 0.4, screenHeight - keyboardHeight - rvs(280));

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: allManagers } = useAdminAccountManagerOptions();
  const { clients, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useAdminClientsList(
    { search: debouncedSearch || undefined },
    { enabled: !!manager },
  );
  const assignMutation = useAssignClientsToAccountManager();

  useEffect(() => {
    if (manager) {
      setSelectedIds(manager.assignedClients.map((c) => c.id));
      setSearch("");
    }
  }, [manager?.id]);

  const assignedElsewhere = useMemo(() => {
    const map = new Map<string, string>();
    (allManagers ?? []).forEach((am) => {
      if (am.id === manager?.id) return;
      am.assignedClients.forEach((client) => map.set(client.id, am.username));
    });
    return map;
  }, [allManagers, manager?.id]);

  const toggle = (clientId: string) => {
    setSelectedIds((prev) => (prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]));
  };

  const handleSave = async () => {
    if (!manager) return;
    try {
      await assignMutation.mutateAsync({ accountManagerUserId: manager.id, clientAccountIds: selectedIds });
      Toast.show({ type: "success", text1: t("adminAccountManagersScreen.assign.successTitle") });
      onClose();
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("adminAccountManagersScreen.assign.errorTitle"),
        text2: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <BottomSheet visible={!!manager} onClose={onClose}>
      <Text size="large" weight="bold" style={styles.title}>
        {t("adminAccountManagersScreen.assign.title")}
      </Text>
      <Text size="small" dimRate="60%" style={styles.subtitle}>
        {t("adminAccountManagersScreen.assign.subtitle", { name: manager?.username ?? "", count: selectedIds.length })}
      </Text>

      <Input
        placeholder={t("adminAccountManagersScreen.assign.searchPlaceholder")}
        value={search}
        onChangeText={setSearch}
        leftElement={<Ionicons name="search" size={rs(18)} color={Colors.placeholder} />}
      />

      <View style={{ maxHeight: listMaxHeight }}>
        <FlatList
          data={clients}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={Colors.primary} style={styles.footerLoading} /> : null}
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator color={Colors.primary} style={styles.footerLoading} />
            ) : (
              <Text size="small" dimRate="55%" style={styles.emptyText}>
                {t("adminAccountManagersScreen.assign.empty")}
              </Text>
            )
          }
          renderItem={({ item }) => {
            const checked = selectedIds.includes(item.id);
            const heldByOther = assignedElsewhere.get(item.id);
            return (
              <Pressable style={styles.row} onPress={() => toggle(item.id)}>
                <View style={styles.rowInfo}>
                  <Text size="medium" weight="bold" numberOfLines={1}>
                    {item.accountNumber} · {item.name || item.companyName}
                  </Text>
                  <Text size="xs" dimRate="55%" numberOfLines={1}>
                    {heldByOther
                      ? t("adminAccountManagersScreen.assign.assignedTo", { name: heldByOther })
                      : item.profile}
                  </Text>
                </View>
                <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                  {checked && <Ionicons name="checkmark" size={rs(15)} color={Colors.white} />}
                </View>
              </Pressable>
            );
          }}
        />
      </View>

      <Button
        title={assignMutation.isPending ? t("adminAccountManagersScreen.assign.saving") : t("adminAccountManagersScreen.assign.save")}
        onPress={handleSave}
        loading={assignMutation.isPending}
        disabled={assignMutation.isPending}
        style={styles.saveButton}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: rvs(16),
  },
  subtitle: {
    marginTop: rvs(4),
    marginBottom: rvs(14),
  },
  footerLoading: {
    paddingVertical: rvs(16),
  },
  emptyText: {
    textAlign: "center",
    paddingVertical: rvs(24),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: rvs(12),
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: rs(10),
  },
  rowInfo: {
    flex: 1,
  },
  checkbox: {
    width: rs(24),
    height: rs(24),
    borderRadius: rs(7),
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  saveButton: {
    marginTop: rvs(16),
    marginBottom: rvs(4),
  },
});
