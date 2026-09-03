import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import * as DocumentPicker from "expo-document-picker";
import { Feather } from "@expo/vector-icons";
import { Text } from "@/components/ui/Text";
import { DocUploadRow } from "@/components/ui/DocumentUpload";
import { rvs } from "@/utils/responsive";
import { DashedActionButton } from "@/components/sections/createShipment/DashedActionButton";
import { CustomsItemCard } from "@/components/sections/createShipment/express/CustomsItemCard";
import {
  HSCodeOption,
  HSCodeConfirmModal,
} from "@/components/sections/createShipment/express/HSCodeConfirmModal";
import { AddItemModal } from "@/components/sections/createShipment/express/AddItemModal";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { useCustomsStep } from "@/lib/hooks/createShipment/express/useCustomsStep";
import { countryCodeToFlag } from "@/utils/utils";
import { COUNTRY_CODE_SELECT_OPTIONS } from "@shared/countries";
import { Colors } from "@/constants/colors";

function getCountryName(countryCode: string) {
  return (
    COUNTRY_CODE_SELECT_OPTIONS.find((c) => c.value === countryCode)?.label ??
    countryCode
  );
}

type ItemModalState = { mode: "add" } | { mode: "edit"; index: number };

export default function CustomsDetailsScreen() {
  const { t } = useTranslation();
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
  const [itemModalState, setItemModalState] = useState<ItemModalState | null>(null);

  const {
    items,
    addItem,
    updateItem,
    removeItem,
    invoiceDocument,
    handleInvoicePick,
    clearInvoiceDocument,
    isUploadingInvoice,
    isExtractingInvoice,
    invoiceExtractionSummary,
    destinationCountryCode,
    handleContinue,
    handleBack,
  } = useCustomsStep();

  const activeItem = activeItemIndex !== null ? items[activeItemIndex] : undefined;
  const activeItemOptions: HSCodeOption[] =
    activeItem?.hsCodeCandidates.map((c) => ({ code: c.code, description: c.description })) ?? [];

  const hasFilledItems = items.some((item) => item.itemName.trim().length > 0);

  const totalPrice = items
    .reduce((sum, item) => sum + item.price * item.quantity, 0)
    .toFixed(2);
  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);
  const isProcessingInvoice = isUploadingInvoice || isExtractingInvoice;

  const handleScanInvoice = async () => {
    if (isProcessingInvoice) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "image/jpeg",
        "image/png",
      ],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;

    const file = result.assets[0];
    await handleInvoicePick({
      uri: file.uri,
      name: file.name,
      type: file.mimeType ?? "application/octet-stream",
      size: file.size ?? 0,
    });
  };

  const handleConfirmHSCode = (code: string) => {
    if (activeItemIndex !== null) {
      updateItem(activeItemIndex, {
        hsCode: code,
        hsCodeSource: "USER",
        hsCodeConfidence: "HIGH",
      });
    }
    setActiveItemIndex(null);
  };

  return (
    <ShipmentStepLayout
      step={6}
      totalSteps={8}
      title={t("createShipment.express.steps.step6.title")}
      subtitle={t("createShipment.express.steps.step6.subtitle")}
      onContinue={handleContinue}
      onBack={handleBack}
    >
      <DocUploadRow
        label={t("createShipment.express.steps.step6.invoiceLabel")}
        subLabel={t("createShipment.express.steps.step6.invoiceHint")}
        fileName={
          invoiceDocument
            ? invoiceExtractionSummary?.importedItemCount
              ? `${invoiceDocument.fileName} · ${invoiceExtractionSummary.importedItemCount} item(s) imported`
              : invoiceDocument.fileName
            : undefined
        }
        onPick={handleScanInvoice}
        onRemove={invoiceDocument ? clearInvoiceDocument : undefined}
        isLoading={isProcessingInvoice}
        uploadText={t("documents.upload")}
        replaceText={t("documents.replace")}
        noFileText={t("documents.noFile")}
      />

      {invoiceExtractionSummary ? (
        <View style={styles.extractionSummaryBox}>
          <Feather
            name="alert-triangle"
            size={rvs(16)}
            color={Colors.amberTextColor}
            style={styles.extractionSummaryIcon}
          />
          <View style={styles.extractionSummaryTextGroup}>
            <Text size="small" weight="semibold" style={styles.extractionSummaryText}>
              {t("createShipment.express.steps.step6.invoiceSummaryTitle", {
                count: invoiceExtractionSummary.importedItemCount,
              })}
            </Text>
            <Text size="small" style={styles.extractionSummaryText}>
              {t("createShipment.express.steps.step6.invoiceSummaryReview")}
            </Text>
            {invoiceExtractionSummary.autoMatchedHsCodeCount ? (
              <Text size="small" style={styles.extractionSummaryText}>
                {t("createShipment.express.steps.step6.invoiceSummaryAutoMatched", {
                  count: invoiceExtractionSummary.autoMatchedHsCodeCount,
                })}
              </Text>
            ) : null}
            {invoiceExtractionSummary.hsCodeReviewCount ? (
              <Text size="small" style={styles.extractionSummaryText}>
                {t("createShipment.express.steps.step6.invoiceSummaryNeedsReview", {
                  count: invoiceExtractionSummary.hsCodeReviewCount,
                })}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}


      {hasFilledItems ? (
        items.map((item, index) => (
          <CustomsItemCard
            key={index}
            name={item.itemName}
            category={item.category}
            material={item.material}
            countryFlag={countryCodeToFlag(item.countryOfOrigin)}
            countryName={getCountryName(item.countryOfOrigin)}
            currency={item.currency}
            totalPrice={(item.price * item.quantity).toFixed(2)}
            quantity={item.quantity}
            unitPrice={item.price.toFixed(2)}
            hsCode={item.hsCode}
            confidence={item.hsCodeConfidence === "HIGH" ? "high" : "review"}
            removable={items.length > 1}
            onPressHSCode={() => setActiveItemIndex(index)}
            onEdit={() => setItemModalState({ mode: "edit", index })}
            onRemove={() => removeItem(index)}
          />
        ))
      ) : (
        <Text size="small" style={styles.emptyItemsText}>
          {t("createShipment.express.steps.step6.noItemsYet")}
        </Text>
      )}

      <DashedActionButton
        icon="plus"
        label={t("createShipment.express.steps.step6.addItem")}
        onPress={() => setItemModalState({ mode: "add" })}
      />

      <View style={styles.summaryGap} />

      <HSCodeConfirmModal
        visible={activeItemIndex !== null}
        itemName={activeItem?.itemName ?? ""}
        options={activeItemOptions}
        defaultCode={activeItem?.hsCode}
        onConfirm={handleConfirmHSCode}
        onClose={() => setActiveItemIndex(null)}
      />

      <AddItemModal
        visible={itemModalState !== null}
        mode={itemModalState?.mode ?? "add"}
        initialItem={itemModalState?.mode === "edit" ? items[itemModalState.index] : undefined}
        destinationCountryCode={destinationCountryCode}
        onClose={() => setItemModalState(null)}
        onSubmit={(item) => {
          if (itemModalState?.mode === "edit") {
            updateItem(itemModalState.index, item);
          } else {
            addItem(item);
          }
          setItemModalState(null);
        }}
      />
    </ShipmentStepLayout>
  );
}

const styles = StyleSheet.create({
  summaryGap: {
    height: rvs(6),
  },

  emptyItemsText: {
    color: "#687994",
    textAlign: "center",
    paddingVertical: rvs(20),
  },

  extractionSummaryBox: {
    flexDirection: "row",
    gap: rvs(8),
    padding: rvs(12),
    borderRadius: rvs(10),
    borderWidth: 1,
    borderColor: Colors.amberBorderColor,
    backgroundColor: Colors.amberBackgroundColor,
    marginBottom: rvs(20),
  },

  extractionSummaryIcon: {
    marginTop: rvs(2),
  },

  extractionSummaryTextGroup: {
    flex: 1,
    gap: rvs(2),
  },

  extractionSummaryText: {
    color: Colors.amberTextColor,
  },
});
