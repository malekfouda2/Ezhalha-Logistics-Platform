// components/sections/createShipment/express/AddItemModal.tsx
import React, { useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CountrySelect } from "@/components/ui/CountrySelect";
import { PackageTypeSelect } from "@/components/sections/createShipment/express/PackageTypeSelect";
import {
  HSCodeConfirmModal,
  HSCodeOption,
} from "@/components/sections/createShipment/express/HSCodeConfirmModal";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { itemCategoryOptions, itemCurrencyOptions } from "@/constants/customsItemOptions";
import { customsItemSchema, CustomsItemFormValues } from "@/schemas/customsItem";
import {
  CustomsItem,
  HsCodeConfidence,
  HsCodeSource,
  defaultCustomsItem,
} from "@/store/createShipmentStore";
import { lookupHsCode, confirmHsCode } from "@/lib/services/createShipment";

// Approximate combined height of the modal header, footer, and BottomSheet's
// own paddings/handle — reserved space the scrollable body must yield when
// the keyboard is up so the footer buttons stay above the keyboard.
const CHROME_RESERVE_HEIGHT = rvs(240);

// Mirrors web's confidenceFromNumber (client/src/pages/client/create-shipment.tsx)
function confidenceFromNumber(c: number): HsCodeConfidence {
  if (c >= 0.7) return "HIGH";
  if (c >= 0.4) return "MEDIUM";
  if (c > 0) return "LOW";
  return "MISSING";
}

interface AddItemModalProps {
  visible: boolean;
  mode: "add" | "edit";
  initialItem?: CustomsItem;
  destinationCountryCode: string;
  onClose: () => void;
  onSubmit: (item: CustomsItem) => void;
}

export const AddItemModal = ({
  visible,
  mode,
  initialItem,
  destinationCountryCode,
  onClose,
  onSubmit,
}: AddItemModalProps) => {
  const { t } = useTranslation();

  const [hsCodeCandidates, setHsCodeCandidates] = useState<CustomsItem["hsCodeCandidates"]>([]);
  const [hsCodeSource, setHsCodeSource] = useState<HsCodeSource>("");
  const [hsCodeConfidence, setHsCodeConfidence] = useState<HsCodeConfidence>("");
  const [hsManualEntry, setHsManualEntry] = useState(false);
  const [isLookingUpHsCode, setIsLookingUpHsCode] = useState(false);
  const [hsPickerVisible, setHsPickerVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const { height: windowHeight } = useWindowDimensions();

  // Shrinks the scrollable body while the keyboard is up so the header/footer
  // never get pushed off-screen by BottomSheet's keyboard-avoiding padding.
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) =>
      setKeyboardHeight(e.endCoordinates?.height ?? 0),
    );
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // BottomSheet shifts the sheet up by exactly keyboardHeight on both
  // platforms, so the body must yield that same amount here too.
  const bodyMaxHeight =
    keyboardHeight > 0
      ? Math.max(rvs(140), windowHeight - keyboardHeight - CHROME_RESERVE_HEIGHT)
      : rvs(460);

  const form = useForm<CustomsItemFormValues>({
    resolver: zodResolver(customsItemSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: {
      itemName: defaultCustomsItem.itemName,
      category: defaultCustomsItem.category,
      countryOfOrigin: defaultCustomsItem.countryOfOrigin,
      price: defaultCustomsItem.price,
      currency: defaultCustomsItem.currency,
      quantity: defaultCustomsItem.quantity,
      itemDescription: defaultCustomsItem.itemDescription,
      material: defaultCustomsItem.material,
      hsCode: defaultCustomsItem.hsCode,
    },
  });

  const {
    control,
    watch,
    setValue,
    handleSubmit,
    reset,
    formState: { errors },
  } = form;

  useEffect(() => {
    if (!visible) return;
    const source = initialItem ?? defaultCustomsItem;
    reset({
      itemName: source.itemName,
      category: source.category,
      countryOfOrigin: source.countryOfOrigin,
      price: source.price,
      currency: source.currency,
      quantity: source.quantity,
      itemDescription: source.itemDescription,
      material: source.material,
      hsCode: source.hsCode,
    });
    setHsCodeCandidates(source.hsCodeCandidates ?? []);
    setHsCodeSource(source.hsCodeSource ?? "");
    setHsCodeConfidence(source.hsCodeConfidence ?? "");
    setHsManualEntry(false);
  }, [visible, initialItem, reset]);

  const itemName = watch("itemName");
  const category = watch("category");
  const countryOfOrigin = watch("countryOfOrigin");
  const hsCode = watch("hsCode");

  const handleLookupHsCode = async () => {
    if (!itemName.trim() || !category || !countryOfOrigin) {
      Toast.show({
        type: "error",
        text1: t("createShipment.express.steps.step6.itemModal.lookupMissingFieldsTitle"),
        text2: t("createShipment.express.steps.step6.itemModal.lookupMissingFieldsMessage"),
      });
      return;
    }

    setIsLookingUpHsCode(true);
    try {
      const data = await lookupHsCode({
        itemName,
        category,
        countryOfOrigin,
        destinationCountry: destinationCountryCode,
        itemDescription: watch("itemDescription") || undefined,
        material: watch("material") || undefined,
      });

      const topCandidate = data.candidates[0];
      setHsCodeCandidates(data.candidates);
      setHsCodeSource(data.source as HsCodeSource);
      setHsCodeConfidence(topCandidate ? confidenceFromNumber(topCandidate.confidence) : "MISSING");
      setHsManualEntry(false);
      setValue("hsCode", topCandidate ? topCandidate.code : "", { shouldValidate: true });
    } catch {
      Toast.show({
        type: "error",
        text1: t("createShipment.express.steps.step6.itemModal.lookupFailedTitle"),
      });
    } finally {
      setIsLookingUpHsCode(false);
    }
  };

  const handleConfirmHsCodeCandidate = (code: string) => {
    const candidate = hsCodeCandidates.find((c) => c.code === code);
    setValue("hsCode", code, { shouldValidate: true });
    if (candidate) {
      setHsCodeConfidence(confidenceFromNumber(candidate.confidence));
    }
    setHsPickerVisible(false);

    confirmHsCode({
      itemName,
      category,
      material: watch("material") || undefined,
      countryOfOrigin,
      hsCode: code,
      description: candidate?.description,
    });
  };

  const onSave = handleSubmit((values) => {
    const item: CustomsItem = {
      itemName: values.itemName,
      itemDescription: values.itemDescription || values.itemName,
      category: values.category,
      material: values.material || "",
      countryOfOrigin: values.countryOfOrigin,
      hsCode: values.hsCode || "",
      hsCodeSource,
      hsCodeConfidence,
      hsCodeCandidates,
      price: values.price,
      currency: values.currency,
      quantity: values.quantity,
    };
    onSubmit(item);
  });

  const hsCodeOptions: HSCodeOption[] = hsCodeCandidates.map((c) => ({
    code: c.code,
    description: c.description,
  }));

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text size="xl" weight="bold">
              {mode === "edit"
                ? t("createShipment.express.steps.step6.itemModal.editTitle")
                : t("createShipment.express.steps.step6.itemModal.addTitle")}
            </Text>
            <Text size="small" dimRate="70%" style={{ marginTop: rvs(4) }}>
              {t("createShipment.express.steps.step6.itemModal.subtitle")}
            </Text>
          </View>

          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={rs(22)} color={Colors.text} />
          </Pressable>
        </View>

        <ScrollView
          style={{ maxHeight: bodyMaxHeight }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Controller
            control={control}
            name="itemName"
            render={({ field }) => (
              <Input
                label={t("createShipment.express.steps.step6.itemModal.itemName")}
                placeholder={t("createShipment.express.steps.step6.itemModal.itemNamePlaceholder")}
                value={field.value}
                onChangeText={field.onChange}
                error={errors.itemName?.message}
              />
            )}
          />

          <Text size="medium" weight="semibold" style={styles.fieldLabel}>
            {t("createShipment.express.steps.step6.itemModal.category")}
          </Text>
          <Controller
            control={control}
            name="category"
            render={({ field }) => (
              <PackageTypeSelect
                title={t("createShipment.express.steps.step6.itemModal.category")}
                options={itemCategoryOptions}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          {errors.category ? (
            <Text size="xs" weight="medium" style={styles.errorText}>
              {errors.category.message}
            </Text>
          ) : null}

          <View style={styles.gap} />

          <Text size="medium" weight="semibold" style={styles.fieldLabel}>
            {t("createShipment.express.steps.step6.itemModal.countryOfOrigin")}
          </Text>
          <Controller
            control={control}
            name="countryOfOrigin"
            render={({ field }) => (
              <CountrySelect
                value={field.value}
                onChange={(selected) => field.onChange(selected.code)}
                title={t("createShipment.express.steps.step6.itemModal.countryOfOrigin")}
                error={errors.countryOfOrigin?.message}
              />
            )}
          />

          <View style={styles.row}>
            <View style={styles.half}>
              <Controller
                control={control}
                name="price"
                render={({ field }) => (
                  <Input
                    label={t("createShipment.express.steps.step6.itemModal.unitPrice")}
                    value={String(field.value)}
                    onChangeText={(text) => field.onChange(Number(text) || 0)}
                    keyboardType="decimal-pad"
                    error={errors.price?.message}
                  />
                )}
              />
            </View>

            <View style={styles.half}>
              <Text size="medium" weight="semibold" style={styles.fieldLabel}>
                {t("createShipment.express.steps.step6.itemModal.currency")}
              </Text>
              <Controller
                control={control}
                name="currency"
                render={({ field }) => (
                  <PackageTypeSelect
                    title={t("createShipment.express.steps.step6.itemModal.currency")}
                    options={itemCurrencyOptions}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </View>
          </View>

          <Controller
            control={control}
            name="quantity"
            render={({ field }) => (
              <Input
                label={t("createShipment.express.steps.step6.itemModal.quantity")}
                value={String(field.value)}
                onChangeText={(text) => field.onChange(parseInt(text, 10) || 1)}
                keyboardType="number-pad"
                error={errors.quantity?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="itemDescription"
            render={({ field }) => (
              <Input
                label={t("createShipment.express.steps.step6.itemModal.itemDescription")}
                placeholder={t(
                  "createShipment.express.steps.step6.itemModal.itemDescriptionPlaceholder",
                )}
                value={field.value}
                onChangeText={field.onChange}
                multiline
                numberOfLines={3}
                style={styles.textarea}
              />
            )}
          />

          <Controller
            control={control}
            name="material"
            render={({ field }) => (
              <Input
                label={t("createShipment.express.steps.step6.itemModal.material")}
                placeholder={t("createShipment.express.steps.step6.itemModal.materialPlaceholder")}
                value={field.value}
                onChangeText={field.onChange}
              />
            )}
          />

          <View style={styles.hsSection}>
            <View style={styles.hsHeaderRow}>
              <Text size="medium" weight="semibold">
                {t("createShipment.express.steps.step6.itemModal.hsCode")}
              </Text>

              <Button
                title={
                  isLookingUpHsCode
                    ? t("createShipment.express.steps.step6.itemModal.lookingUp")
                    : t("createShipment.express.steps.step6.itemModal.lookupHsCode")
                }
                variant="outline"
                loading={isLookingUpHsCode}
                onPress={handleLookupHsCode}
                disabled={!itemName.trim() || !category || !countryOfOrigin}
                style={styles.lookupButton}
              />
            </View>

            {hsManualEntry ? (
              <Controller
                control={control}
                name="hsCode"
                render={({ field }) => (
                  <Input
                    placeholder={t(
                      "createShipment.express.steps.step6.itemModal.hsCodePlaceholder",
                    )}
                    value={field.value}
                    onChangeText={(text) => {
                      field.onChange(text);
                      setHsCodeSource("USER");
                      setHsCodeConfidence(text.length >= 6 ? "HIGH" : "MEDIUM");
                    }}
                  />
                )}
              />
            ) : hsCodeCandidates.length > 0 ? (
              <Pressable onPress={() => setHsPickerVisible(true)} style={styles.suggestedRow}>
                <Text size="small" style={{ flex: 1 }}>
                  {t("createShipment.express.steps.step6.itemModal.suggestedCodes")}: {hsCode || "—"}
                </Text>
                <Text size="small" weight="semibold" style={styles.changeText}>
                  {t("createShipment.express.steps.step6.itemModal.change")}
                </Text>
              </Pressable>
            ) : null}

            <Pressable onPress={() => setHsManualEntry((prev) => !prev)}>
              <Text size="xs" weight="semibold" style={styles.toggleManualText}>
                {hsManualEntry
                  ? t("createShipment.express.steps.step6.itemModal.useSuggested")
                  : t("createShipment.express.steps.step6.itemModal.enterManually")}
              </Text>
            </Pressable>
          </View>

          <View style={styles.scrollBottomSpacer} />
        </ScrollView>

        <View style={styles.footer}>
          <View style={{ flex: 1 }}>
            <Button
              title={t("createShipment.express.steps.step6.itemModal.cancel")}
              variant="outline"
              onPress={onClose}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title={
                mode === "edit"
                  ? t("createShipment.express.steps.step6.itemModal.updateButton")
                  : t("createShipment.express.steps.step6.itemModal.addButton")
              }
              onPress={onSave}
            />
          </View>
        </View>
      </BottomSheet>

      <HSCodeConfirmModal
        visible={hsPickerVisible}
        itemName={itemName}
        options={hsCodeOptions}
        defaultCode={hsCode}
        onConfirm={handleConfirmHsCodeCandidate}
        onClose={() => setHsPickerVisible(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: rvs(14),
  },

  scrollBottomSpacer: {
    height: rvs(10),
  },

  fieldLabel: {
    color: Colors.text,
    marginBottom: rvs(10),
  },

  gap: {
    height: rvs(4),
  },

  row: {
    flexDirection: "row",
    gap: rs(12),
  },

  half: {
    flex: 1,
  },

  textarea: {
    height: rvs(80),
    paddingTop: rvs(14),
    textAlignVertical: "top",
  },

  errorText: {
    color: "#E53E3E",
    marginTop: -rvs(10),
    marginBottom: rvs(10),
  },

  hsSection: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: rvs(14),
    marginTop: rvs(4),
    marginBottom: rvs(20),
  },

  hsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: rvs(10),
  },

  lookupButton: {
    width: rs(160),
    height: rvs(40),
  },

  suggestedRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: rs(14),
    paddingVertical: rvs(12),
    marginBottom: rvs(10),
  },

  changeText: {
    color: Colors.primary,
  },

  toggleManualText: {
    color: Colors.secondary,
  },

  footer: {
    flexDirection: "row",
    gap: rs(12),
    paddingTop: rvs(14),
    paddingBottom: rvs(4),
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
