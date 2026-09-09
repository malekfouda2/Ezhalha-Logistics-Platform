// app/create-shipment/dangerousGoods/step-6.tsx

import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as DocumentPicker from "expo-document-picker";
import { Feather } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { DocUploadRow } from "@/components/ui/DocumentUpload";
import { SdsFileList } from "@/components/sections/createShipment/dangerousGoods/SdsFileList";
import { ExtractionSummaryCard } from "@/components/sections/createShipment/dangerousGoods/ExtractionSummaryCard";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { useSafetyDataSheetStep } from "@/lib/hooks/createShipment/dangerousGoods/useSafetyDataSheetStep";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

export default function DangerousGoodsSafetyDataSheetScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    sdsDocuments,
    declarationDocument,
    commodities,
    warnings,
    notDangerousGoods,
    isProcessing,
    isSdsProcessing,
    isDeclarationProcessing,
    handleSdsFilePick,
    handleDeclarationFilePick,
    handleRemoveSdsDocument,
    handleRemoveDeclaration,
    handleContinue,
    handleBack,
    maxSdsFiles,
  } = useSafetyDataSheetStep();

  const pickFile = async (
    onPicked: (file: {
      uri: string;
      name: string;
      type: string;
      size: number;
    }) => void,
    type: string[],
  ) => {
    if (isProcessing) return;
    const result = await DocumentPicker.getDocumentAsync({
      type,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;

    const file = result.assets[0];
    onPicked({
      uri: file.uri,
      name: file.name,
      type: file.mimeType ?? "application/octet-stream",
      size: file.size ?? 0,
    });
  };

  const handlePickSds = () =>
    pickFile(handleSdsFilePick, ["application/pdf", "image/jpeg", "image/png"]);
  const handlePickDeclaration = () =>
    pickFile(handleDeclarationFilePick, ["*/*"]);

  const handleSwitchToExpress = () => router.replace("/createShipment/express");

  return (
    <ShipmentStepLayout
      step={6}
      totalSteps={8}
      title={t("createShipment.dangerousGoods.steps.step6.title")}
      subtitle={t("createShipment.dangerousGoods.steps.step6.subtitle")}
      onContinue={handleContinue}
      onBack={handleBack}
    >
      {sdsDocuments.length < maxSdsFiles ? (
        <DocUploadRow
          label={t("createShipment.dangerousGoods.steps.step6.sdsLabel")}
          subLabel={t("createShipment.dangerousGoods.steps.step6.fileHint", {
            max: maxSdsFiles,
          })}
          fileName={
            sdsDocuments.length > 0
              ? t(
                  "createShipment.dangerousGoods.steps.step6.sdsAttachedCount",
                  { count: sdsDocuments.length },
                )
              : undefined
          }
          onPick={handlePickSds}
          isLoading={isSdsProcessing}
          uploadText={t("documents.upload")}
          replaceText={t("documents.replace")}
          noFileText={t("documents.noFile")}
        />
      ) : null}

      <SdsFileList files={sdsDocuments} onRemove={handleRemoveSdsDocument} />

      <ExtractionSummaryCard commodities={commodities} />

      {notDangerousGoods ? (
        <View style={styles.notDgCard}>
          <Feather
            name="alert-triangle"
            size={rs(16)}
            color={Colors.amberTextColor}
            style={styles.notDgIcon}
          />
          <View style={styles.notDgTextGroup}>
            <Text size="small" weight="bold" style={styles.notDgTitle}>
              {t("createShipment.dangerousGoods.steps.step6.notDangerousGoodsTitle")}
            </Text>
            <Text size="small" style={styles.notDgDescription}>
              {t("createShipment.dangerousGoods.steps.step6.notDangerousGoodsMessagePart1")}{" "}
              <Text size="small" weight="bold" style={styles.notDgDescription}>
                {t("createShipment.dangerousGoods.steps.step6.notDangerousGoodsEmphasis")}
              </Text>{" "}
              {t("createShipment.dangerousGoods.steps.step6.notDangerousGoodsMessagePart2")}
            </Text>
            <Button
              variant="outline"
              title={t("createShipment.dangerousGoods.steps.step6.switchToExpress")}
              onPress={handleSwitchToExpress}
              style={styles.switchButton}
              fontSize="small"
            />
          </View>
        </View>
      ) : null}

      {warnings.length > 0 ? (
        <View style={styles.warningsBox}>
          {warnings.map((warning, index) => (
            <Text key={index} size="small" style={styles.warningText}>
              {warning}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.declarationWrapper}>
        <DocUploadRow
          label={t(
            "createShipment.dangerousGoods.steps.step6.declarationLabel",
          )}
          subLabel={t(
            "createShipment.dangerousGoods.steps.step6.declarationHint",
          )}
          fileName={declarationDocument?.fileName}
          onPick={handlePickDeclaration}
          onRemove={declarationDocument ? handleRemoveDeclaration : undefined}
          isLoading={isDeclarationProcessing}
          uploadText={t("documents.upload")}
          replaceText={t("documents.replace")}
          noFileText={t("documents.noFile")}
        />
      </View>
    </ShipmentStepLayout>
  );
}

const styles = StyleSheet.create({
  warningsBox: {
    backgroundColor: Colors.amberBackgroundColor,
    borderWidth: 1,
    borderColor: Colors.amberBorderColor,
    borderRadius: rvs(10),
    padding: rvs(12),
    gap: rvs(4),
    marginBottom: rvs(10),
  },
  warningText: {
    color: Colors.amberTextColor,
  },
  declarationWrapper: {
    marginTop: rvs(10),
  },
  notDgCard: {
    flexDirection: "row",
    gap: rvs(8),
    padding: rvs(14),
    borderRadius: rvs(10),
    borderWidth: 1,
    borderColor: Colors.amberBorderColor,
    backgroundColor: Colors.amberBackgroundColor,
    marginBottom: rvs(10),
  },
  notDgIcon: {
    marginTop: rvs(2),
  },
  notDgTextGroup: {
    flex: 1,
  },
  notDgTitle: {
    color: Colors.text,
    marginBottom: rvs(4),
  },
  notDgDescription: {
    color: Colors.textSecondary,
  },
  switchButton: {
    width: "auto",
    height: rvs(38),
    paddingHorizontal: rs(16),
    alignSelf: "flex-start",
    marginTop: rvs(12),

  },
});
