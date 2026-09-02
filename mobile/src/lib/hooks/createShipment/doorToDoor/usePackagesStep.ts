import { useState } from "react";
import { useRouter } from "expo-router";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";

import { useDoorToDoorStore } from "@/store/createDoorToDoorStore";
import { fetchDdpRates } from "@/lib/services/ddp";
import { extractPackageDetails, type ExtractPackageDetailsResponse } from "@/lib/services/createShipment";
import { useUpload } from "../../useUpload";

export function usePackagesStep() {
  const router = useRouter();
  const { t } = useTranslation();
  const store = useDoorToDoorStore();
  const [isLoadingRates, setIsLoadingRates] = useState(false);
  const [isExtractingPackageList, setIsExtractingPackageList] = useState(false);
  const [packageExtractionSummary, setPackageExtractionSummary] =
    useState<ExtractPackageDetailsResponse["summary"] | null>(null);

  const { uploadFile, isUploading: isUploadingPackageList } = useUpload({
    onError: (error: Error) =>
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.express.packageList.uploadFailedTitle"),
        text2: error.message,
      }),
  });

  const handlePackageListPick = async (file: { uri: string; name: string; type: string; size: number }) => {
    const uploaded = await uploadFile(file);
    if (!uploaded) return;

    setIsExtractingPackageList(true);
    try {
      const extraction = await extractPackageDetails({
        fileName: uploaded.metadata.name,
        objectPath: uploaded.objectPath,
        contentType: uploaded.metadata.contentType,
      });

      const extractedPackages = extraction.packages.map((pkg) => ({
        weight: pkg.weight,
        length: pkg.length,
        width: pkg.width,
        height: pkg.height,
      }));

      if (extractedPackages.length > 0) {
        store.setPackages(extractedPackages);
      }

      // Shared with step 7: uploading the packing list here carries it over as already
      // uploaded there too, instead of asking the user to upload it a second time.
      store.setPackingListDocument({
        fileName: uploaded.metadata.name,
        objectPath: uploaded.objectPath,
        contentType: uploaded.metadata.contentType,
        size: uploaded.metadata.size,
        documentType: "OTHER",
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
      store.setPackingListDocument(null);
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
    store.setPackingListDocument(null);
    setPackageExtractionSummary(null);
  };

  const totalWeight = store.packages.reduce((sum, p) => sum + Number(p.weight || 0), 0);
  const calculatedCbm = store.packages.reduce(
    (sum, p) => sum + (Number(p.length || 0) * Number(p.width || 0) * Number(p.height || 0)) / 1_000_000,
    0,
  );
  const totalVolume = store.totalCbm || calculatedCbm;

  const handleContinue = async () => {
    if (!store.packages.length) {
      Toast.show({
        type: "error",
        text1: t("toast.shipmentValidation.formInvalidTitle"),
        text2: t("createShipment.freight.steps.step5.addPackage"),
      });
      return;
    }

    if (store.transportMethod === "sea") {
      if (!totalVolume) {
        Toast.show({
          type: "error",
          text1: t("toast.shipmentValidation.formInvalidTitle"),
          text2: t("createShipment.freight.steps.step5.enterVolume"),
        });
        return;
      }
    } else if (store.packages.some((p) => !p.weight || !p.length || !p.width || !p.height)) {
      Toast.show({
        type: "error",
        text1: t("toast.shipmentValidation.formInvalidTitle"),
        text2: t("createShipment.freight.steps.step5.completeDimensions"),
      });
      return;
    }

    if (isLoadingRates) return;

    const signature = store.ratesSignature();
    if (store.quote && signature === store.lastRatesSignature) {
      router.push("/createShipment/doorToDoor/step-6");
      return;
    }

    setIsLoadingRates(true);
    try {
      const quote = await fetchDdpRates({
        transportMethod: store.transportMethod,
        shipper: { countryCode: store.originCountryCode },
        recipient: store.recipient,
        supplierName: store.supplierName,
        supplierPhone: store.supplierPhone,
        packages: store.packages.map((p) => ({
          weight: Number(p.weight) || 0,
          length: Number(p.length) || 0,
          width: Number(p.width) || 0,
          height: Number(p.height) || 0,
        })),
        totalCbm: store.totalCbm || undefined,
      });

      store.setQuote(quote);
      store.setCheckoutData(null);
      store.setConfirmData(null);
      store.setLastRatesSignature(signature);
      router.push("/createShipment/doorToDoor/step-6");
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("createShipment.freight.steps.step5.rateErrorTitle"),
        text2: error instanceof Error ? error.message : t("createShipment.freight.steps.step5.rateErrorMessage"),
      });
    } finally {
      setIsLoadingRates(false);
    }
  };

  const handleBack = () => router.back();

  return {
    packages: store.packages,
    transportMethod: store.transportMethod,
    totalCbm: store.totalCbm,
    totalWeight,
    totalVolume,
    updatePackage: store.updatePackage,
    addPackage: store.addPackage,
    removePackage: store.removePackage,
    setTotalCbm: store.setTotalCbm,
    isLoadingRates,
    packageListDocument: store.packingListDocument,
    isUploadingPackageList,
    isExtractingPackageList,
    packageExtractionSummary,
    handlePackageListPick,
    clearPackageListDocument,
    handleContinue,
    handleBack,
  };
}
