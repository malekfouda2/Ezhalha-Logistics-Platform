import { useRouter } from "expo-router";
import { useState } from "react";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";

import { useDangerousGoodsStore, DgDraftCommodity } from "@/store/createDangerousGoodsStore";
import { extractDangerousGoods } from "@/lib/services/dangerousGoodsShipment";
import { useUpload } from "@/lib/hooks/useUpload";
import { normalizeTradeDocumentContentType } from "@/utils/documentContentType";
import { FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES } from "@shared/schema";
import { DangerousGoodsDocumentType, DangerousGoodsDocumentTypeValue, DgPackingGroupValue } from "@shared/dangerous-goods";

const MAX_SDS_FILES = 5;

const SUPPORTED_SDS_CONTENT_TYPES = new Set<string>([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

export function useSafetyDataSheetStep() {
  const router = useRouter();
  const { t } = useTranslation();
  const store = useDangerousGoodsStore();
  const [isExtracting, setIsExtracting] = useState(false);
  // Both uploaders share one useUpload() instance, so `isUploading` alone can't tell them
  // apart — track which row actually triggered the in-flight request so only that row's
  // button shows a spinner instead of both at once.
  const [activeTarget, setActiveTarget] = useState<DangerousGoodsDocumentTypeValue | null>(null);

  const { uploadFile, isUploading } = useUpload({
    onError: (error: Error) =>
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.dangerousGoods.sds.uploadFailedTitle"),
        text2: error.message,
      }),
  });

  const documents = store.dgDocuments;
  const sdsDocuments = documents.filter(
    (d) => d.documentType === DangerousGoodsDocumentType.SAFETY_DATA_SHEET,
  );
  const declarationDocument =
    documents.find((d) => d.documentType === DangerousGoodsDocumentType.SHIPPERS_DECLARATION) ?? null;
  const commodities = store.dgPackages[0]?.commodities ?? [];

  // Mirrors web's shared handleDangerousGoodsUpload (create-shipment.tsx) — one upload path
  // for both document kinds, but only the safety data sheet is machine-read. A Shipper's
  // Declaration is the output of that process, not an input to it, so it's just attached.
  const handleUpload = async (
    file: { uri: string; name: string; type: string; size: number },
    documentType: DangerousGoodsDocumentTypeValue,
  ) => {
    if (documentType === DangerousGoodsDocumentType.SAFETY_DATA_SHEET && sdsDocuments.length >= MAX_SDS_FILES) {
      Toast.show({
        type: "error",
        text1: t("createShipment.dangerousGoods.steps.step6.maxFilesTitle", { max: MAX_SDS_FILES }),
      });
      return;
    }

    const normalizedType = normalizeTradeDocumentContentType(file.type, file.name);
    if (
      documentType === DangerousGoodsDocumentType.SAFETY_DATA_SHEET &&
      !SUPPORTED_SDS_CONTENT_TYPES.has(normalizedType)
    ) {
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.dangerousGoods.sds.unsupportedFormatTitle"),
        text2: t("toast.createShipment.dangerousGoods.sds.unsupportedFormatMessage"),
      });
      return;
    }

    if (file.size > FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES) {
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.dangerousGoods.sds.tooLargeTitle"),
        text2: t("toast.createShipment.dangerousGoods.sds.tooLargeMessage", {
          limit: Math.round(FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES / (1024 * 1024)),
        }),
      });
      return;
    }

    setActiveTarget(documentType);
    try {
      const uploadResponse = await uploadFile(
        file.type === normalizedType ? file : { ...file, type: normalizedType },
      );
      if (!uploadResponse) return;

      // The document is kept even if extraction below fails — extraction only pre-fills the
      // declaration, it never gates whether the client can continue.
      store.addDgDocument({
        fileName: uploadResponse.metadata.name,
        objectPath: uploadResponse.objectPath,
        contentType: uploadResponse.metadata.contentType,
        size: uploadResponse.metadata.size,
        documentType,
      });

      if (documentType !== DangerousGoodsDocumentType.SAFETY_DATA_SHEET) return;

      setIsExtracting(true);
      try {
        const extraction = await extractDangerousGoods({
          fileName: uploadResponse.metadata.name,
          objectPath: uploadResponse.objectPath,
          contentType: uploadResponse.metadata.contentType,
        });

        if (extraction.notDangerousGoods) {
          store.setExtractionNotDangerousGoods(true);
          Toast.show({
            type: "info",
            text1: t("createShipment.dangerousGoods.steps.step6.notDangerousGoodsTitle"),
            text2: t("createShipment.dangerousGoods.steps.step6.notDangerousGoodsMessage"),
          });
          return;
        }

        const extractedCommodities: DgDraftCommodity[] = extraction.commodities.map((c) => ({
          unNumber: c.unNumber,
          properShippingName: c.properShippingName,
          technicalName: c.technicalName,
          hazardClass: c.hazardClass,
          packingGroup: c.packingGroup as DgPackingGroupValue | undefined,
          packingInstruction: c.packingInstruction,
          fromDocument: true,
          missingFields: c.missingFields,
        }));

        // Replaces rather than appends — the blank placeholder commodity that satisfies the
        // server's "at least one" requirement isn't meant to be submitted alongside real
        // extracted data, matching web's setFormData replace on dangerousGoods.commodities.
        if (extractedCommodities.length > 0) {
          store.setDgPackageCommodities(0, extractedCommodities);
        }
        store.setExtractionWarnings(extraction.warnings);

        Toast.show({
          type: "success",
          text1: t("createShipment.dangerousGoods.steps.step6.extractionSuccessTitle"),
        });
      } catch (error) {
        Toast.show({
          type: "error",
          text1: t("toast.createShipment.dangerousGoods.sds.processErrorTitle"),
          text2: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setIsExtracting(false);
      }
    } finally {
      setActiveTarget(null);
    }
  };

  const handleSdsFilePick = (file: { uri: string; name: string; type: string; size: number }) =>
    handleUpload(file, DangerousGoodsDocumentType.SAFETY_DATA_SHEET);

  const handleDeclarationFilePick = (file: { uri: string; name: string; type: string; size: number }) =>
    handleUpload(file, DangerousGoodsDocumentType.SHIPPERS_DECLARATION);

  const handleRemoveSdsDocument = (index: number) => {
    const doc = sdsDocuments[index];
    const actualIndex = documents.indexOf(doc);
    if (actualIndex >= 0) store.removeDgDocument(actualIndex);
  };

  const handleRemoveDeclaration = () => {
    if (!declarationDocument) return;
    const actualIndex = documents.indexOf(declarationDocument);
    if (actualIndex >= 0) store.removeDgDocument(actualIndex);
  };

  const handleContinue = () => {
    // Mirrors web's validateStep for dangerousGoodsDocumentsStep (create-shipment.tsx) —
    // at least one document (SDS or declaration) is required before moving on.
    if (documents.length === 0) {
      Toast.show({
        type: "error",
        text1: t("createShipment.dangerousGoods.steps.step6.uploadRequiredTitle"),
        text2: t("createShipment.dangerousGoods.steps.step6.uploadRequiredMessage"),
      });
      return;
    }

    const isDomestic = store.shipmentType === "domestic";
    router.push(isDomestic ? "/createShipment/dangerousGoods/step-8" : "/createShipment/dangerousGoods/step-7");
  };

  const handleBack = () => router.back();

  const isProcessing = isUploading || isExtracting;

  return {
    sdsDocuments,
    declarationDocument,
    commodities,
    warnings: store.extractionWarnings,
    notDangerousGoods: store.extractionNotDangerousGoods,
    isProcessing,
    isSdsProcessing: isProcessing && activeTarget === DangerousGoodsDocumentType.SAFETY_DATA_SHEET,
    isDeclarationProcessing: isProcessing && activeTarget === DangerousGoodsDocumentType.SHIPPERS_DECLARATION,
    handleSdsFilePick,
    handleDeclarationFilePick,
    handleRemoveSdsDocument,
    handleRemoveDeclaration,
    handleContinue,
    handleBack,
    maxSdsFiles: MAX_SDS_FILES,
  };
}
