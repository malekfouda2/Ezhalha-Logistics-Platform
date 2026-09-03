// app/create-shipment/doorToDoor/step-5.tsx

import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import * as DocumentPicker from "expo-document-picker";
import { Feather } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { DocUploadRow } from "@/components/ui/DocumentUpload";
import { PackageCard } from "@/components/sections/createShipment/PackageCard";
import { DashedActionButton } from "@/components/sections/createShipment/DashedActionButton";
import { PackageSummaryCard } from "@/components/sections/createShipment/doorToDoor/PackageSummaryCard";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { usePackagesStep } from "@/lib/hooks/createShipment/doorToDoor/usePackagesStep";
import { Colors } from "@/constants/colors";
import { rvs } from "@/utils/responsive";

export default function PackageDetailsScreen() {
  const { t } = useTranslation();
  const {
    packages,
    transportMethod,
    totalCbm,
    totalWeight,
    totalVolume,
    updatePackage,
    addPackage,
    removePackage,
    setTotalCbm,
    isLoadingRates,
    packageListDocument,
    isUploadingPackageList,
    isExtractingPackageList,
    packageExtractionSummary,
    handlePackageListPick,
    clearPackageListDocument,
    handleContinue,
    handleBack,
  } = usePackagesStep();

  const isProcessingPackageList = isUploadingPackageList || isExtractingPackageList;

  const handleScanDocument = async () => {
    if (isProcessingPackageList) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/plain",
        "image/gif",
        "image/jpeg",
        "image/png",
      ],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;

    const file = result.assets[0];
    await handlePackageListPick({
      uri: file.uri,
      name: file.name,
      type: file.mimeType ?? "application/octet-stream",
      size: file.size ?? 0,
    });
  };

  return (
    <ShipmentStepLayout
      step={5}
      totalSteps={9}
      title={t("createShipment.freight.steps.step5.title")}
      subtitle={t("createShipment.freight.steps.step5.subtitle")}
      onContinue={handleContinue}
      onBack={handleBack}
      loading={isLoadingRates}
      continueLabel={
        isLoadingRates
          ? t("createShipment.freight.steps.step5.gettingRate")
          : t("createShipment.freight.steps.step5.getRate")
      }
    >
      <DocUploadRow
        label={t("createShipment.express.steps.step4.packingList")}
        subLabel={t("createShipment.express.steps.step4.packingListHint")}
        fileName={
          packageListDocument
            ? packageExtractionSummary?.importedPackageCount
              ? `${packageListDocument.fileName} · ${packageExtractionSummary.importedPackageCount} package(s) imported`
              : packageListDocument.fileName
            : undefined
        }
        onPick={handleScanDocument}
        onRemove={packageListDocument ? clearPackageListDocument : undefined}
        isLoading={isProcessingPackageList}
        uploadText={t("documents.upload")}
        replaceText={t("documents.replace")}
        noFileText={t("documents.noFile")}
      />

      {packageExtractionSummary ? (
        <View style={styles.extractionSummaryBox}>
          <Feather
            name="alert-triangle"
            size={rvs(16)}
            color={Colors.amberTextColor}
            style={styles.extractionSummaryIcon}
          />
          <View style={styles.extractionSummaryTextGroup}>
            <Text size="small" weight="semibold" style={styles.extractionSummaryText}>
              {t("createShipment.express.steps.step4.packingListSummaryTitle", {
                count: packageExtractionSummary.importedPackageCount,
              })}
            </Text>
            <Text size="small" style={styles.extractionSummaryText}>
              {t("createShipment.express.steps.step4.packingListSummaryWeight", {
                weight: packageExtractionSummary.totalWeight.toFixed(3),
                unit: "KG",
              })}
            </Text>
            <Text size="small" style={styles.extractionSummaryText}>
              {t("createShipment.express.steps.step4.packingListSummaryReview")}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.summaryGap} />

      {packages.map((pkg, index) => (
        <PackageCard
          key={index}
          index={index + 1}
          label={t("createShipment.freight.steps.step5.packageLabel")}
          weight={String(pkg.weight ?? "")}
          length={String(pkg.length ?? "")}
          width={String(pkg.width ?? "")}
          height={String(pkg.height ?? "")}
          weightUnit="KG"
          dimensionUnit="CM"
          onChangeWeight={(v) => updatePackage(index, { weight: Number(v) || 0 })}
          onChangeLength={(v) => updatePackage(index, { length: Number(v) || 0 })}
          onChangeWidth={(v) => updatePackage(index, { width: Number(v) || 0 })}
          onChangeHeight={(v) => updatePackage(index, { height: Number(v) || 0 })}
          onRemove={() => removePackage(index)}
          removable={packages.length > 1}
        />
      ))}

      <DashedActionButton
        icon="plus"
        label={t("createShipment.freight.steps.step5.addPackageButton")}
        onPress={addPackage}
      />

      {transportMethod === "sea" ? (
        <View style={styles.cbmInput}>
          <Input
            placeholder={t("createShipment.freight.steps.step5.totalCbm")}
            value={totalCbm ? String(totalCbm) : ""}
            onChangeText={(v) => setTotalCbm(Number(v) || 0)}
            keyboardType="decimal-pad"
          />
        </View>
      ) : null}

      <PackageSummaryCard
        rows={[
          { label: t("createShipment.freight.steps.step5.totalVolume"), value: `${totalVolume.toFixed(2)} CBM` },
          { label: t("createShipment.freight.steps.step5.totalWeight"), value: `${totalWeight.toFixed(0)} kg` },
        ]}
      />
    </ShipmentStepLayout>
  );
}

const styles = StyleSheet.create({
  summaryGap: {
    height: rvs(10),
  },

  cbmInput: {
    marginBottom: rvs(16),
  },

  extractionSummaryBox: {
    flexDirection: "row",
    gap: rvs(8),
    padding: rvs(12),
    borderRadius: rvs(10),
    borderWidth: 1,
    borderColor: Colors.amberBorderColor,
    backgroundColor: Colors.amberBackgroundColor,
    marginBottom: rvs(10),
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
