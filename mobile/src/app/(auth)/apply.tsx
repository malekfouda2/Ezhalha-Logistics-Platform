// app/apply.tsx

import React, { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import {
  applicationFormSchema,
  type ApplicationFormData,
} from "@shared/schema";

import {
  CompanyApplicationDocumentType,
  serializeApplicationDocumentReference,
} from "@shared/application-documents";

import { KeyboardAwareScreen } from "@/components/ui/KeyboardAwareScreen";
import { BackButton } from "@/components/ui/BackButton";
import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { DocUploadRow } from "@/components/ui/DocumentUpload";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { CountrySelect } from "@/components/ui/CountrySelect";
import { RescanBanner } from "@/components/ui/RescanBanner";

import {
  useCreateApplication,
  useExtractCompanyDetails,
} from "@/lib/hooks/useAuth";

import type { UploadedDocument } from "@/lib/services/auth";
import Toast from "react-native-toast-message";

type DocumentField =
  | "taxCertificate"
  | "commercialRegistration"
  | "memorandumOfAssociation"
  | "directorId";

const DOCUMENT_FIELDS: DocumentField[] = [
  "taxCertificate",
  "commercialRegistration",
  "memorandumOfAssociation",
  "directorId",
];

const DOCUMENT_CONFIG: Record<
  DocumentField,
  {
    type: CompanyApplicationDocumentType;
    label: string;
  }
> = {
  taxCertificate: {
    type: "TAX_CERTIFICATE",
    label: "Tax Certificate",
  },

  commercialRegistration: {
    type: "COMMERCIAL_REGISTRATION",
    label: "Commercial Registration",
  },

  memorandumOfAssociation: {
    type: "ESTABLISHMENT_CONTRACT",
    label: "Memorandum of Association",
  },

  directorId: {
    type: "DIRECTOR_ID",
    label: "Director ID",
  },
};

export default function ApplyScreen() {
  const { t, i18n } = useTranslation();

  const [isScanning, setIsScanning] = useState(false);

  /*
   * UI-only phone state.
   * The actual phone number is stored in react-hook-form.
   */
  const [phoneDialCode, setPhoneDialCode] = useState("+966");
  const [phoneFlag, setPhoneFlag] = useState("🇸🇦");

  const [contactPhoneDialCode, setContactPhoneDialCode] = useState("+966");

  const [contactPhoneFlag, setContactPhoneFlag] = useState("🇸🇦");

  /*
   * Store the complete uploaded document objects.
   *
   * This is separate from the form's `documents` field because
   * we need the complete object when calling the extraction API.
   */
  const [uploadedDocuments, setUploadedDocuments] = useState<
    Partial<Record<DocumentField, UploadedDocument>>
  >({});

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ApplicationFormData>({
    resolver: zodResolver(applicationFormSchema),

    defaultValues: {
      accountType: "company",

      name: "",
      email: "",
      phone: "",

      companyName: "",
      documents: [],

      shippingContactName: "",
      shippingContactPhone: "",

      shippingCountryCode: "",
      shippingStateOrProvince: "",
      shippingCity: "",
      shippingPostalCode: "",

      shippingAddressLine1: "",
      shippingAddressLine2: "",
      shippingShortAddress: "",
    },
  });

  const watchedType = watch("accountType");
  const shippingCountryCode = watch("shippingCountryCode");

  const createApplicationMutation = useCreateApplication();
  const extractCompanyDetailsMutation = useExtractCompanyDetails();

  /*
   * Change account type.
   */
  const handleAccountTypeChange = (type: "company" | "individual") => {
    setValue("accountType", type, {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  /*
   * Get all currently uploaded documents.
   */
  const getUploadedDocuments = (
    documentsState: Partial<
      Record<DocumentField, UploadedDocument>
    > = uploadedDocuments,
  ): UploadedDocument[] => {
    return DOCUMENT_FIELDS.map((field) => documentsState[field]).filter(
      (document): document is UploadedDocument => Boolean(document),
    );
  };

  /*
   * Autofill application fields from uploaded documents.
   */
  const autofillFromDocuments = async (docs: UploadedDocument[]) => {
    if (docs.length === 0) {
      return;
    }

    setIsScanning(true);

    try {
      const { details } = await extractCompanyDetailsMutation.mutateAsync(docs);

      const applyIfEmpty = (
        fieldName: keyof ApplicationFormData,
        value?: string,
      ) => {
        const clean = (value || "").trim();

        if (!clean) {
          return false;
        }

        const currentValue = String(getValues(fieldName) || "").trim();

        /*
         * Don't overwrite information the user has already entered.
         */
        if (currentValue) {
          return false;
        }

        setValue(fieldName, clean as ApplicationFormData[typeof fieldName], {
          shouldValidate: false,
          shouldDirty: true,
        });

        return true;
      };

      const filledCount = [
        applyIfEmpty("companyName", details.companyName),

        applyIfEmpty("shippingContactName", details.contactName),

        applyIfEmpty("shippingContactPhone", details.contactPhone),

        applyIfEmpty("shippingCountryCode", details.countryCode),

        applyIfEmpty("shippingStateOrProvince", details.stateOrProvince),

        applyIfEmpty("shippingCity", details.city),

        applyIfEmpty("shippingPostalCode", details.postalCode),

        applyIfEmpty("shippingAddressLine1", details.addressLine1),

        applyIfEmpty("shippingAddressLine2", details.addressLine2),

        applyIfEmpty("shippingShortAddress", details.shortAddress),
      ].filter(Boolean).length;

      console.log(
        `Document extraction completed. Filled ${filledCount} fields.`,
      );
    } catch (error) {
      console.error("Document extraction failed:", error);
    } finally {
      setIsScanning(false);
    }
  };

  /*
   * Update one document.
   *
   * This updates:
   * 1. Local uploadedDocuments state
   * 2. react-hook-form `documents`
   */
  const updateDocument = (
    field: DocumentField,
    document: UploadedDocument | null,
  ) => {
    setUploadedDocuments((current) => {
      const updated = {
        ...current,
      };

      if (document) {
        updated[field] = document;
      } else {
        delete updated[field];
      }

      const documents = getUploadedDocuments(updated).map((doc) =>
        serializeApplicationDocumentReference({
          path: doc.path,
          name: doc.name,
          type: doc.type,
          label: doc.label,
        }),
      );

      setValue("documents", documents, {
        shouldValidate: true,
        shouldDirty: true,
      });

      return updated;
    });
  };

  /*
   * Pick a document.
   */
  const pickDocument = async (field: DocumentField) => {
    try {
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

      if (result.canceled) {
        return;
      }

      const file = result.assets[0];

      const config = DOCUMENT_CONFIG[field];

      const document: UploadedDocument = {
        type: config.type,
        label: config.label,
        name: file.name,
        path: file.uri,
        contentType: file.mimeType || "application/octet-stream",
      };

      /*
       * Build the next state ourselves because React state
       * updates are asynchronous.
       */
      const nextDocuments = {
        ...uploadedDocuments,
        [field]: document,
      };

      setUploadedDocuments(nextDocuments);

      /*
       * Keep form documents synchronized.
       */
      const serializedDocuments = getUploadedDocuments(nextDocuments).map(
        (doc) =>
          serializeApplicationDocumentReference({
            path: doc.path,
            name: doc.name,
            type: doc.type,
            label: doc.label,
          }),
      );

      setValue("documents", serializedDocuments, {
        shouldValidate: true,
        shouldDirty: true,
      });

      /*
       * Immediately scan/autofill using all currently
       * uploaded documents.
       */
      await autofillFromDocuments(getUploadedDocuments(nextDocuments));
    } catch (error) {
      console.error("Document picker failed:", error);
    }
  };

  /*
   * Remove a document.
   */
  const removeDocument = (field: DocumentField) => {
    updateDocument(field, null);
  };

  /*
   * Rescan all uploaded documents.
   */
  const scanDocuments = async () => {
    const documents = getUploadedDocuments();

    if (documents.length === 0) {
      return;
    }

    await autofillFromDocuments(documents);
  };

  /*
   * Submit application.
   */
  const onSubmit = async (data: ApplicationFormData) => {
    try {
      const documents = getUploadedDocuments();

      const payload: ApplicationFormData = {
        ...data,

        /*
         * Add selected country dial code to phone.
         */
        phone: data.phone ? `${phoneDialCode}${data.phone}` : data.phone,

        /*
         * Add selected country dial code to shipping contact phone.
         */
        shippingContactPhone: data.shippingContactPhone
          ? `${contactPhoneDialCode}${data.shippingContactPhone}`
          : data.shippingContactPhone,

        /*
         * Serialize documents in the same format
         * expected by the backend.
         */
        documents: documents.map((doc) =>
          serializeApplicationDocumentReference({
            path: doc.path,
            name: doc.name,
            type: doc.type,
            label: doc.label,
          }),
        ),
      };

      await createApplicationMutation.mutateAsync(payload);

      Toast.show({
        type: "success",
        text1: t("toast.apply.successTitle"),
        text2: t("toast.apply.successMessage"),
      });

      router.replace("/login");
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("toast.apply.errorTitle"),
        text2:
          error instanceof Error
            ? error.message
            : t("toast.apply.errorMessage"),
      });
    }
  };

  const hasUploadedDocuments = getUploadedDocuments().length > 0;

  const isSubmittingApplication =
    isSubmitting || createApplicationMutation.isPending;

  return (
    <KeyboardAwareScreen contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.headerRow}>
        <BackButton />
      </View>

      <Text
        size="title"
        weight="bold"
        style={{
          marginTop: rvs(20),
        }}
      >
        {t("apply.title")}
      </Text>

      <Text
        size="medium"
        dimRate="60%"
        style={{
          marginTop: rvs(6),
        }}
      >
        {t("apply.subtitle")}
      </Text>

      {/* ========================= */}
      {/* Account Type */}
      {/* ========================= */}

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
            watchedType === "company" && styles.typeCardActive,
          ]}
          onPress={() => handleAccountTypeChange("company")}
        >
          <Text
            size="medium"
            weight="bold"
            style={{
              color: watchedType === "company" ? Colors.primary : Colors.text,
            }}
          >
            {t("apply.accountType.company")}
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.typeCard,
            watchedType === "individual" && styles.typeCardActive,
          ]}
          onPress={() => handleAccountTypeChange("individual")}
        >
          <Text
            size="medium"
            weight="bold"
            style={{
              color:
                watchedType === "individual" ? Colors.primary : Colors.text,
            }}
          >
            {t("apply.accountType.individual")}
          </Text>
        </Pressable>
      </View>

      {/* ========================= */}
      {/* Company */}
      {/* ========================= */}

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
                value={value ?? ""}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.companyName?.message}
              />
            )}
          />
        </>
      )}

      {/* ========================= */}
      {/* Contact */}
      {/* ========================= */}

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
        name="name"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            placeholder={t("apply.contact.fullName")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.name?.message}
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
            dialCode={phoneDialCode}
            onChangeDialCode={setPhoneDialCode}
            countryFlag={phoneFlag}
            onChangeCountryFlag={setPhoneFlag}
            placeholder={t("apply.contact.phone")}
            searchPlaceholder={t("phoneInput.searchPlaceholder")}
            pickerLang={i18n.language}
            error={errors.phone?.message}
          />
        )}
      />

      {/* ========================= */}
      {/* Shipping Address */}
      {/* ========================= */}

      <Text
        size="xs"
        weight="semibold"
        dimRate="60%"
        textTransform="uppercase"
        style={styles.sectionLabel}
      >
        {t("apply.shipping.sectionLabel")}
      </Text>

      <Text
        size="xs"
        dimRate="60%"
        style={{
          marginBottom: rvs(12),
        }}
      >
        {t("apply.shipping.description")}
      </Text>

      {/* Country */}

      <Controller
        control={control}
        name="shippingCountryCode"
        render={({ field: { onChange, value } }) => (
          <CountrySelect
            value={value}
            onChange={(country) => onChange(country.code)}
            placeholder={t("apply.shipping.selectCountry")}
            title={t("countryPicker.title")}
            searchPlaceholder={t("countryPicker.searchPlaceholder")}
            pickerLang={i18n.language}
            error={errors.shippingCountryCode?.message}
          />
        )}
      />

      {/* Shipping Contact */}

      <Controller
        control={control}
        name="shippingContactName"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            placeholder={t("apply.shipping.contactPersonName")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.shippingContactName?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="shippingContactPhone"
        render={({ field: { onChange, value } }) => (
          <PhoneInput
            value={value}
            onChangeValue={onChange}
            dialCode={contactPhoneDialCode}
            onChangeDialCode={setContactPhoneDialCode}
            countryFlag={contactPhoneFlag}
            onChangeCountryFlag={setContactPhoneFlag}
            searchPlaceholder={t("phoneInput.searchPlaceholder")}
            placeholder={t("apply.shipping.contactPhone")}
            pickerLang={i18n.language}
            error={errors.shippingContactPhone?.message}
          />
        )}
      />

      {/* Address */}

      <Controller
        control={control}
        name="shippingAddressLine1"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            placeholder={t("apply.shipping.addressLine1")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.shippingAddressLine1?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="shippingAddressLine2"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            placeholder={t("apply.shipping.addressLine2")}
            value={value ?? ""}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.shippingAddressLine2?.message}
          />
        )}
      />

      <View style={styles.halfInput}>
        <Controller
          control={control}
          name="shippingStateOrProvince"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              placeholder={t("apply.shipping.stateProvince")}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.shippingStateOrProvince?.message}
            />
          )}
        />
      </View>

      <View style={styles.halfInput}>
        <Controller
          control={control}
          name="shippingCity"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              placeholder={t("apply.shipping.city")}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.shippingCity?.message}
            />
          )}
        />
      </View>

      <Controller
        control={control}
        name="shippingPostalCode"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            placeholder={t("apply.shipping.postalCode")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.shippingPostalCode?.message}
          />
        )}
      />

      {/* Saudi Short Address */}

      {shippingCountryCode === "SA" && (
        <Controller
          control={control}
          name="shippingShortAddress"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              placeholder={t("apply.shipping.shortAddress")}
              value={value ?? ""}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.shippingShortAddress?.message}
            />
          )}
        />
      )}

      {/* ========================= */}
      {/* Company Documents */}
      {/* ========================= */}

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

          <Text
            size="xs"
            dimRate="60%"
            style={{
              marginBottom: rvs(12),
            }}
          >
            {t("documents.description")}
          </Text>

          {hasUploadedDocuments && (
            <RescanBanner
              onRescan={scanDocuments}
              loading={isScanning || extractCompanyDetailsMutation.isPending}
              bannerText={t("rescan.banner")}
              buttonText={t("rescan.button")}
              scanningText={t("documents.readingScan")}
            />
          )}

          <Text
            size="xs"
            dimRate="60%"
            style={{
              marginBottom: rvs(12),
            }}
          >
            {t("documents.hint")}
          </Text>

          {/* Tax Certificate */}

          <DocUploadRow
            label={t("documents.taxCertificate")}
            subLabel={t("documents.requiredNote")}
            fileName={uploadedDocuments.taxCertificate?.name || ""}
            error={errors.documents?.message}
            onPick={() => pickDocument("taxCertificate")}
            onRemove={() => removeDocument("taxCertificate")}
            uploadText={t("documents.upload")}
            replaceText={t("documents.replace")}
            noFileText={t("documents.noFile")}
          />

          {/* Commercial Registration */}

          <DocUploadRow
            label={t("documents.commercialRegistration")}
            subLabel={t("documents.requiredNote")}
            fileName={uploadedDocuments.commercialRegistration?.name || ""}
            error={errors.documents?.message}
            onPick={() => pickDocument("commercialRegistration")}
            onRemove={() => removeDocument("commercialRegistration")}
            uploadText={t("documents.upload")}
            replaceText={t("documents.replace")}
            noFileText={t("documents.noFile")}
          />

          {/* Memorandum of Association */}

          <DocUploadRow
            label={t("documents.memorandumOfAssociation")}
            subLabel={t("documents.requiredNote")}
            fileName={uploadedDocuments.memorandumOfAssociation?.name || ""}
            error={errors.documents?.message}
            onPick={() => pickDocument("memorandumOfAssociation")}
            onRemove={() => removeDocument("memorandumOfAssociation")}
            uploadText={t("documents.upload")}
            replaceText={t("documents.replace")}
            noFileText={t("documents.noFile")}
          />

          {/* Director ID */}

          <DocUploadRow
            label={t("documents.directorId")}
            subLabel={t("documents.requiredNote")}
            fileName={uploadedDocuments.directorId?.name || ""}
            error={errors.documents?.message}
            onPick={() => pickDocument("directorId")}
            onRemove={() => removeDocument("directorId")}
            uploadText={t("documents.upload")}
            replaceText={t("documents.replace")}
            noFileText={t("documents.noFile")}
          />
        </>
      )}

      {/* ========================= */}
      {/* Submit */}
      {/* ========================= */}

      <Button
        title={t("apply.submit")}
        onPress={handleSubmit(onSubmit)}
        loading={isSubmittingApplication}
        style={{
          marginTop: rvs(24),
        }}
      />

      <View
        style={{
          height: rvs(40),
        }}
      />
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
