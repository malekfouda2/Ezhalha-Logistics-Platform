import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { KeyboardAwareScreen } from "@/components/ui/KeyboardAwareScreen";
import InfoBox from "@/components/ui/InfoBox";
import { SectionLabel } from "@/components/ui/InfoCard";
import { ScreenHeader } from "@/components/sections/profile/ScreenHeader";
import { PermissionSwitchRow } from "@/components/sections/profile/PermissionSwitchRow";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { ALL_CLIENT_PERMISSIONS, type ClientPermissionValue } from "@shared/domain";

import {
  useTeamMembers,
  useUpdateTeamMemberPermissions,
  useRemoveTeamMember,
} from "@/lib/hooks/useTeam";

export default function EditPermissionsScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: members } = useTeamMembers(true);
  const member = members?.find((m) => m.id === id);

  const updateMutation = useUpdateTeamMemberPermissions();
  const removeMutation = useRemoveTeamMember();

  const [permissions, setPermissions] = useState<ClientPermissionValue[]>([]);

  useEffect(() => {
    if (member) setPermissions(member.permissions);
  }, [member?.id]);

  const togglePermission = (perm: ClientPermissionValue) => {
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  };

  const handleSave = async () => {
    if (!member) return;
    try {
      await updateMutation.mutateAsync({ userId: member.id, permissions });
      Toast.show({ type: "success", text1: t("editPermissions.successTitle") });
      router.back();
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("editPermissions.errorTitle"),
        text2: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleRemove = () => {
    if (!member) return;
    Alert.alert(
      t("teamMembers.removeConfirmTitle"),
      t("teamMembers.removeConfirmMessage", { name: member.username }),
      [
        { text: t("teamMembers.cancel"), style: "cancel" },
        {
          text: t("teamMembers.remove"),
          style: "destructive",
          onPress: async () => {
            try {
              await removeMutation.mutateAsync(member.id);
              router.back();
            } catch (error) {
              Toast.show({
                type: "error",
                text1: t("teamMembers.removeErrorTitle"),
                text2: error instanceof Error ? error.message : undefined,
              });
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <KeyboardAwareScreen
        contentContainerStyle={styles.content}
        footer={
          <View style={styles.footer}>
            <Button
              title={
                updateMutation.isPending ? t("editPermissions.saving") : t("editPermissions.save")
              }
              onPress={handleSave}
              loading={updateMutation.isPending}
              disabled={!member || updateMutation.isPending}
            />
          </View>
        }
      >
        <ScreenHeader title={t("editPermissions.title")} subtitle={member?.username} />

        <View style={styles.card}>
          {ALL_CLIENT_PERMISSIONS.map((perm, index) => (
            <View key={perm} style={index > 0 ? styles.divider : undefined}>
              <PermissionSwitchRow
                label={t(`teamMembers.permissions.${perm}`)}
                value={permissions.includes(perm)}
                onValueChange={() => togglePermission(perm)}
              />
            </View>
          ))}
        </View>

        <InfoBox text={t("editPermissions.primaryNotice")} />

        <SectionLabel style={styles.dangerLabel}>
          {t("editPermissions.dangerZone")}
        </SectionLabel>
        <Pressable
          style={({ pressed }) => [styles.dangerRow, pressed && styles.dangerRowPressed]}
          onPress={handleRemove}
          disabled={removeMutation.isPending}
        >
          <View style={styles.dangerIconBox}>
            <Ionicons name="close" size={rs(19)} color={Colors.error} />
          </View>
          <View style={styles.info}>
            <Text size="medium" weight="bold" style={styles.dangerTitle}>
              {t("editPermissions.removeMember")}
            </Text>
            <Text size="small" dimRate="55%">
              {t("editPermissions.removeMemberSubtitle")}
            </Text>
          </View>
        </Pressable>
      </KeyboardAwareScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(8),
    paddingBottom: rvs(20),
  },
  footer: {
    paddingHorizontal: rs(16),
    paddingBottom: rvs(20),
    paddingTop: rvs(8),
    backgroundColor: Colors.background,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
    marginBottom: rvs(16),
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  dangerLabel: {
    marginTop: rvs(20),
  },
  dangerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
    paddingVertical: rvs(14),
  },
  dangerRowPressed: {
    opacity: 0.7,
  },
  dangerIconBox: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(11),
    backgroundColor: "#FDE8E8",
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
  },
  dangerTitle: {
    color: Colors.error,
  },
});
