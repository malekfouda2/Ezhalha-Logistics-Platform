// app/apply.tsx
import React, { useMemo, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { KeyboardAwareScreen } from "@/components/ui/KeyboardAwareScreen";
import { BackButton } from "@/components/ui/BackButton";
import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { ApplyFormValues, createApplySchema } from "@/schemas/apply";
import { DocUploadRow } from "@/components/ui/DocumentUpload";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { CountrySelect } from "@/components/ui/CountrySelect";
import { RescanBanner } from "@/components/ui/RescanBanner";

export default function ApplyScreen() {
  const { t, i18n } = useTranslation();
  const [accountType, setAccountType] = useState<"company" | "individual">(
    "company",
  );

  const applySchema = useMemo(() => createApplySchema(t), [t]);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ApplyFormValues>({
    resolver: zodResolver(applySchema),
    defaultValues: {
      accountType: "company",
      fullName: "",
      email: "",
      phone: "",
      phoneDialCode: "+966",
      phoneFlag: "🇸🇦",
      country: "",
      addressLine1: "",
      addressLine2: "",
      stateProvince: "",
      city: "",
      postalCode: "",
      companyName: "",
      contactName: "",
      contactPhone: "",
      contactPhoneDialCode: "+966",
      contactPhoneFlag: "🇸🇦",
      taxCertificate: "",
      commercialRegistration: "",
      memorandumOfAssociation: "",
      directorId: "",
    } as ApplyFormValues,
  });
  const watchedType = watch("accountType");

  const [isScanning, setIsScanning] = useState(false);

  const scanDocuments = async () => {
    setIsScanning(true);
    try {
      console.log("Scanning documents...");
      await new Promise((resolve) => setTimeout(resolve, 10000));
      console.log("Scan complete!");
    } catch (e) {
      console.error("Scan failed:", e);
    } finally {
      setIsScanning(false);
    }
  };

  const handleAccountTypeChange = (type: "company" | "individual") => {
    setAccountType(type);
    setValue("accountType", type as any);
  };

  const pickDocument = async (
    field:
      | "taxCertificate"
      | "commercialRegistration"
      | "memorandumOfAssociation"
      | "directorId",
  ) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/jpeg",
        "image/png",
      ],
      copyToCacheDirectory: true,
    });

    if (result.canceled) return;

    const file = result.assets[0];
    setValue(field as any, file.name, { shouldValidate: true });

    scanDocuments();
  };

  const onSubmit = async (data: ApplyFormValues) => {
    try {
      console.log("Submitting application:", data);
      // await api.submitApplication(data);
      router.push("/apply-success");
    } catch (e) {
      console.error(e);
    }
  };

  const documentFields = watch([
    "taxCertificate" as any,
    "commercialRegistration" as any,
    "memorandumOfAssociation" as any,
    "directorId" as any,
  ]);

  return (
    <KeyboardAwareScreen contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <BackButton />
      </View>

      <Text size="title" weight="bold" style={{ marginTop: rvs(20) }}>
        {t("apply.title")}
      </Text>
      <Text size="medium" dimRate="60%" style={{ marginTop: rvs(6) }}>
        {t("apply.subtitle")}
      </Text>

      {/* Account Type */}
      <Text
        size="xs"
        weight="semibold"
        dimRate="60%"
        textTransform="uppercase"
        style={styles.sectionLabel}
      >
        {t("apply.accountType.label")}
      </Text>

      <View style={styles.typeRow}>
        <Pressable
          style={[
            styles.typeCard,
            accountType === "company" && styles.typeCardActive,
          ]}
          onPress={() => handleAccountTypeChange("company")}
        >
          <Text
            size="medium"
            weight="bold"
            style={{
              color: accountType === "company" ? Colors.primary : Colors.text,
            }}
          >
            {t("apply.accountType.company")}
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.typeCard,
            accountType === "individual" && styles.typeCardActive,
          ]}
          onPress={() => handleAccountTypeChange("individual")}
        >
          <Text
            size="medium"
            weight="bold"
            style={{
              color:
                accountType === "individual" ? Colors.primary : Colors.text,
            }}
          >
            {t("apply.accountType.individual")}
          </Text>
        </Pressable>
      </View>

      {/* Company Section */}
      {watchedType === "company" && (
        <>
          <Text
            size="xs"
            weight="semibold"
            dimRate="60%"
            textTransform="uppercase"
            style={styles.sectionLabel}
          >
            {t("apply.company.sectionLabel")}
          </Text>

          <Controller
            control={control}
            name="companyName"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                placeholder={t("apply.company.companyName")}
                value={value as string}
                onChangeText={onChange}
                onBlur={onBlur}
                error={(errors as any).companyName?.message}
              />
            )}
          />

          <Controller
            control={control}
            name={"commercialRegistration" as any}
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                placeholder={t("apply.company.commercialRegistrationNo")}
                value={value as string}
                onChangeText={onChange}
                onBlur={onBlur}
                keyboardType="number-pad"
                error={(errors as any).commercialRegistration?.message}
              />
            )}
          />
        </>
      )}

      {/* Contact Section */}
      <Text
        size="xs"
        weight="semibold"
        dimRate="60%"
        textTransform="uppercase"
        style={styles.sectionLabel}
      >
        {t("apply.contact.sectionLabel")}
      </Text>

      <Controller
        control={control}
        name="fullName"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            placeholder={t("apply.contact.fullName")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.fullName?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            placeholder={t("apply.contact.email")}
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
        name="phone"
        render={({ field: { onChange, value } }) => (
          <PhoneInput
            value={value}
            onChangeValue={onChange}
            dialCode={watch("phoneDialCode") || "+966"}
            onChangeDialCode={(code) => setValue("phoneDialCode" as any, code)}
            countryFlag={watch("phoneFlag" as any)}
            onChangeCountryFlag={(flag) => setValue("phoneFlag" as any, flag)}
            placeholder={t("apply.contact.phone")}
            searchPlaceholder={t("phoneInput.searchPlaceholder")}
            pickerLang={i18n.language}
            error={errors.phone?.message}
          />
        )}
      />

      {/* Shipping Address */}
      <Text
        size="xs"
        weight="semibold"
        dimRate="60%"
        textTransform="uppercase"
        style={styles.sectionLabel}
      >
        {t("apply.shipping.sectionLabel")}
      </Text>
      <Text size="xs" dimRate="60%" style={{ marginBottom: rvs(12) }}>
        {t("apply.shipping.description")}
      </Text>

      <Controller
        control={control}
        name="country"
        render={({ field: { onChange, value } }) => (
          <CountrySelect
            value={value}
            onChange={(c) => onChange(c.name)}
            placeholder={t("apply.shipping.selectCountry")}
            title={t("countryPicker.title")}
            searchPlaceholder={t("countryPicker.searchPlaceholder")}
            pickerLang={i18n.language}
            error={errors.country?.message}
          />
        )}
      />

      {/* Company-only contact person fields */}
      {watchedType === "company" && (
        <>
          <Controller
            control={control}
            name={"contactName" as any}
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                placeholder={t("apply.shipping.contactPersonName")}
                value={value as string}
                onChangeText={onChange}
                onBlur={onBlur}
                error={(errors as any).contactName?.message}
              />
            )}
          />

          <Controller
            control={control}
            name={"contactPhone" as any}
            render={({ field: { onChange, value } }) => (
              <PhoneInput
                value={value as string}
                onChangeValue={onChange}
                dialCode={watch("contactPhoneDialCode" as any) || "+966"}
                onChangeDialCode={(code) =>
                  setValue("contactPhoneDialCode" as any, code)
                }
                countryFlag={watch("contactPhoneFlag" as any)}
                onChangeCountryFlag={(flag) =>
                  setValue("contactPhoneFlag" as any, flag)
                }
                searchPlaceholder={t("phoneInput.searchPlaceholder")}
                placeholder={t("apply.shipping.contactPhone")}
                pickerLang={i18n.language}
                error={(errors as any).contactPhone?.message}
              />
            )}
          />
        </>
      )}

      <Controller
        control={control}
        name="addressLine1"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            placeholder={t("apply.shipping.addressLine1")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.addressLine1?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="addressLine2"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            placeholder={t("apply.shipping.addressLine2")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
          />
        )}
      />

      <View style={styles.halfInput}>
        <Controller
          control={control}
          name="stateProvince"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              placeholder={t("apply.shipping.stateProvince")}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.stateProvince?.message}
            />
          )}
        />
      </View>

      <View style={styles.halfInput}>
        <Controller
          control={control}
          name="city"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              placeholder={t("apply.shipping.city")}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.city?.message}
            />
          )}
        />
      </View>

      <Controller
        control={control}
        name="postalCode"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            placeholder={t("apply.shipping.postalCode")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.postalCode?.message}
          />
        )}
      />

      {/* Company Documents */}
      {watchedType === "company" && (
        <>
          <Text
            size="xs"
            weight="semibold"
            dimRate="60%"
            textTransform="uppercase"
            style={styles.sectionLabel}
          >
            {t("documents.sectionLabel")}
          </Text>
          <Text size="xs" dimRate="60%" style={{ marginBottom: rvs(12) }}>
            {t("documents.description")}
          </Text>

          {documentFields.some((f) => !!f) && (
            <RescanBanner
              onRescan={scanDocuments}
              loading={isScanning}
              bannerText={t("rescan.banner")}
              buttonText={t("rescan.button")}
              scanningText={t("documents.readingScan")}
            />
          )}

          <Text size="xs" dimRate="60%" style={{ marginBottom: rvs(12) }}>
            {t("documents.hint")}
          </Text>

          <DocUploadRow
            label={t("documents.taxCertificate")}
            subLabel={t("documents.requiredNote")}
            fileName={documentFields[0] as string}
            error={(errors as any).taxCertificate?.message}
            onPick={() => pickDocument("taxCertificate")}
            onRemove={() =>
              setValue("taxCertificate" as any, "", { shouldValidate: true })
            }
            uploadText={t("documents.upload")}
            replaceText={t("documents.replace")}
            noFileText={t("documents.noFile")}
          />

          <DocUploadRow
            label={t("documents.commercialRegistration")}
            subLabel={t("documents.requiredNote")}
            fileName={documentFields[1] as string}
            error={(errors as any).commercialRegistration?.message}
            onPick={() => pickDocument("commercialRegistration")}
            onRemove={() =>
              setValue("commercialRegistration" as any, "", {
                shouldValidate: true,
              })
            }
            uploadText={t("documents.upload")}
            replaceText={t("documents.replace")}
            noFileText={t("documents.noFile")}
          />

          <DocUploadRow
            label={t("documents.memorandumOfAssociation")}
            subLabel={t("documents.requiredNote")}
            fileName={documentFields[2] as string}
            error={(errors as any).memorandumOfAssociation?.message}
            onPick={() => pickDocument("memorandumOfAssociation")}
            onRemove={() =>
              setValue("memorandumOfAssociation" as any, "", {
                shouldValidate: true,
              })
            }
            uploadText={t("documents.upload")}
            replaceText={t("documents.replace")}
            noFileText={t("documents.noFile")}
          />

          <DocUploadRow
            label={t("documents.directorId")}
            subLabel={t("documents.requiredNote")}
            fileName={documentFields[3] as string}
            error={(errors as any).directorId?.message}
            onPick={() => pickDocument("directorId")}
            onRemove={() =>
              setValue("directorId" as any, "", { shouldValidate: true })
            }
            uploadText={t("documents.upload")}
            replaceText={t("documents.replace")}
            noFileText={t("documents.noFile")}
          />
        </>
      )}

      <Button
        title={t("apply.submit")}
        onPress={handleSubmit(onSubmit)}
        loading={isSubmitting}
        style={{ marginTop: rvs(24) }}
      />

      <View style={{ height: rvs(40) }} />
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: rs(24),
    paddingTop: rvs(12),
  },
  headerRow: {
    flexDirection: "row",
  },
  sectionLabel: {
    marginTop: rvs(24),
    marginBottom: rvs(10),
  },
  typeRow: {
    flexDirection: "row",
    gap: rs(12),
    marginBottom: rvs(4),
  },
  typeCard: {
    flex: 1,
    height: rvs(58),
    borderRadius: rs(16),
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.inputBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  typeCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "14",
  },
  halfInput: {
    flex: 1,
  },
});
