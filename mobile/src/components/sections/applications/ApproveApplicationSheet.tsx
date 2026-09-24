import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";
import type { ClientApplication } from "@shared/schema";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import InfoBox from "@/components/ui/InfoBox";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useKeyboardHeight } from "@/lib/hooks/useKeyboardHeight";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import {
  useAdminAccountManagerOptions,
  useAdminClientProfileOptions,
  useUpdateAdminClient,
} from "@/lib/hooks/useAdminClients";
import { useReviewApplication } from "@/lib/hooks/useAdminApplications";
import { applicationDisplayName } from "@/components/sections/applications/applicationFormat";

const DEFAULT_PROFILE = "regular";

interface ApproveApplicationSheetProps {
  application: ClientApplication;
  visible: boolean;
  onClose: () => void;
  onApproved: () => void;
}

export function ApproveApplicationSheet({ application, visible, onClose, onApproved }: ApproveApplicationSheetProps) {
  const { t } = useTranslation();
  const { height: screenHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();
  const sheetMaxHeight = Math.min(screenHeight * 0.8, screenHeight - keyboardHeight - rvs(60));

  const { hasPermission, isAccountManager } = useAdminAccess();
  // Assignment happens as a follow-up PATCH on the new client (the review endpoint doesn't take
  // one), so it needs every gate that PATCH checks.
  const canAssignManager =
    !isAccountManager &&
    hasPermission("clients", "update") &&
    hasPermission("account-managers", "read") &&
    hasPermission("account-managers", "assign");

  const { data: profileOptions } = useAdminClientProfileOptions();
  const { data: accountManagers } = useAdminAccountManagerOptions();
  const reviewMutation = useReviewApplication();
  const updateClientMutation = useUpdateAdminClient();

  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [accountManagerUserId, setAccountManagerUserId] = useState<string | null>(null);
  const [managerPickerOpen, setManagerPickerOpen] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!profileOptions?.length) return;
    if (!profileOptions.some((option) => option.profile === profile)) {
      setProfile(profileOptions[0].profile);
    }
  }, [profileOptions, profile]);

  const reset = () => {
    setProfile(DEFAULT_PROFILE);
    setAccountManagerUserId(null);
    setNotes("");
  };

  const handleClose = () => {
    onClose();
    reset();
  };

  const name = applicationDisplayName(application);
  const isSubmitting = reviewMutation.isPending || updateClientMutation.isPending;

  const handleApprove = async () => {
    let clientAccountId: string | undefined;
    try {
      const result = await reviewMutation.mutateAsync({
        id: application.id,
        data: {
          action: "approve",
          profile: profileOptions?.length ? profile : undefined,
          notes: notes.trim() || undefined,
        },
      });
      clientAccountId = result.clientAccount?.id;
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("adminApplicationsScreen.approve.errorTitle"),
        text2: error instanceof Error ? error.message : undefined,
      });
      return;
    }

    if (accountManagerUserId && clientAccountId) {
      try {
        await updateClientMutation.mutateAsync({
          id: clientAccountId,
          data: { assignedAccountManagerUserId: accountManagerUserId },
        });
      } catch (error) {
        // The account exists at this point — say so, rather than implying the approval failed.
        Toast.show({
          type: "info",
          text1: t("adminApplicationsScreen.approve.assignErrorTitle"),
          text2: error instanceof Error ? error.message : undefined,
        });
        handleClose();
        onApproved();
        return;
      }
    }

    Toast.show({
      type: "success",
      text1: t("adminApplicationsScreen.approve.successTitle"),
      text2: t("adminApplicationsScreen.approve.successMessage", { name }),
    });
    handleClose();
    onApproved();
  };

  const selectedManagerLabel = accountManagerUserId
    ? accountManagers?.find((m) => m.id === accountManagerUserId)?.username
    : undefined;

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      <ScrollView
        style={{ maxHeight: sheetMaxHeight }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text size="large" weight="bold">
          {t("adminApplicationsScreen.approve.title")}
        </Text>
        <Text size="small" dimRate="60%" style={styles.subtitle}>
          {t("adminApplicationsScreen.approve.subtitle", { name })}
        </Text>

        {!!profileOptions?.length && (
          <>
            <Text size="xs" weight="bold" dimRate="60%" textTransform="uppercase" style={styles.sectionLabel}>
              {t("adminApplicationsScreen.approve.profile")}
            </Text>
            <View style={styles.profileRow}>
              {profileOptions.map((option) => {
                const selected = option.profile === profile;
                return (
                  <Pressable
                    key={option.profile}
                    onPress={() => setProfile(option.profile)}
                    style={[styles.profileChip, selected && styles.profileChipSelected]}
                  >
                    <Text size="small" weight="bold" style={{ color: selected ? Colors.primary : Colors.text }}>
                      {option.displayName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {canAssignManager && (
          <>
            <Text size="xs" weight="bold" dimRate="60%" textTransform="uppercase" style={styles.sectionLabel}>
              {t("adminApplicationsScreen.approve.accountManager")}
            </Text>
            <Pressable style={styles.selectBox} onPress={() => setManagerPickerOpen(true)}>
              <Text size="small" style={{ color: selectedManagerLabel ? Colors.text : Colors.placeholder }}>
                {selectedManagerLabel ?? t("adminApplicationsScreen.approve.unassigned")}
              </Text>
              <Ionicons name="chevron-down" size={rs(18)} color={Colors.placeholder} />
            </Pressable>
          </>
        )}

        <Text size="xs" weight="bold" dimRate="60%" textTransform="uppercase" style={styles.sectionLabel}>
          {t("adminApplicationsScreen.approve.notes")}
        </Text>
        <Input
          placeholder={t("adminApplicationsScreen.approve.notesPlaceholder")}
          value={notes}
          onChangeText={setNotes}
          multiline
          textAlignVertical="top"
          style={styles.notesInput}
        />

        <InfoBox text={t("adminApplicationsScreen.approve.notice")} />

        <Button
          title={t("adminApplicationsScreen.approve.submit")}
          onPress={handleApprove}
          loading={isSubmitting}
          disabled={isSubmitting}
          style={styles.submit}
        />
      </ScrollView>

      {managerPickerOpen && (
        <BottomSheet visible onClose={() => setManagerPickerOpen(false)}>
          <Text size="medium" weight="bold" style={styles.pickerTitle}>
            {t("adminApplicationsScreen.approve.accountManager")}
          </Text>
          <ScrollView style={{ maxHeight: screenHeight * 0.5 }}>
            {[{ id: null as string | null, username: t("adminApplicationsScreen.approve.unassigned") }]
              .concat((accountManagers ?? []).filter((m) => m.isActive).map((m) => ({ id: m.id, username: m.username })))
              .map((option) => {
                const isSelected = accountManagerUserId === option.id;
                return (
                  <Pressable
                    key={option.id ?? "later"}
                    style={styles.pickerOption}
                    onPress={() => {
                      setAccountManagerUserId(option.id);
                      setManagerPickerOpen(false);
                    }}
                  >
                    <Text size="small" weight={isSelected ? "semibold" : "regular"}>
                      {option.username}
                    </Text>
                    {isSelected && <Ionicons name="checkmark" size={rs(18)} color={Colors.primary} />}
                  </Pressable>
                );
              })}
          </ScrollView>
        </BottomSheet>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // Room for the submit button's shadow, which the ScrollView would otherwise clip.
  scrollContent: {
    paddingBottom: rvs(14),
  },
  subtitle: {
    marginTop: rvs(4),
    lineHeight: rvs(19),
  },
  sectionLabel: {
    marginTop: rvs(18),
    marginBottom: rvs(8),
    letterSpacing: 1,
  },
  profileRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: rs(8),
  },
  profileChip: {
    flexGrow: 1,
    flexBasis: "30%",
    alignItems: "center",
    paddingVertical: rvs(12),
    paddingHorizontal: rs(8),
    borderRadius: rs(12),
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  profileChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: "#FFF4EE",
  },
  selectBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: rvs(48),
    paddingHorizontal: rs(14),
    borderRadius: rs(12),
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  notesInput: {
    height: rvs(90),
    paddingTop: rvs(12),
  },
  submit: {
    marginTop: rvs(16),
  },
  pickerTitle: {
    marginBottom: rvs(12),
  },
  pickerOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: rvs(14),
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
});
