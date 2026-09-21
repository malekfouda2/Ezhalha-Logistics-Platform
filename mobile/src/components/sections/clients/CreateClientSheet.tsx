import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { ChipSelect } from "@/components/ui/ChipSelect";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useKeyboardHeight } from "@/lib/hooks/useKeyboardHeight";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { useAdminAccountManagerOptions, useAdminClientProfileOptions, useCreateAdminClient } from "@/lib/hooks/useAdminClients";
import { createClientSchema, type CreateClientFormData } from "@/schemas/adminClient";

// The list/edit screens don't collect a country, so a new client is created against the
// platform's primary market — matches the +966 phone default and SAR currency default.
const DEFAULT_COUNTRY = "Saudi Arabia";

interface CreateClientSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function CreateClientSheet({ visible, onClose }: CreateClientSheetProps) {
  const { t } = useTranslation();
  const { height: screenHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();
  const sheetMaxHeight = Math.min(screenHeight * 0.85, screenHeight - keyboardHeight - rvs(60));

  const { hasPermission } = useAdminAccess();
  const canReadAccountManagers = hasPermission("account-managers", "read");
  const canAssignAccountManagers = hasPermission("account-managers", "assign");

  const { data: profileOptions } = useAdminClientProfileOptions();
  const { data: accountManagers } = useAdminAccountManagerOptions();
  const createMutation = useCreateAdminClient();

  const [phone, setPhone] = useState("");
  const [profile, setProfile] = useState("regular");
  const [accountManagerUserId, setAccountManagerUserId] = useState<string>("unassigned");
  const [managerPickerOpen, setManagerPickerOpen] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateClientFormData>({
    resolver: zodResolver(createClientSchema),
    defaultValues: { companyName: "", contactName: "", email: "", phone: "" },
  });

  const resetForm = () => {
    reset({ companyName: "", contactName: "", email: "", phone: "" });
    setPhone("");
    setProfile("regular");
    setAccountManagerUserId("unassigned");
  };

  const onSubmit = async (data: CreateClientFormData) => {
    try {
      await createMutation.mutateAsync({
        name: data.contactName.trim(),
        email: data.email.trim(),
        phone: phone || data.phone,
        country: DEFAULT_COUNTRY,
        companyName: data.companyName.trim(),
        profile,
        assignedAccountManagerUserId:
          canReadAccountManagers && canAssignAccountManagers && accountManagerUserId !== "unassigned"
            ? accountManagerUserId
            : undefined,
      });
      onClose();
      resetForm();
      Toast.show({
        type: "success",
        text1: t("adminClientsScreen.create.successTitle"),
        text2: t("adminClientsScreen.create.successMessage", { name: data.companyName.trim() }),
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("adminClientsScreen.create.errorTitle"),
        text2: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const isCreating = isSubmitting || createMutation.isPending;
  const profileChipOptions = (profileOptions ?? []).map((option) => ({ value: option.profile, label: option.displayName }));
  const selectedManagerLabel =
    accountManagerUserId === "unassigned"
      ? t("adminClientsScreen.create.assignLater")
      : accountManagers?.find((m) => m.id === accountManagerUserId)?.username ?? t("adminClientsScreen.create.assignLater");

  return (
    <BottomSheet
      visible={visible}
      onClose={() => {
        onClose();
        resetForm();
      }}
    >
      <ScrollView style={{ maxHeight: sheetMaxHeight }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text size="large" weight="bold" style={styles.title}>
          {t("adminClientsScreen.create.title")}
        </Text>
        <Text size="small" dimRate="60%" style={styles.subtitle}>
          {t("adminClientsScreen.create.subtitle")}
        </Text>

        <Text size="xs" weight="semibold" dimRate="55%" textTransform="uppercase" style={styles.sectionLabel}>
          {t("adminClientsScreen.create.companyName")}
        </Text>
        <Controller
          control={control}
          name="companyName"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              placeholder={t("adminClientsScreen.create.companyNamePlaceholder")}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.companyName?.message}
            />
          )}
        />

        <Text size="xs" weight="semibold" dimRate="55%" textTransform="uppercase" style={styles.sectionLabel}>
          {t("adminClientsScreen.create.primaryContact")}
        </Text>
        <Controller
          control={control}
          name="contactName"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              placeholder={t("adminClientsScreen.create.fullNamePlaceholder")}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.contactName?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              placeholder={t("adminClientsScreen.create.workEmailPlaceholder")}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email?.message}
            />
          )}
        />

        <Text size="xs" weight="semibold" dimRate="55%" textTransform="uppercase" style={styles.sectionLabel}>
          {t("adminClientsScreen.create.phone")}
        </Text>
        <PhoneInput value={phone} onChangeValue={setPhone} error={errors.phone?.message} />

        <ChipSelect
          label={t("adminClientsScreen.create.pricingProfile")}
          value={profile}
          onChange={setProfile}
          options={profileChipOptions.length > 0 ? profileChipOptions : [{ value: "regular", label: t("adminClientsScreen.profiles.regular") }]}
        />

        {canReadAccountManagers && canAssignAccountManagers && (
          <View style={styles.fieldWrapper}>
            <Text size="xs" weight="semibold" dimRate="55%" textTransform="uppercase" style={styles.fieldLabel}>
              {t("adminClientsScreen.create.accountManager")}
            </Text>
            <Pressable style={styles.selectBox} onPress={() => setManagerPickerOpen(true)}>
              <Text size="small" style={{ color: accountManagerUserId !== "unassigned" ? Colors.text : Colors.placeholder }}>
                {selectedManagerLabel}
              </Text>
              <Ionicons name="chevron-down" size={rs(18)} color={Colors.placeholder} />
            </Pressable>
          </View>
        )}

        <Button
          title={isCreating ? t("adminClientsScreen.create.submitting") : t("adminClientsScreen.create.submit")}
          onPress={handleSubmit(onSubmit)}
          loading={isCreating}
          disabled={isCreating}
          style={styles.submit}
        />
      </ScrollView>

      {managerPickerOpen && (
        <BottomSheet visible onClose={() => setManagerPickerOpen(false)}>
          <Text size="medium" weight="bold" style={styles.pickerTitle}>
            {t("adminClientsScreen.create.accountManager")}
          </Text>
          <ScrollView>
            <Pressable
              style={styles.pickerOption}
              onPress={() => {
                setAccountManagerUserId("unassigned");
                setManagerPickerOpen(false);
              }}
            >
              <Text size="small" weight={accountManagerUserId === "unassigned" ? "semibold" : "regular"}>
                {t("adminClientsScreen.create.assignLater")}
              </Text>
              {accountManagerUserId === "unassigned" && <Ionicons name="checkmark" size={rs(18)} color={Colors.primary} />}
            </Pressable>
            {(accountManagers ?? []).map((manager) => {
              const isSelected = accountManagerUserId === manager.id;
              return (
                <Pressable
                  key={manager.id}
                  style={styles.pickerOption}
                  onPress={() => {
                    setAccountManagerUserId(manager.id);
                    setManagerPickerOpen(false);
                  }}
                >
                  <Text size="small" weight={isSelected ? "semibold" : "regular"}>
                    {manager.username}
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
  title: {
    marginTop: rvs(16),
  },
  subtitle: {
    marginTop: rvs(4),
    marginBottom: rvs(16),
  },
  sectionLabel: {
    marginBottom: rvs(8),
    letterSpacing: 0.5,
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
  submit: {
    marginTop: rvs(8),
    marginBottom: rvs(4),
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
