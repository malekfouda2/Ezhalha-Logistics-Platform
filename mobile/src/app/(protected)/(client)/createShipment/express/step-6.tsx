import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import * as DocumentPicker from "expo-document-picker";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { DashedActionButton } from "@/components/sections/createShipment/express/DashedActionButton";
import { CustomsItemCard } from "@/components/sections/createShipment/express/CustomsItemCard";
import { CustomsSummaryCard } from "@/components/sections/createShipment/express/CustomsSummaryCard";
import {
  HSCodeOption,
  HSCodeConfirmModal,
} from "@/components/sections/createShipment/express/HSCodeConfirmModal";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import InfoBox from "@/components/sections/createShipment/InfoBox";
import { useCustomsStep } from "@/lib/hooks/createShipment/express/useCustomsStep";
import { countryCodeToFlag } from "@/utils/utils";
import { COUNTRY_CODE_SELECT_OPTIONS } from "@shared/countries";
import { useState } from "react";

function getCountryName(countryCode: string) {
  return (
    COUNTRY_CODE_SELECT_OPTIONS.find((c) => c.value === countryCode)?.label ??
    countryCode
  );
}

export default function CustomsDetailsScreen() {
  const { t } = useTranslation();
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);

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
    handleContinue,
    handleBack,
  } = useCustomsStep();

  const activeItem = activeItemIndex !== null ? items[activeItemIndex] : undefined;
  const activeItemOptions: HSCodeOption[] =
    activeItem?.hsCodeCandidates.map((c) => ({ code: c.code, description: c.description })) ?? [];

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
      {invoiceDocument ? (
        <InfoBox
          text={
            invoiceExtractionSummary?.importedItemCount
              ? `${invoiceDocument.fileName} · ${invoiceExtractionSummary.importedItemCount} item(s) imported`
              : invoiceDocument.fileName
          }
          iconName="file-text"
        />
      ) : (
        <DashedActionButton
          icon="upload"
          label={
            isProcessingInvoice
              ? t("common.loading")
              : t("createShipment.express.steps.step6.scanInvoice")
          }
          onPress={handleScanInvoice}
        />
      )}

      {invoiceDocument ? (
        <View style={styles.clearRow}>
          <Text
            size="small"
            weight="semibold"
            style={styles.clearText}
            onPress={clearInvoiceDocument}
          >
            {t("createShipment.express.steps.step4.remove")}
          </Text>
        </View>
      ) : null}

      {items.map((item, index) => (
        <CustomsItemCard
          key={index}
          name={item.itemName}
          category={item.category}
          material={item.material}
          countryFlag={countryCodeToFlag(item.countryOfOrigin)}
          countryName={getCountryName(item.countryOfOrigin)}
          totalPrice={(item.price * item.quantity).toFixed(2)}
          quantity={item.quantity}
          unitPrice={item.price.toFixed(2)}
          hsCode={item.hsCode}
          confidence={item.hsCodeConfidence === "HIGH" ? "high" : "review"}
          removable={items.length > 1}
          onPressHSCode={() => setActiveItemIndex(index)}
          onRemove={() => removeItem(index)}
        />
      ))}

      <DashedActionButton
        icon="plus"
        label={t("createShipment.express.steps.step6.addItem")}
        onPress={() => addItem()}
      />

      <View style={styles.summaryGap} />

      <CustomsSummaryCard
        itemCount={items.length}
        unitCount={totalUnits}
        totalPrice={totalPrice}
        declaredValue={totalPrice}
        declaredCurrency={items[0]?.currency ?? "SAR"}
      />

      <HSCodeConfirmModal
        visible={activeItemIndex !== null}
        itemName={activeItem?.itemName ?? ""}
        options={activeItemOptions}
        defaultCode={activeItem?.hsCode}
        onConfirm={handleConfirmHSCode}
        onClose={() => setActiveItemIndex(null)}
      />
    </ShipmentStepLayout>
  );
}

const styles = StyleSheet.create({
  summaryGap: {
    height: rvs(6),
  },

  clearRow: {
    alignItems: "flex-end",
    marginTop: -rvs(6),
    marginBottom: rvs(14),
  },

  clearText: {
    color: Colors.secondary,
  },

  footer: {
    paddingHorizontal: rs(20),
    paddingTop: rvs(10),
    paddingBottom: rvs(10),
    backgroundColor: Colors.background,
  },
});
