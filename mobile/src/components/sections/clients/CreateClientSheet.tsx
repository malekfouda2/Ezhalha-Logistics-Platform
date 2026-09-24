import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as DocumentPicker from "expo-document-picker";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { CountrySelect } from "@/components/ui/CountrySelect";
import { DocUploadRow } from "@/components/ui/DocumentUpload";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useKeyboardHeight } from "@/lib/hooks/useKeyboardHeight";
import { useUpload } from "@/lib/hooks/useUpload";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { useAdminAccountManagerOptions, useCreateAdminClient } from "@/lib/hooks/useAdminClients";
import { createClientSchema, type CreateClientFormData } from "@/schemas/adminClient";

interface UploadedDoc {
  path: string;
  name: string;
}

interface CreateClientSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function CreateClientSheet({ visible, onClose }: CreateClientSheetProps) {
  const { t } = useTranslation();
  const { height: screenHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();
  const sheetMaxHeight = Math.min(screenHeight * 0.7, screenHeight - keyboardHeight - rvs(60));

  const { hasPermission } = useAdminAccess();
  const canReadAccountManagers = hasPermission("account-managers", "read");
  const canAssignAccountManagers = hasPermission("account-managers", "assign");

  const { data: accountManagers } = useAdminAccountManagerOptions();
  const createMutation = useCreateAdminClient();
  const { uploadFile, isUploading } = useUpload({
    onError: () =>
      Toast.show({ type: "error", text1: t("toast.apply.uploadErrorTitle") }),
  });

  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [country, setCountry] = useState<{ code: string; name: string } | null>(null);
  const [countryError, setCountryError] = useState<string | undefined>();
  const [accountManagerUserId, setAccountManagerUserId] = useState<string>("unassigned");
  const [managerPickerOpen, setManagerPickerOpen] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateClientFormData>({
    resolver: zodResolver(createClientSchema),
    defaultValues: { companyName: "", contactName: "", email: "" },
  });

  const resetForm = () => {
    reset({ companyName: "", contactName: "", email: "" });
    setPhone("");
    setPhoneError(undefined);
    setCountry(null);
    setCountryError(undefined);
    setAccountManagerUserId("unassigned");
    setUploadedDocs([]);
  };

  const handlePickDocuments = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/jpeg",
        "image/png",
      ],
      multiple: true,
      copyToCacheDirectory: true,
    });

    if (result.canceled) return;

    for (const file of result.assets) {
      const uploaded = await uploadFile({
        uri: file.uri,
        name: file.name,
        type: file.mimeType || "application/octet-stream",
        size: file.size ?? 0,
      });
      if (uploaded) {
        setUploadedDocs((prev) => [...prev, { path: uploaded.objectPath, name: uploaded.metadata.name }]);
      }
    }
  };

  const onSubmit = async (data: CreateClientFormData) => {
    const trimmedPhone = phone.trim();
    let hasError = false;

    if (trimmedPhone.length < 6) {
      setPhoneError(t("adminClientsScreen.form.errors.phoneRequired"));
      hasError = true;
    } else {
      setPhoneError(undefined);
    }

    if (!country) {
      setCountryError(t("adminClientsScreen.form.errors.countryRequired"));
      hasError = true;
    } else {
      setCountryError(undefined);
    }

    if (hasError) return;

    try {
      await createMutation.mutateAsync({
        name: data.contactName.trim(),
        email: data.email.trim(),
        phone: trimmedPhone,
        country: country!.name,
        companyName: data.companyName?.trim() || undefined,
        assignedAccountManagerUserId:
          canReadAccountManagers && canAssignAccountManagers && accountManagerUserId !== "unassigned"
            ? accountManagerUserId
            : undefined,
        documents: uploadedDocs.length > 0 ? uploadedDocs.map((doc) => doc.path) : undefined,
      });
      onClose();
      resetForm();
      Toast.show({
        type: "success",
        text1: t("adminClientsScreen.create.successTitle"),
        text2: t("adminClientsScreen.create.successMessage", { name: data.contactName.trim() }),
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
  const selectedManagerLabel =
    accountManagerUserId === "unassigned"
      ? t("adminClientsScreen.filters.unassigned")
      : accountManagers?.find((m) => m.id === accountManagerUserId)?.username ?? t("adminClientsScreen.filters.unassigned");

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

        <Text size="small" weight="medium" dimRate="65%" style={styles.sectionLabel}>
          {t("adminClientsScreen.create.fullName")}
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

        <Text size="small" weight="medium" dimRate="65%" style={styles.sectionLabel}>
          {t("adminClientsScreen.create.email")}
        </Text>
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              placeholder={t("adminClientsScreen.create.emailPlaceholder")}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email?.message}
            />
          )}
        />

        <Text size="small" weight="medium" dimRate="65%" style={styles.sectionLabel}>
          {t("adminClientsScreen.create.phone")}
        </Text>
        <PhoneInput value={phone} onChangeValue={setPhone} error={phoneError} />

        <Text size="small" weight="medium" dimRate="65%" style={styles.sectionLabel}>
          {t("adminClientsScreen.create.country")}
        </Text>
        <CountrySelect
          value={country?.code}
          onChange={setCountry}
          placeholder={t("adminClientsScreen.create.countryPlaceholder")}
          title={t("adminClientsScreen.create.countryPlaceholder")}
          searchPlaceholder={t("adminClientsScreen.create.countrySearchPlaceholder")}
          error={countryError}
        />

        <Text size="small" weight="medium" dimRate="65%" style={styles.sectionLabel}>
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

        {canReadAccountManagers && canAssignAccountManagers && (
          <View style={styles.fieldWrapper}>
            <Text size="small" weight="medium" dimRate="65%" style={styles.fieldLabel}>
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

        <DocUploadRow
          label={t("adminClientsScreen.create.documents")}
          subLabel={t("adminClientsScreen.create.documentsHint")}
          fileName={
            uploadedDocs.length > 0
              ? t("adminClientsScreen.create.documentsAttachedCount", { count: uploadedDocs.length })
              : undefined
          }
          isLoading={isUploading}
          onPick={handlePickDocuments}
          onRemove={() => setUploadedDocs([])}
          uploadText={t("documents.upload")}
          replaceText={t("documents.replace")}
          noFileText={t("documents.noFile")}
        />

        <Button
          title={isCreating ? t("adminClientsScreen.create.submitting") : t("adminClientsScreen.create.submit")}
          onPress={handleSubmit(onSubmit)}
          loading={isCreating}
          disabled={isCreating || isUploading}
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
                {t("adminClientsScreen.filters.unassigned")}
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
  },
  fieldWrapper: {
    marginBottom: rvs(14),
  },
  fieldLabel: {
    marginBottom: rvs(8),
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
