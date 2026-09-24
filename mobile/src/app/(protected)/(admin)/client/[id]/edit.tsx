// app/(protected)/(admin)/client/[id]/edit.tsx
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { KeyboardAwareScreen } from "@/components/ui/KeyboardAwareScreen";
import { ChipSelect } from "@/components/ui/ChipSelect";
import { ScreenHeader } from "@/components/sections/profile/ScreenHeader";
import { PermissionSwitchRow } from "@/components/sections/profile/PermissionSwitchRow";
import { InfoCard, InfoRow, SectionLabel } from "@/components/ui/InfoCard";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { formatMoney } from "@/utils/invoiceFormat";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import {
  useAdminAccountManagerOptions,
  useAdminClientCredit,
  useAdminClientDetails,
  useAdminClientProfileOptions,
  useDeleteAdminClient,
  useSetAdminClientCreditLimit,
  useSetAdminClientDangerousGoods,
  useSetAdminClientSalesFeatures,
  useUpdateAdminClient,
} from "@/lib/hooks/useAdminClients";

type TabKey = "account" | "contact" | "pricing" | "features";

interface FormState {
  companyName: string;
  companyNameAr: string;
  crNumber: string;
  taxNumber: string;
  profile: string;
  isActive: boolean;
  assignedAccountManagerUserId: string;
  name: string;
  nameAr: string;
  phone: string;
  shippingContactName: string;
  shippingContactPhone: string;
  shippingCity: string;
  shippingAddressLine1: string;
  shippingAddressLine2: string;
  shippingShortAddress: string;
  shippingContactNameAr: string;
  shippingContactPhoneAr: string;
  shippingCityAr: string;
  shippingAddressLine1Ar: string;
  shippingAddressLine2Ar: string;
  shippingShortAddressAr: string;
  preferredCurrency: "SAR" | "USD";
}

function emptyForm(): FormState {
  return {
    companyName: "",
    companyNameAr: "",
    crNumber: "",
    taxNumber: "",
    profile: "",
    isActive: true,
    assignedAccountManagerUserId: "unassigned",
    name: "",
    nameAr: "",
    phone: "",
    shippingContactName: "",
    shippingContactPhone: "",
    shippingCity: "",
    shippingAddressLine1: "",
    shippingAddressLine2: "",
    shippingShortAddress: "",
    shippingContactNameAr: "",
    shippingContactPhoneAr: "",
    shippingCityAr: "",
    shippingAddressLine1Ar: "",
    shippingAddressLine2Ar: "",
    shippingShortAddressAr: "",
    preferredCurrency: "SAR",
  };
}

export default function AdminEditClientScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>("account");
  const [managerPickerOpen, setManagerPickerOpen] = useState(false);
  const [creditLimitInput, setCreditLimitInput] = useState("");

  const { hasPermission, isAccountManager } = useAdminAccess();
  const canReadAccountManagers = hasPermission("account-managers", "read");
  const canAssignAccountManagers = hasPermission("account-managers", "assign");
  const canDeleteClients = hasPermission("clients", "delete");

  const { data: client, isLoading } = useAdminClientDetails(id);
  const { data: profileOptions } = useAdminClientProfileOptions();
  const { data: accountManagers } = useAdminAccountManagerOptions();
  const { data: credit } = useAdminClientCredit(id, activeTab === "pricing");

  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    if (!client) return;
    setForm({
      companyName: client.companyName ?? "",
      companyNameAr: client.companyNameAr ?? "",
      crNumber: client.crNumber ?? "",
      taxNumber: client.taxNumber ?? "",
      profile: client.profile ?? "",
      isActive: client.isActive,
      assignedAccountManagerUserId:
        client.assignedAccountManager?.id ?? "unassigned",
      name: client.name ?? "",
      nameAr: client.nameAr ?? "",
      phone: client.phone ?? "",
      shippingContactName: client.shippingContactName ?? "",
      shippingContactPhone: client.shippingContactPhone ?? "",
      shippingCity: client.shippingCity ?? "",
      shippingAddressLine1: client.shippingAddressLine1 ?? "",
      shippingAddressLine2: client.shippingAddressLine2 ?? "",
      shippingShortAddress: client.shippingShortAddress ?? "",
      shippingContactNameAr: client.shippingContactNameAr ?? "",
      shippingContactPhoneAr: client.shippingContactPhoneAr ?? "",
      shippingCityAr: client.shippingCityAr ?? "",
      shippingAddressLine1Ar: client.shippingAddressLine1Ar ?? "",
      shippingAddressLine2Ar: client.shippingAddressLine2Ar ?? "",
      shippingShortAddressAr: client.shippingShortAddressAr ?? "",
      preferredCurrency: (client.preferredCurrency as "SAR" | "USD") ?? "SAR",
    });
  }, [client?.id]);

  useEffect(() => {
    if (credit) setCreditLimitInput(String(credit.limit ?? 0));
  }, [credit?.limit]);

  const updateMutation = useUpdateAdminClient();
  const creditMutation = useSetAdminClientCreditLimit();
  const dgMutation = useSetAdminClientDangerousGoods();
  const salesFeaturesMutation = useSetAdminClientSalesFeatures();
  const deleteMutation = useDeleteAdminClient();

  const profileChipOptions = useMemo(
    () =>
      (profileOptions ?? []).map((option) => ({
        value: option.profile,
        label: option.displayName,
      })),
    [profileOptions],
  );

  const selectedManagerLabel =
    form.assignedAccountManagerUserId === "unassigned"
      ? t("adminClientsScreen.card.unassigned")
      : (accountManagers?.find(
          (m) => m.id === form.assignedAccountManagerUserId,
        )?.username ?? t("adminClientsScreen.card.unassigned"));

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    try {
      const result = await updateMutation.mutateAsync({
        id: id as string,
        data: {
          name: form.name,
          nameAr: form.nameAr || undefined,
          phone: form.phone,
          companyName: form.companyName,
          companyNameAr: form.companyNameAr || undefined,
          crNumber: form.crNumber || undefined,
          taxNumber: form.taxNumber || undefined,
          profile: form.profile || undefined,
          isActive: isAccountManager ? undefined : form.isActive,
          preferredCurrency: form.preferredCurrency,
          assignedAccountManagerUserId:
            canReadAccountManagers &&
            canAssignAccountManagers &&
            !isAccountManager
              ? form.assignedAccountManagerUserId === "unassigned"
                ? null
                : form.assignedAccountManagerUserId
              : undefined,
          shippingContactName: form.shippingContactName || undefined,
          shippingContactPhone: form.shippingContactPhone || undefined,
          shippingCity: form.shippingCity || undefined,
          shippingAddressLine1: form.shippingAddressLine1 || undefined,
          shippingAddressLine2: form.shippingAddressLine2 || undefined,
          shippingShortAddress: form.shippingShortAddress || undefined,
          shippingContactNameAr: form.shippingContactNameAr || undefined,
          shippingContactPhoneAr: form.shippingContactPhoneAr || undefined,
          shippingCityAr: form.shippingCityAr || undefined,
          shippingAddressLine1Ar: form.shippingAddressLine1Ar || undefined,
          shippingAddressLine2Ar: form.shippingAddressLine2Ar || undefined,
          shippingShortAddressAr: form.shippingShortAddressAr || undefined,
        },
      });

      Toast.show({
        type: "success",
        text1: result.requiresApproval
          ? t("adminClientsScreen.edit.approvalRequestedTitle")
          : t("adminClientsScreen.edit.successTitle"),
        text2: result.requiresApproval
          ? t("adminClientsScreen.edit.approvalRequestedMessage")
          : undefined,
      });
      router.back();
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("adminClientsScreen.edit.errorTitle"),
        text2: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleSaveCreditLimit = async () => {
    const value = Number(creditLimitInput);
    if (Number.isNaN(value) || value < 0) return;
    try {
      await creditMutation.mutateAsync({
        id: id as string,
        creditLimitSar: value,
      });
      Toast.show({
        type: "success",
        text1: t("adminClientsScreen.edit.pricing.creditSavedTitle"),
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("adminClientsScreen.edit.pricing.creditSaveErrorTitle"),
        text2: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleDeleteClient = () => {
    Alert.alert(
      t("adminClientsScreen.edit.account.deleteConfirm.title"),
      t("adminClientsScreen.edit.account.deleteConfirm.message", {
        name: client?.name ?? "",
      }),
      [
        {
          text: t("adminClientsScreen.edit.account.deleteConfirm.cancel"),
          style: "cancel",
        },
        {
          text: t("adminClientsScreen.edit.account.deleteConfirm.confirm"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync(id as string);
              Toast.show({
                type: "success",
                text1: t("adminClientsScreen.edit.account.deleteSuccessTitle"),
              });
              router.replace("/(protected)/(admin)/client");
            } catch (error) {
              Toast.show({
                type: "error",
                text1: t("adminClientsScreen.edit.account.deleteErrorTitle"),
                text2: error instanceof Error ? error.message : undefined,
              });
            }
          },
        },
      ],
    );
  };

  if (isLoading || !client) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: "account", label: t("adminClientsScreen.edit.tabs.account") },
    { key: "contact", label: t("adminClientsScreen.edit.tabs.contact") },
    { key: "pricing", label: t("adminClientsScreen.edit.tabs.pricing") },
    { key: "features", label: t("adminClientsScreen.edit.tabs.features") },
  ];

  return (
    <View style={styles.screen}>
      <KeyboardAwareScreen
        contentContainerStyle={styles.content}
        footer={
          <View style={styles.footer}>
            <Button
              title={
                updateMutation.isPending
                  ? t("adminClientsScreen.edit.saving")
                  : isAccountManager
                    ? t("adminClientsScreen.edit.submitForApproval")
                    : t("adminClientsScreen.edit.save")
              }
              onPress={handleSave}
              loading={updateMutation.isPending}
              disabled={updateMutation.isPending}
            />
          </View>
        }
      >
        <ScreenHeader
          title={t("adminClientsScreen.edit.title")}
          subtitle={`${client.accountNumber} · ${client.name}`}
        />

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
                onPress={() => setActiveTab(tab.key)}
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

        {activeTab === "account" && (
          <>
            <Text
              size="xs"
              weight="semibold"
              dimRate="55%"
              textTransform="uppercase"
              style={styles.fieldLabel}
            >
              {t("adminClientsScreen.edit.account.companyNameEn")}
            </Text>
            <Input
              value={form.companyName}
              onChangeText={(v) => set("companyName", v)}
              placeholder={t("adminClientsScreen.edit.account.companyNameEn")}
            />

            <Text
              size="xs"
              weight="semibold"
              dimRate="55%"
              textTransform="uppercase"
              style={styles.fieldLabel}
            >
              {t("adminClientsScreen.edit.account.companyNameAr")}
            </Text>
            <Input
              value={form.companyNameAr}
              onChangeText={(v) => set("companyNameAr", v)}
              placeholder={t("adminClientsScreen.edit.account.companyNameAr")}
              style={styles.rtlInput}
            />
            <Text size="xs" dimRate="55%" style={styles.hint}>
              {t("adminClientsScreen.edit.account.arabicHint")}
            </Text>

            <Text
              size="xs"
              weight="semibold"
              dimRate="55%"
              textTransform="uppercase"
              style={styles.fieldLabel}
            >
              {t("adminClientsScreen.edit.account.crNumber")}
            </Text>
            <Input
              value={form.crNumber}
              onChangeText={(v) => set("crNumber", v)}
              placeholder={t("adminClientsScreen.edit.account.crNumber")}
              keyboardType="number-pad"
            />

            <Text
              size="xs"
              weight="semibold"
              dimRate="55%"
              textTransform="uppercase"
              style={styles.fieldLabel}
            >
              {t("adminClientsScreen.edit.account.taxNumber")}
            </Text>
            <Input
              value={form.taxNumber}
              onChangeText={(v) => set("taxNumber", v)}
              placeholder={t("adminClientsScreen.edit.account.taxNumber")}
              keyboardType="number-pad"
            />

            {profileChipOptions.length > 0 && (
              <ChipSelect
                label={t("adminClientsScreen.edit.account.pricingProfile")}
                value={form.profile}
                onChange={(v) => set("profile", v)}
                options={profileChipOptions}
              />
            )}

            {canReadAccountManagers &&
              canAssignAccountManagers &&
              !isAccountManager && (
                <View style={styles.fieldWrapper}>
                  <Text
                    size="xs"
                    weight="semibold"
                    dimRate="55%"
                    textTransform="uppercase"
                    style={styles.fieldLabel}
                  >
                    {t("adminClientsScreen.edit.account.accountManager")}
                  </Text>
                  <Pressable
                    style={styles.selectBox}
                    onPress={() => setManagerPickerOpen(true)}
                  >
                    <Text size="small">{selectedManagerLabel}</Text>
                    <Ionicons
                      name="chevron-down"
                      size={rs(18)}
                      color={Colors.placeholder}
                    />
                  </Pressable>
                </View>
              )}

            {!isAccountManager && (
              <View style={styles.toggleCard}>
                <PermissionSwitchRow
                  label={t("adminClientsScreen.edit.account.accountActive")}
                  value={form.isActive}
                  onValueChange={(v) => set("isActive", v)}
                />
                <Text size="xs" dimRate="55%">
                  {t("adminClientsScreen.edit.account.accountActiveHint")}
                </Text>
              </View>
            )}

            {canDeleteClients && !isAccountManager && (
              <Pressable
                style={styles.deleteButton}
                onPress={handleDeleteClient}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <ActivityIndicator color={Colors.error} />
                ) : (
                  <>
                    <Ionicons
                      name="trash-outline"
                      size={rs(18)}
                      color={Colors.error}
                    />
                    <Text
                      size="small"
                      weight="bold"
                      style={styles.deleteButtonText}
                    >
                      {t("adminClientsScreen.edit.account.deleteAccount")}
                    </Text>
                  </>
                )}
              </Pressable>
            )}
          </>
        )}

        {activeTab === "contact" && (
          <>
            <Text
              size="xs"
              weight="semibold"
              dimRate="55%"
              textTransform="uppercase"
              style={styles.fieldLabel}
            >
              {t("adminClientsScreen.edit.contact.contactName")}
            </Text>
            <Input
              value={form.name}
              onChangeText={(v) => set("name", v)}
              placeholder={t("adminClientsScreen.edit.contact.contactName")}
            />

            <Text
              size="xs"
              weight="semibold"
              dimRate="55%"
              textTransform="uppercase"
              style={styles.fieldLabel}
            >
              {t("adminClientsScreen.edit.contact.contactNameAr")}
            </Text>
            <Input
              value={form.nameAr}
              onChangeText={(v) => set("nameAr", v)}
              placeholder={t("adminClientsScreen.edit.contact.contactNameAr")}
              style={styles.rtlInput}
            />
            <Text size="xs" dimRate="55%" style={styles.hint}>
              {t("adminClientsScreen.edit.account.arabicHint")}
            </Text>

            <Text
              size="xs"
              weight="semibold"
              dimRate="55%"
              textTransform="uppercase"
              style={styles.fieldLabel}
            >
              {t("adminClientsScreen.edit.contact.phone")}
            </Text>
            <PhoneInput
              value={form.phone}
              onChangeValue={(v) => set("phone", v)}
            />

            <SectionLabel style={styles.sectionSpacing}>
              {t("adminClientsScreen.edit.contact.shippingAddress")}
            </SectionLabel>
            <View style={styles.shippingCard}>
              <Text
                size="xs"
                weight="semibold"
                dimRate="55%"
                textTransform="uppercase"
                style={styles.fieldLabel}
              >
                {t("adminClientsScreen.edit.contact.shippingContactName")}
              </Text>
              <Input
                value={form.shippingContactName}
                onChangeText={(v) => set("shippingContactName", v)}
              />

              <Text
                size="xs"
                weight="semibold"
                dimRate="55%"
                textTransform="uppercase"
                style={styles.fieldLabel}
              >
                {t("adminClientsScreen.edit.contact.shippingContactPhone")}
              </Text>
              <Input
                value={form.shippingContactPhone}
                onChangeText={(v) => set("shippingContactPhone", v)}
                keyboardType="phone-pad"
              />

              <Text
                size="xs"
                weight="semibold"
                dimRate="55%"
                textTransform="uppercase"
                style={styles.fieldLabel}
              >
                {t("adminClientsScreen.edit.contact.city")}
              </Text>
              <Input
                value={form.shippingCity}
                onChangeText={(v) => set("shippingCity", v)}
              />

              <Text
                size="xs"
                weight="semibold"
                dimRate="55%"
                textTransform="uppercase"
                style={styles.fieldLabel}
              >
                {t("adminClientsScreen.edit.contact.addressLine1")}
              </Text>
              <Input
                value={form.shippingAddressLine1}
                onChangeText={(v) => set("shippingAddressLine1", v)}
              />

              <Text
                size="xs"
                weight="semibold"
                dimRate="55%"
                textTransform="uppercase"
                style={styles.fieldLabel}
              >
                {t("adminClientsScreen.edit.contact.addressLine2")}
              </Text>
              <Input
                value={form.shippingAddressLine2}
                onChangeText={(v) => set("shippingAddressLine2", v)}
              />

              <Text
                size="xs"
                weight="semibold"
                dimRate="55%"
                textTransform="uppercase"
                style={styles.fieldLabel}
              >
                {t("adminClientsScreen.edit.contact.shortAddress")}
              </Text>
              <Input
                value={form.shippingShortAddress}
                onChangeText={(v) => set("shippingShortAddress", v)}
                autoCapitalize="characters"
              />
            </View>

            <SectionLabel style={styles.sectionSpacing}>
              {t("adminClientsScreen.edit.contact.shippingAddressAr")}
            </SectionLabel>
            <View style={styles.shippingCardAr}>
              <Text
                size="xs"
                weight="semibold"
                dimRate="55%"
                textTransform="uppercase"
                style={styles.fieldLabel}
              >
                {t("adminClientsScreen.edit.contact.shippingContactNameAr")}
              </Text>
              <Input
                value={form.shippingContactNameAr}
                onChangeText={(v) => set("shippingContactNameAr", v)}
                style={styles.rtlInput}
              />

              <Text
                size="xs"
                weight="semibold"
                dimRate="55%"
                textTransform="uppercase"
                style={styles.fieldLabel}
              >
                {t("adminClientsScreen.edit.contact.shippingContactPhoneAr")}
              </Text>
              <Input
                value={form.shippingContactPhoneAr}
                onChangeText={(v) => set("shippingContactPhoneAr", v)}
                keyboardType="phone-pad"
                style={styles.rtlInput}
              />

              <Text
                size="xs"
                weight="semibold"
                dimRate="55%"
                textTransform="uppercase"
                style={styles.fieldLabel}
              >
                {t("adminClientsScreen.edit.contact.cityAr")}
              </Text>
              <Input
                value={form.shippingCityAr}
                onChangeText={(v) => set("shippingCityAr", v)}
                style={styles.rtlInput}
              />

              <Text
                size="xs"
                weight="semibold"
                dimRate="55%"
                textTransform="uppercase"
                style={styles.fieldLabel}
              >
                {t("adminClientsScreen.edit.contact.addressLine1Ar")}
              </Text>
              <Input
                value={form.shippingAddressLine1Ar}
                onChangeText={(v) => set("shippingAddressLine1Ar", v)}
                style={styles.rtlInput}
              />

              <Text
                size="xs"
                weight="semibold"
                dimRate="55%"
                textTransform="uppercase"
                style={styles.fieldLabel}
              >
                {t("adminClientsScreen.edit.contact.addressLine2Ar")}
              </Text>
              <Input
                value={form.shippingAddressLine2Ar}
                onChangeText={(v) => set("shippingAddressLine2Ar", v)}
                style={styles.rtlInput}
              />

              <Text
                size="xs"
                weight="semibold"
                dimRate="55%"
                textTransform="uppercase"
                style={styles.fieldLabel}
              >
                {t("adminClientsScreen.edit.contact.shortAddressAr")}
              </Text>
              <Input
                value={form.shippingShortAddressAr}
                onChangeText={(v) => set("shippingShortAddressAr", v)}
                style={styles.rtlInput}
              />
            </View>
          </>
        )}

        {activeTab === "pricing" && (
          <>
            <ChipSelect
              label={t("adminClientsScreen.edit.pricing.billingCurrency")}
              value={form.preferredCurrency}
              onChange={(v) => set("preferredCurrency", v as "SAR" | "USD")}
              options={[
                { value: "SAR", label: "SAR" },
                { value: "USD", label: "USD" },
              ]}
            />

            <SectionLabel style={styles.sectionSpacing}>
              {t("adminClientsScreen.edit.pricing.credit")}
            </SectionLabel>
            <InfoCard>
              <InfoRow
                label={t("adminClientsScreen.edit.pricing.creditLimit")}
                value={`SAR ${formatMoney(credit?.limit)}`}
              />
              <InfoRow
                label={t("adminClientsScreen.edit.pricing.outstanding")}
                value={`SAR ${formatMoney(credit?.outstanding)}`}
              />
              <InfoRow
                label={t("adminClientsScreen.edit.pricing.available")}
                value={`SAR ${formatMoney(credit?.available)}`}
                valueColor="#1E9E4B"
              />
            </InfoCard>

            {!isAccountManager && (
              <>
                <Text
                  size="xs"
                  weight="semibold"
                  dimRate="55%"
                  textTransform="uppercase"
                  style={styles.fieldLabel}
                >
                  {t("adminClientsScreen.edit.pricing.setCreditLimit")}
                </Text>
                <View style={styles.inlineRow}>
                  <View style={styles.inlineInput}>
                    <Input
                      value={creditLimitInput}
                      onChangeText={setCreditLimitInput}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                    />
                  </View>
                  <Button
                    title={
                      creditMutation.isPending
                        ? t("adminClientsScreen.edit.pricing.saving")
                        : t("adminClientsScreen.edit.pricing.saveLimit")
                    }
                    onPress={handleSaveCreditLimit}
                    loading={creditMutation.isPending}
                    disabled={creditMutation.isPending}
                    style={styles.inlineButton}
                  />
                </View>
              </>
            )}
          </>
        )}

        {activeTab === "features" && (
          <View style={styles.toggleCard}>
            <PermissionSwitchRow
              label={t("adminClientsScreen.edit.features.salesChannels")}
              value={!!client.salesFeaturesEnabled}
              onValueChange={(v) =>
                salesFeaturesMutation.mutate({ id: id as string, enabled: v })
              }
              disabled={isAccountManager || salesFeaturesMutation.isPending}
            />
            <Text size="xs" dimRate="55%" style={styles.hint}>
              {t("adminClientsScreen.edit.features.salesChannelsHint")}
            </Text>

            <View style={styles.toggleDivider} />

            <PermissionSwitchRow
              label={t("adminClientsScreen.edit.features.dangerousGoods")}
              value={!!client.dangerousGoodsEnabled}
              onValueChange={(v) =>
                dgMutation.mutate({ id: id as string, enabled: v })
              }
              disabled={isAccountManager || dgMutation.isPending}
            />
            <Text size="xs" dimRate="55%" style={styles.hint}>
              {t("adminClientsScreen.edit.features.dangerousGoodsHint")}
            </Text>
          </View>
        )}
      </KeyboardAwareScreen>

      {managerPickerOpen && (
        <BottomSheet visible onClose={() => setManagerPickerOpen(false)}>
          <Text size="medium" weight="bold" style={styles.pickerTitle}>
            {t("adminClientsScreen.edit.account.accountManager")}
          </Text>
          <ScrollView>
            <Pressable
              style={styles.pickerOption}
              onPress={() => {
                set("assignedAccountManagerUserId", "unassigned");
                setManagerPickerOpen(false);
              }}
            >
              <Text
                size="small"
                weight={
                  form.assignedAccountManagerUserId === "unassigned"
                    ? "semibold"
                    : "regular"
                }
              >
                {t("adminClientsScreen.card.unassigned")}
              </Text>
              {form.assignedAccountManagerUserId === "unassigned" && (
                <Ionicons
                  name="checkmark"
                  size={rs(18)}
                  color={Colors.primary}
                />
              )}
            </Pressable>
            {(accountManagers ?? []).map((manager) => {
              const isSelected =
                form.assignedAccountManagerUserId === manager.id;
              return (
                <Pressable
                  key={manager.id}
                  style={styles.pickerOption}
                  onPress={() => {
                    set("assignedAccountManagerUserId", manager.id);
                    setManagerPickerOpen(false);
                  }}
                >
                  <Text
                    size="small"
                    weight={isSelected ? "semibold" : "regular"}
                  >
                    {manager.username}
                  </Text>
                  {isSelected && (
                    <Ionicons
                      name="checkmark"
                      size={rs(18)}
                      color={Colors.primary}
                    />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </BottomSheet>
      )}
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
  tabsScrollView: {
    flexGrow: 0,
    flexShrink: 0,
  },
  tabsRow: {
    flexGrow: 0,
    alignItems: "flex-start",
    gap: rs(8),
    marginBottom: rvs(16),
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
  fieldLabel: {
    marginBottom: rvs(8),
    letterSpacing: 0.5,
  },
  fieldWrapper: {
    marginBottom: rvs(14),
  },
  rtlInput: {
    textAlign: "right",
  },
  hint: {
    marginTop: -rvs(8),
    marginBottom: rvs(14),
    lineHeight: rs(16),
  },
  selectBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: rvs(50),
    paddingHorizontal: rs(18),
    borderRadius: rs(16),
    backgroundColor: Colors.inputBackground,
    borderWidth: 1.5,
    borderColor: Colors.inputBackground,
  },
  toggleCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    padding: rs(14),
  },
  toggleDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: rvs(4),
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(8),
    marginTop: rvs(14),
    paddingVertical: rvs(14),
    borderRadius: rs(14),
    borderWidth: 1.5,
    borderColor: Colors.error,
    backgroundColor: Colors.white,
  },
  deleteButtonText: {
    color: Colors.error,
  },
  sectionSpacing: {
    marginTop: rvs(6),
  },
  shippingCard: {
    backgroundColor: Colors.border,
    borderRadius: rs(14),
    padding: rs(14),
    marginBottom: rvs(4),
    borderStartWidth: rs(3),
    borderStartColor: Colors.primary,
  },
  shippingCardAr: {
    backgroundColor: Colors.border,
    borderRadius: rs(14),
    padding: rs(14),
    marginBottom: rvs(4),
    borderStartWidth: rs(3),
    borderStartColor: Colors.primary,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(10),
  },
  inlineInput: {
    flex: 1,
  },
  inlineButton: {
    width: rs(120),
    height: rvs(50),
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
