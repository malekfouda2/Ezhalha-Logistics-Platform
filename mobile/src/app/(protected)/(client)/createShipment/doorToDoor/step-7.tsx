// app/create-shipment/doorToDoor/step-7.tsx

import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { DocUploadRow } from "@/components/ui/DocumentUpload";
import { InvoiceItemRow } from "@/components/sections/createShipment/doorToDoor/InvoiceItemRow";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import InfoBox from "@/components/ui/InfoBox";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { useDocumentsStep } from "@/lib/hooks/createShipment/doorToDoor/useDocumentsStep";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

export default function DocumentsScreen() {
  const { t } = useTranslation();
  const {
    invoiceDocument,
    packingListDocument,
    isExtractingInvoice,
    invoiceSummary,
    uploadingKind,
    uploadInvoice,
    uploadPacking,
    removeInvoice,
    removePacking,
    items,
    addItem,
    updateItem,
    removeItem,
    handleContinue,
    handleBack,
  } = useDocumentsStep();

  return (
    <ShipmentStepLayout
      step={7}
      totalSteps={9}
      title={t("createShipment.freight.steps.step7.title")}
      subtitle={t("createShipment.freight.steps.step7.subtitle")}
      onContinue={handleContinue}
      onBack={handleBack}
    >
      <DocUploadRow
        label={t("createShipment.freight.steps.step7.commercialInvoice")}
        subLabel={t("createShipment.freight.steps.step7.required")}
        fileName={
          invoiceDocument
            ? t("createShipment.freight.steps.step7.uploaded")
            : undefined
        }
        onPick={uploadInvoice}
        onRemove={invoiceDocument ? removeInvoice : undefined}
        isLoading={uploadingKind === "invoice" || isExtractingInvoice}
        uploadText={t("createShipment.freight.steps.step7.upload")}
        replaceText={t("createShipment.freight.steps.step7.uploaded")}
      />

      <DocUploadRow
        label={t("createShipment.freight.steps.step7.packingList")}
        subLabel={t("createShipment.freight.steps.step7.recommended")}
        fileName={
          packingListDocument
            ? t("createShipment.freight.steps.step7.uploaded")
            : undefined
        }
        onPick={uploadPacking}
        onRemove={packingListDocument ? removePacking : undefined}
        isLoading={uploadingKind === "packing"}
        uploadText={t("createShipment.freight.steps.step7.upload")}
        replaceText={t("createShipment.freight.steps.step7.uploaded")}
      />

      {invoiceSummary ? (
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
                count: invoiceSummary.importedItemCount,
              })}
            </Text>
            <Text size="small" style={styles.extractionSummaryText}>
              {t("createShipment.express.steps.step6.invoiceSummaryReview")}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <SectionTitle title={t("createShipment.freight.steps.step7.invoiceItems")} />

        <Pressable style={styles.addItemButton} onPress={() => addItem()} hitSlop={8}>
          <Feather name="plus" size={rs(14)} color={Colors.primary} />
          <Text size="xs" weight="bold" style={styles.addItemText}>
            {t("createShipment.freight.steps.step7.addItem")}
          </Text>
        </Pressable>
      </View>

      {items.length > 0 && (
        items.map((item, index) => (
          <InvoiceItemRow
            key={index}
            item={item}
            onChange={(patch) => updateItem(index, patch)}
            onRemove={() => removeItem(index)}
            placeholders={{
              itemName: t("createShipment.freight.steps.step7.itemName"),
              category: t("createShipment.freight.steps.step7.category"),
              origin: t("createShipment.freight.steps.step7.origin"),
              quantity: t("createShipment.freight.steps.step7.quantity"),
              price: t("createShipment.freight.steps.step7.price"),
              hsCode: t("createShipment.freight.steps.step7.hsCode"),
            }}
          />
        ))
      )}

      <InfoBox text={t("createShipment.freight.steps.step7.info")} />
    </ShipmentStepLayout>
  );
}

const styles = StyleSheet.create({
  extractionSummaryBox: {
    flexDirection: "row",
    gap: rvs(8),
    padding: rvs(12),
    borderRadius: rvs(10),
    borderWidth: 1,
    borderColor: Colors.amberBorderColor,
    backgroundColor: Colors.amberBackgroundColor,
    marginBottom: rvs(16),
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

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: rvs(8),
  },

  addItemButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(4),
    paddingHorizontal: rs(12),
    paddingVertical: rvs(7),
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },

  addItemText: {
    color: Colors.primary,
  },

  emptyItemsText: {
    color: "#687994",
    textAlign: "center",
    paddingVertical: rvs(16),
  },
});
