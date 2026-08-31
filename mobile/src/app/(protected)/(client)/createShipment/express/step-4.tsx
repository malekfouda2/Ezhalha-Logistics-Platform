// app/create-shipment/express/step-4.tsx

import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import * as DocumentPicker from "expo-document-picker";

import { DashedActionButton } from "@/components/sections/createShipment/express/DashedActionButton";
import { PackageCard } from "@/components/sections/createShipment/express/PackageCard";
import { PackageTypeSelect } from "@/components/sections/createShipment/express/PackageTypeSelect";
import { UnitToggle } from "@/components/sections/createShipment/express/UnitToggle";
import { WeightSummaryCard } from "@/components/sections/createShipment/express/WeightSummaryCard";
import { Text } from "@/components/ui/Text";
import InfoBox from "@/components/sections/createShipment/InfoBox";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { usePackagesStep } from "@/lib/hooks/createShipment/express/usePackagesStep";
import { Colors } from "@/constants/colors";
import { rvs } from "@/utils/responsive";
import {
  dimensionUnitOptions,
  packageTypes,
  weightUnitOptions,
} from "@/constants/packageOptions";

export default function PackageDetailsScreen() {
  const { t } = useTranslation();

  const {
    packages,
    weightUnit,
    dimensionUnit,
    packageType,
    setWeightUnit,
    setDimensionUnit,
    setPackageType,
    chargeableWeightSummary,
    isLoadingRates,
    packageListDocument,
    isUploadingPackageList,
    isExtractingPackageList,
    packageExtractionSummary,
    handlePackageListPick,
    clearPackageListDocument,
    updatePackage,
    addPackage,
    removePackage,
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
      step={4}
      totalSteps={8}
      title={t("createShipment.express.steps.step4.title")}
      subtitle={t("createShipment.express.steps.step4.subtitle")}
      onContinue={handleContinue}
      onBack={handleBack}
      continueLabel={t("createShipment.express.steps.step4.getRates")}
      loading={isLoadingRates}
    >
      <SectionTitle title={t("createShipment.express.steps.step4.weightUnit")} />
      <UnitToggle
        options={weightUnitOptions}
        value={weightUnit}
        onChange={(v) => setWeightUnit(v as "LB" | "KG")}
      />

      <View style={styles.selectorGap} />

      <SectionTitle title={t("createShipment.express.steps.step4.dimensionUnit")} />
      <UnitToggle
        options={dimensionUnitOptions}
        value={dimensionUnit}
        onChange={(v) => setDimensionUnit(v as "IN" | "CM")}
      />

      <View style={styles.selectorGap} />

      <SectionTitle title={t("createShipment.express.steps.step4.packageType")} />
      <PackageTypeSelect
        title={t("createShipment.express.steps.step4.packageType")}
        options={packageTypes}
        value={packageType}
        onChange={setPackageType}
      />

      <View style={styles.summaryGap} />

      {packages.map((pkg, index) => (
        <PackageCard
          key={index}
          index={index + 1}
          weight={String(pkg.weight)}
          length={String(pkg.length)}
          width={String(pkg.width)}
          height={String(pkg.height)}
          weightUnit={weightUnit}
          dimensionUnit={dimensionUnit}
          removable={packages.length > 1}
          onChangeWeight={(v) => updatePackage(index, { weight: Number(v) || 0 })}
          onChangeLength={(v) => updatePackage(index, { length: Number(v) || 0 })}
          onChangeWidth={(v) => updatePackage(index, { width: Number(v) || 0 })}
          onChangeHeight={(v) => updatePackage(index, { height: Number(v) || 0 })}
          onRemove={() => removePackage(index)}
        />
      ))}

      <View style={styles.actionsGap} />

      <DashedActionButton
        icon="plus"
        label={t("createShipment.express.steps.step4.addPackage")}
        onPress={addPackage}
      />

      {packageListDocument ? (
        <>
          <InfoBox
            text={
              packageExtractionSummary?.importedPackageCount
                ? `${packageListDocument.name} · ${packageExtractionSummary.importedPackageCount} package(s) imported`
                : packageListDocument.name
            }
            iconName="file-text"
          />

          <View style={styles.clearRow}>
            <Text
              size="small"
              weight="semibold"
              style={styles.clearText}
              onPress={clearPackageListDocument}
            >
              {t("createShipment.express.steps.step4.remove")}
            </Text>
          </View>
        </>
      ) : (
        <DashedActionButton
          icon="upload"
          label={
            isProcessingPackageList
              ? t("common.loading")
              : t("createShipment.express.steps.step4.scanDocument")
          }
          onPress={handleScanDocument}
        />
      )}

      <View style={styles.summaryGap} />

      <WeightSummaryCard
        actualWeight={chargeableWeightSummary.actualWeight}
        volumetricWeight={chargeableWeightSummary.dimensionalWeight}
        chargeableWeight={chargeableWeightSummary.chargeableWeight}
        unit={chargeableWeightSummary.weightUnit.toLowerCase()}
      />
    </ShipmentStepLayout>
  );
}

const styles = StyleSheet.create({
  actionsGap: {
    height: rvs(4),
  },

  selectorGap: {
    height: rvs(14),
  },

  summaryGap: {
    height: rvs(10),
  },

  clearRow: {
    alignItems: "flex-end",
    marginTop: -rvs(6),
    marginBottom: rvs(14),
  },

  clearText: {
    color: Colors.secondary,
  },
});
