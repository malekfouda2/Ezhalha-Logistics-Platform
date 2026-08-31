import { useRouter } from "expo-router";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";
import { useCreateShipmentStore, isInternationalShipment } from "@/store/createShipmentStore";
import { useState } from "react";
import { getChargeableWeightSummary } from "@/utils/chargeableWeight";
import { extractPackageDetails, fetchRates } from "@/lib/services/createShipment";
import { validatePackages } from "@/utils/shipmentValidation";
import { apiRequest } from "@/api/client";
import { useUpload } from "../../useUpload";
import type { UploadedDocument } from "@/lib/services/auth";
import type { CompanyApplicationDocumentType } from "@shared/application-documents";
import { FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES } from "@shared/schema";

const SUPPORTED_PACKAGE_LIST_CONTENT_TYPES = new Set<string>([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "image/gif",
  "image/jpeg",
  "image/png",
]);

export function usePackagesStep() {
  const router = useRouter();
  const { t } = useTranslation();
  const store = useCreateShipmentStore();
  const [isLoadingRates, setIsLoadingRates] = useState(false);
  const [packageListDocument, setPackageListDocument] = useState<UploadedDocument | null>(null);
  const [isExtractingPackageList, setIsExtractingPackageList] = useState(false);
  const [packageExtractionSummary, setPackageExtractionSummary] = useState<any>(null);

  const { uploadFile, isUploading: isUploadingPackageList } = useUpload({
    onError: (error: Error) =>
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.express.packageList.uploadFailedTitle"),
        text2: error.message,
      }),
  });

  const chargeableWeightSummary = getChargeableWeightSummary(
    store.packages,
    store.weightUnit,
    store.dimensionUnit,
    "", // no carrier selected yet at this step — generic estimate
  );

  // Mirrors web's handlePackageListSelect (create-shipment.tsx)
  const handlePackageListPick = async (file: { uri: string; name: string; type: string; size: number }) => {
    const normalizedType = file.type.split(";")[0].trim().toLowerCase();

    if (!SUPPORTED_PACKAGE_LIST_CONTENT_TYPES.has(normalizedType)) {
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.express.packageList.unsupportedFormatTitle"),
        text2: t("toast.createShipment.express.packageList.unsupportedFormatMessage"),
      });
      return;
    }
    if (file.size > FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES) {
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.express.packageList.tooLargeTitle"),
        text2: t("toast.createShipment.express.packageList.tooLargeMessage", {
          limit: Math.round(FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES / (1024 * 1024)),
        }),
      });
      return;
    }

    const uploadResponse = await uploadFile(file);
    if (!uploadResponse) return;

    setIsExtractingPackageList(true);
    try {
      const extraction = await extractPackageDetails({
        fileName: uploadResponse.metadata.name,
        objectPath: uploadResponse.objectPath,
        contentType: uploadResponse.metadata.contentType,
      });

      const extractedPackages = extraction.packages.map((pkg) => ({
        reference: pkg.packageNumber,
        weight: pkg.weight,
        length: pkg.length,
        width: pkg.width,
        height: pkg.height,
      }));

      if (extractedPackages.length > 0) {
        store.setPackages(extractedPackages);
      }
      store.setWeightUnit(extraction.detectedWeightUnit);
      store.setDimensionUnit(extraction.detectedDimensionUnit);
      store.setPackageType("YOUR_PACKAGING");

      setPackageListDocument({
        // UploadedDocument requires a company-application `type`, which doesn't apply here —
        // this value is never read outside the company-application flow.
        type: "COMMERCIAL_REGISTRATION" as CompanyApplicationDocumentType,
        label: t("createShipment.express.steps.step4.scanDocument"),
        name: uploadResponse.metadata.name,
        path: uploadResponse.objectPath,
        contentType: uploadResponse.metadata.contentType,
      });
      setPackageExtractionSummary(extraction.summary ?? null);

      Toast.show({
        type: "success",
        text1: t("toast.createShipment.express.packageList.successTitle"),
        text2: t("toast.createShipment.express.packageList.successMessage", {
          count: extractedPackages.length,
        }),
      });
    } catch (error) {
      setPackageListDocument(null);
      setPackageExtractionSummary(null);
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.express.packageList.processErrorTitle"),
        text2:
          error instanceof Error
            ? error.message
            : t("toast.createShipment.express.packageList.processErrorMessage"),
      });
    } finally {
      setIsExtractingPackageList(false);
    }
  };

  const clearPackageListDocument = () => {
    setPackageListDocument(null);
    setPackageExtractionSummary(null);
  };

  const handleContinue = async () => {
    const result = validatePackages(store.packageType, store.packages);
    if (!result.ok) {
      Toast.show({
        type: "error",
        text1: result.title ? t(result.title, result.values) : t("toast.error.title"),
        text2: result.description ? t(result.description, result.values) : undefined,
      });
      return;
    }

    if (isLoadingRates) return;

    // Reuse existing quotes if inputs haven't changed (mirrors web's back/forward guard)
    const signature = store.ratesSignature();
    if (store.rates && signature === store.lastRatesSignature) {
      router.push("/createShipment/express/step-5");
      return;
    }

    setIsLoadingRates(true);
    try {
      console.log({store});
            const payload = {
       shipmentType: store.shipmentType,
        isDdp: store.isDdp,
        shipper: store.shipper,
        recipient: store.recipient,
        packages: store.packages,
        weightUnit: store.weightUnit,
        dimensionUnit: store.dimensionUnit,
        packageType: store.packageType,
        currency: store.currency,
      };
      
      const data = await fetchRates({
        shipmentType: store.shipmentType,
        isDdp: store.isDdp,
        shipper: store.shipper,
        recipient: store.recipient,
        packages: store.packages,
        weightUnit: store.weightUnit,
        dimensionUnit: store.dimensionUnit,
        packageType: store.packageType,
        currency: store.currency,
      });
      store.setSelectedQuoteId(null);
      store.setRates(data);
      store.setCheckoutData(null);
      store.setConfirmData(null);
      store.setLastRatesSignature(signature);
      router.push("/createShipment/express/step-5");
    } catch (error) {
      console.log({error});
      
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.express.rates.errorTitle"),
        text2:
          error instanceof Error
            ? error.message
            : t("toast.createShipment.express.rates.errorMessage"),
      });
    } finally {
      setIsLoadingRates(false);
    }
  };

  const handleBack = () => router.back();

  return {
    packages: store.packages,
    weightUnit: store.weightUnit,
    dimensionUnit: store.dimensionUnit,
    packageType: store.packageType,
    updatePackage: store.updatePackage,
    addPackage: store.addPackage,
    removePackage: store.removePackage,
    setWeightUnit: store.setWeightUnit,
    setDimensionUnit: store.setDimensionUnit,
    setPackageType: store.setPackageType,
    chargeableWeightSummary,
    isInternational: isInternationalShipment(store.shipmentType),
    isLoadingRates,
    packageListDocument,
    isUploadingPackageList,
    isExtractingPackageList,
    packageExtractionSummary,
    handlePackageListPick,
    clearPackageListDocument,
    handleContinue,
    handleBack,
  };
}