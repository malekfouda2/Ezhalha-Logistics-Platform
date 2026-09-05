import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { RefreshableScreen } from "@/components/ui/RefreshableScreen";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { DashedActionButton } from "@/components/ui/DashedActionButton";
import { ScreenHeader } from "@/components/sections/profile/ScreenHeader";
import { PermissionSwitchRow } from "@/components/sections/profile/PermissionSwitchRow";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { ALL_CLIENT_PERMISSIONS, ClientPermission, type ClientPermissionValue } from "@shared/domain";
import type { TeamMember } from "@/lib/services/team";

import { useMyPermissions, useCreateTeamMember, useTeamMembers } from "@/lib/hooks/useTeam";
import { useKeyboardHeight } from "@/lib/hooks/useKeyboardHeight";
import { teamMemberSchema, type TeamMemberFormData } from "@/schemas/teamMember";

const DEFAULT_PERMISSIONS: ClientPermissionValue[] = [];

function summarizePermissions(
  t: (key: string) => string,
  member: TeamMember,
): string {
  if (member.isPrimaryContact) return t("teamMembers.allPermissions");
  if (member.permissions.length === 0) return t("teamMembers.noPermissions");

  const labels = member.permissions.map((perm) => t(`teamMembers.permissions.${perm}`));
  if (labels.length <= 2) return labels.join(" · ");
  return `${labels.slice(0, 2).join(" · ")} +${labels.length - 2}`;
}

function initialsFor(username: string) {
  return username.slice(0, 2).toUpperCase();
}

export default function TeamMembersScreen() {
  const { t } = useTranslation();
  const { data: myPerms, isLoading: permsLoading } = useMyPermissions();

  const { height: screenHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();
  // Match the sheet's usual 75%-of-screen cap, but never let it (plus the
  // keyboard) push content above the top of the screen.
  const sheetMaxHeight = Math.min(screenHeight * 0.75, screenHeight - keyboardHeight - rvs(80));

  const canManageTeam =
    !!myPerms?.isPrimaryContact || !!myPerms?.permissions.includes(ClientPermission.MANAGE_USERS);

  const { data: members, isLoading } = useTeamMembers(canManageTeam);
  const createMutation = useCreateTeamMember();

  const [sheetVisible, setSheetVisible] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [permissions, setPermissions] = useState<ClientPermissionValue[]>(DEFAULT_PERMISSIONS);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TeamMemberFormData>({
    resolver: zodResolver(teamMemberSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
    },
  });

  const togglePermission = (perm: ClientPermissionValue) => {
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  };

  const resetForm = () => {
    reset({ username: "", email: "", password: "" });
    setPermissions(DEFAULT_PERMISSIONS);
    setShowPassword(false);
  };

  const onSubmit = async (data: TeamMemberFormData) => {
    try {
      await createMutation.mutateAsync({
        username: data.username.trim(),
        email: data.email.trim(),
        password: data.password,
        permissions,
      });
      setSheetVisible(false);
      resetForm();
      Toast.show({
        type: "success",
        text1: t("teamMembers.createSuccessTitle"),
        text2: t("teamMembers.createSuccessMessage", { name: data.username.trim() }),
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("teamMembers.createErrorTitle"),
        text2: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const isCreating = isSubmitting || createMutation.isPending;

  if (permsLoading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (!canManageTeam) {
    return (
      <View style={styles.content}>
        <ScreenHeader title={t("teamMembers.title")} />
        <View style={styles.accessDenied}>
          <Text size="medium" weight="bold" style={styles.centerText}>
            {t("teamMembers.accessDeniedTitle")}
          </Text>
          <Text size="small" dimRate="60%" style={[styles.centerText, styles.accessDeniedMessage]}>
            {t("teamMembers.accessDeniedMessage")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <RefreshableScreen contentContainerStyle={styles.content}>
        <ScreenHeader
          title={`${t("teamMembers.title")} (${members?.length ?? 0})`}
          subtitle={t(
            (members?.length ?? 0) === 1 ? "teamMembers.subtitle_one" : "teamMembers.subtitle_other",
            { count: members?.length ?? 0 },
          )}
        />

        {isLoading ? (
          <ActivityIndicator color={Colors.primary} style={styles.loading} />
        ) : (
          <>
            {(members ?? []).map((member) => (
              <Pressable
                key={member.id}
                disabled={member.isPrimaryContact}
                onPress={() => router.push(`/team-members/${member.id}`)}
                style={({ pressed }) => [styles.row, pressed && !member.isPrimaryContact && styles.pressed]}
              >
                <View style={styles.avatar}>
                  <Text size="medium" weight="bold" style={styles.avatarText}>
                    {initialsFor(member.username)}
                  </Text>
                </View>

                <View style={styles.info}>
                  <Text size="medium" weight="bold" numberOfLines={1}>
                    {member.username}
                  </Text>
                  <Text size="xs" weight="semibold" dimRate="55%" numberOfLines={1} style={styles.meta}>
                    {member.email}
                  </Text>
                </View>

                {member.isPrimaryContact ? (
                  <View style={styles.primaryBadge}>
                    <Text size="xs" weight="bold" style={styles.primaryBadgeText}>
                      {t("teamMembers.primary")}
                    </Text>
                  </View>
                ) : (
                  <Text size="xs" weight="semibold" dimRate="55%" style={styles.permSummary} numberOfLines={1}>
                    {summarizePermissions(t, member)}
                  </Text>
                )}
              </Pressable>
            ))}

            {(members ?? []).length === 0 && (
              <View style={styles.empty}>
                <Text size="medium" weight="bold" style={styles.centerText}>
                  {t("teamMembers.empty")}
                </Text>
                <Text size="small" dimRate="60%" style={styles.centerText}>
                  {t("teamMembers.emptySubtitle")}
                </Text>
              </View>
            )}

            <DashedActionButton
              icon="plus"
              label={t("teamMembers.addMember")}
              onPress={() => setSheetVisible(true)}
            />
          </>
        )}
      </RefreshableScreen>

      <BottomSheet
        visible={sheetVisible}
        onClose={() => {
          setSheetVisible(false);
          resetForm();
        }}
      >
        <ScrollView
          style={{ maxHeight: sheetMaxHeight }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text size="large" weight="bold" style={styles.sheetTitle}>
            {t("teamMembers.addMember")}
          </Text>

          <Text size="xs" weight="semibold" dimRate="55%" textTransform="uppercase" style={styles.sheetSectionLabel}>
            {t("teamMembers.form.detailsSection")}
          </Text>
          <Controller
            control={control}
            name="username"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                placeholder={t("teamMembers.form.usernamePlaceholder")}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="none"
                autoCorrect={false}
                error={errors.username?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                placeholder={t("teamMembers.form.emailPlaceholder")}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                keyboardType="email-address"
                autoCapitalize="none"
                error={errors.email?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                placeholder={t("teamMembers.form.passwordPlaceholder")}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                error={errors.password?.message}
                rightElement={
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={rs(20)}
                    color={Colors.textSecondary}
                  />
                }
                onRightElementPress={() => setShowPassword((v) => !v)}
              />
            )}
          />

          <Text size="xs" weight="semibold" dimRate="55%" textTransform="uppercase" style={styles.sheetSectionLabel}>
            {t("teamMembers.form.permissionsSection")}
          </Text>
          <View style={styles.permissionsCard}>
            {ALL_CLIENT_PERMISSIONS.map((perm, index) => (
              <View key={perm} style={index > 0 ? styles.permissionDivider : undefined}>
                <PermissionSwitchRow
                  label={t(`teamMembers.permissions.${perm}`)}
                  value={permissions.includes(perm)}
                  onValueChange={() => togglePermission(perm)}
                />
              </View>
            ))}
          </View>

          <Button
            title={isCreating ? t("teamMembers.form.submitting") : t("teamMembers.form.submit")}
            onPress={handleSubmit(onSubmit)}
            loading={isCreating}
            disabled={isCreating}
            style={styles.sheetSubmit}
          />
        </ScrollView>
      </BottomSheet>
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
  content: {
    flex: 1,
    paddingHorizontal: rs(16),
    paddingTop: rvs(8),
    paddingBottom: rvs(24),
  },
  loading: {
    marginTop: rvs(60),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    paddingHorizontal: rs(14),
    paddingVertical: rvs(14),
    marginBottom: rvs(12),
    gap: rs(12),
  },
  pressed: {
    opacity: 0.7,
  },
  avatar: {
    width: rs(42),
    height: rs(42),
    borderRadius: rs(13),
    backgroundColor: "#8A93A3",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: Colors.white,
  },
  info: {
    flex: 1,
  },
  meta: {
    marginTop: rvs(2),
  },
  primaryBadge: {
    backgroundColor: "#F0E6FF",
    borderRadius: rs(20),
    paddingHorizontal: rs(10),
    paddingVertical: rvs(5),
  },
  primaryBadgeText: {
    color: "#7029B5",
  },
  permSummary: {
    maxWidth: rs(120),
    textAlign: "right",
  },
  empty: {
    paddingVertical: rvs(30),
    gap: rvs(4),
  },
  centerText: {
    textAlign: "center",
  },
  accessDenied: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: rvs(6),
    paddingHorizontal: rs(30),
  },
  accessDeniedMessage: {
    marginTop: rvs(2),
  },
  sheetTitle: {
    marginVertical: rvs(16),
  },
  sheetSectionLabel: {
    marginBottom: rvs(8),
    letterSpacing: 0.5,
  },
  permissionsCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
    marginBottom: rvs(16),
  },
  permissionDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  sheetSubmit: {
    marginBottom: rvs(4),
  },
});
