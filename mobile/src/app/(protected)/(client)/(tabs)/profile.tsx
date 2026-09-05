import React from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { RefreshableScreen } from "@/components/ui/RefreshableScreen";
import { InfoCard, SectionLabel } from "@/components/ui/InfoCard";
import { SettingsRow } from "@/components/sections/profile/SettingsRow";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

import { useCurrentUser } from "@/lib/hooks/useAuth";
import { useClientAccount } from "@/lib/hooks/useClientAccount";
import { useMyPermissions } from "@/lib/hooks/useTeam";
import { useLogout } from "@/lib/hooks/useLogout";
import { useLanguageStore } from "@/store/useLanguageStore";
import { ClientPermission } from "@shared/domain";

export default function ProfileScreen() {
  const { t } = useTranslation();

  const { data: user } = useCurrentUser();
  const { data: account, isLoading: accountLoading } = useClientAccount();
  const { data: myPerms } = useMyPermissions();

  const language = useLanguageStore((state) => state.language);
  const { logout } = useLogout();

  const displayName = user?.username || account?.name || t("profile.noCompanyName");
  const companyLine = [ account?.name, account?.accountNumber]
    .filter(Boolean)
    .join(" · ");

  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";

  const pricingTierLabel = account?.profile
    ? account.profile.replace("_", " ").toUpperCase()
    : "—";

  const canManageTeam =
    !!myPerms?.isPrimaryContact ||
    !!myPerms?.permissions.includes(ClientPermission.MANAGE_USERS);

  return (
    <RefreshableScreen contentContainerStyle={styles.content}>
      <Text size="xl" weight="bold" style={styles.pageTitle}>
        {t("profile.title")}
      </Text>

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text size="large" weight="bold" style={styles.avatarText}>
            {initials}
          </Text>
        </View>

        <View style={styles.profileInfo}>
          <Text size="large" weight="bold" numberOfLines={1}>
            {accountLoading ? t("common.loading") : displayName}
          </Text>
          <Text size="small" dimRate="60%" numberOfLines={1} style={styles.companyLine}>
            {companyLine}
          </Text>

          <View style={styles.pricingBadge}>
            <Text size="small" weight="semibold">
              {t("profile.pricingTier")}
            </Text>
            <Text size="small" weight="bold" style={styles.pricingValue}>
              {pricingTierLabel}
            </Text>
          </View>
        </View>
      </View>

      <SectionLabel style={styles.sectionSpacing}>
        {t("profile.sections.account")}
      </SectionLabel>
      <InfoCard>
        <SettingsRow
          icon="person-outline"
          title={t("profile.rows.profileInformation.title")}
          subtitle={t("profile.rows.profileInformation.subtitle")}
          onPress={() => router.push("/profile-information")}
        />
        <SettingsRow
          icon="location-outline"
          title={t("profile.rows.defaultShippingAddress.title")}
          subtitle={
            account?.shippingCity ||
            account?.shippingAddressLine1 ||
            t("profile.rows.defaultShippingAddress.subtitle")
          }
          onPress={() => router.push("/default-shipping-address")}
        />
        <SettingsRow
          icon="globe-outline"
          title={t("profile.rows.billingCurrency.title")}
          subtitle={
            account?.preferredCurrency === "USD"
              ? t("profile.rows.billingCurrency.subtitleUsd")
              : t("profile.rows.billingCurrency.subtitle")
          }
          onPress={() => router.push("/billing-currency")}
        />
        {canManageTeam ? (
          <SettingsRow
            icon="people-outline"
            title={t("profile.rows.teamMembers.title")}
            subtitle={t("profile.rows.teamMembers.subtitle")}
            onPress={() => router.push("/team-members")}
          />
        ) : null}
        <SettingsRow
          icon="storefront-outline"
          title={t("profile.rows.salesChannels.title")}
          subtitle={t("profile.rows.salesChannels.subtitle")}
          onPress={() => router.push("/sales-channels")}
        />
      </InfoCard>

      <SectionLabel>{t("profile.sections.security")}</SectionLabel>
      <InfoCard>
        <SettingsRow
          icon="lock-closed-outline"
          title={t("profile.rows.changePassword.title")}
          subtitle={t("profile.rows.changePassword.subtitle")}
          onPress={() => router.push("/change-password")}
        />
        <SettingsRow
          icon="shield-checkmark-outline"
          title={t("profile.rows.signedInDevices.title")}
          onPress={() => router.push("/signed-in-devices")}
        />
      </InfoCard>

      <SectionLabel>{t("profile.sections.preferences")}</SectionLabel>
      <InfoCard>
        <SettingsRow
          icon="language-outline"
          title={t("profile.rows.language.title")}
          subtitle={language === "en" ? "English" : "العربية"}
          onPress={() => router.push("/language")}
        />
        <SettingsRow
          icon="log-out-outline"
          title={t("profile.rows.logout.title")}
          onPress={logout}
          showChevron={false}
          danger
        />
      </InfoCard>
    </RefreshableScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(8),
  },
  pageTitle: {
    marginBottom: rvs(16),
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: rs(20),
    padding: rs(16),
    marginBottom: rvs(20),
  },
  avatar: {
    width: rs(58),
    height: rs(58),
    borderRadius: rs(18),
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginEnd: rs(14),
  },
  avatarText: {
    color: Colors.white,
  },
  profileInfo: {
    flex: 1,
  },
  companyLine: {
    marginTop: rvs(2),
  },
  pricingBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: rs(6),
    marginTop: rvs(8),
    paddingHorizontal: rs(10),
    paddingVertical: rvs(4),
    borderRadius: rs(20),
    backgroundColor: Colors.background,
  },
  pricingValue: {
    color: Colors.primary,
  },
  sectionSpacing: {
    marginTop: 0,
  },
});
