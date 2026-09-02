import { useState } from "react";
import { useRouter } from "expo-router";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";
import * as DocumentPicker from "expo-document-picker";

import { useDoorToDoorStore } from "@/store/createDoorToDoorStore";
import { CustomsItem, TradeDocument } from "@/store/createShipmentStore";
import { extractInvoiceItems, type ExtractInvoiceItemsResponse } from "@/lib/services/createShipment";
import { useUpload } from "../../useUpload";
import { normalizeTradeDocumentContentType } from "@/utils/documentContentType";
import { FEDEX_TRADE_DOCUMENT_ALLOWED_CONTENT_TYPES, FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES } from "@shared/schema";

const PICKER_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
];

export function useDocumentsStep() {
  const router = useRouter();
  const { t } = useTranslation();
  const store = useDoorToDoorStore();
  const [isExtractingInvoice, setIsExtractingInvoice] = useState(false);
  const [invoiceSummary, setInvoiceSummary] = useState<ExtractInvoiceItemsResponse["summary"] | null>(null);
  const [uploadingKind, setUploadingKind] = useState<"invoice" | "packing" | null>(null);

  const { uploadFile } = useUpload({
    onError: (error: Error) =>
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.express.invoice.uploadFailedTitle"),
        text2: error.message,
      }),
  });

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: PICKER_TYPES, copyToCacheDirectory: true });
    if (result.canceled) return null;
    const file = result.assets[0];
    return { uri: file.uri, name: file.name, type: file.mimeType ?? "application/octet-stream", size: file.size ?? 0 };
  };

  const uploadInvoice = async () => {
    const file = await pickFile();
    if (!file) return;

    const normalizedType = normalizeTradeDocumentContentType(file.type, file.name);
    if (!(FEDEX_TRADE_DOCUMENT_ALLOWED_CONTENT_TYPES as readonly string[]).includes(normalizedType)) {
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.express.invoice.unsupportedFormatTitle"),
        text2: t("toast.createShipment.express.invoice.unsupportedFormatMessage"),
      });
      return;
    }
    if (file.size > FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES) {
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.express.invoice.tooLargeTitle"),
        text2: t("toast.createShipment.express.invoice.tooLargeMessage", {
          limit: Math.round(FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES / (1024 * 1024)),
        }),
      });
      return;
    }

    setUploadingKind("invoice");
    const uploaded = await uploadFile(file.type === normalizedType ? file : { ...file, type: normalizedType });
    if (!uploaded) {
      setUploadingKind(null);
      return;
    }

    setIsExtractingInvoice(true);
    try {
      const extraction = await extractInvoiceItems({
        shipmentType: "inbound",
        shipperCountryCode: store.originCountryCode,
        recipientCountryCode: store.destinationCountryCode,
        fileName: uploaded.metadata.name,
        objectPath: uploaded.objectPath,
        contentType: uploaded.metadata.contentType,
      });

      const items: CustomsItem[] = extraction.items.map((item: any) => ({
        itemName: item.itemName,
        itemDescription: item.itemDescription || item.itemName,
        category: item.category,
        material: item.material || "",
        countryOfOrigin: item.countryOfOrigin,
        hsCode: item.hsCode || "",
        hsCodeSource: item.hsCodeSource || "",
        hsCodeConfidence: item.hsCodeConfidence || "",
        hsCodeCandidates: item.hsCodeCandidates || [],
        price: item.price,
        currency: item.currency || extraction.detectedCurrency || "SAR",
        quantity: item.quantity,
      }));

      store.setItems(items);
      store.setInvoiceDocument({
        fileName: uploaded.metadata.name,
        objectPath: uploaded.objectPath,
        contentType: uploaded.metadata.contentType,
        size: uploaded.metadata.size,
        documentType: "COMMERCIAL_INVOICE",
      });
      setInvoiceSummary(extraction.summary || null);
    } catch (error) {
      store.setInvoiceDocument(null);
      store.setItems([]);
      setInvoiceSummary(null);
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.express.invoice.processErrorTitle"),
        text2: error instanceof Error ? error.message : t("toast.createShipment.express.invoice.processErrorMessage"),
      });
    } finally {
      setIsExtractingInvoice(false);
      setUploadingKind(null);
    }
  };

  const uploadPacking = async () => {
    const file = await pickFile();
    if (!file) return;

    if (file.size > FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES) {
      Toast.show({
        type: "error",
        text1: t("toast.shipmentValidation.formInvalidTitle"),
        text2: t("createShipment.freight.steps.step7.tooLarge"),
      });
      return;
    }

    setUploadingKind("packing");
    const uploaded = await uploadFile(file);
    setUploadingKind(null);
    if (!uploaded) return;

    const document: TradeDocument = {
      fileName: uploaded.metadata.name,
      objectPath: uploaded.objectPath,
      contentType: uploaded.metadata.contentType,
      size: uploaded.metadata.size,
      documentType: "OTHER",
    };

    store.setPackingListDocument(document);
  };

  const handleContinue = () => {
    if (!store.invoiceDocument) {
      Toast.show({
        type: "error",
        text1: t("toast.shipmentValidation.formInvalidTitle"),
        text2: t("createShipment.freight.steps.step7.invoiceRequired"),
      });
      return;
    }
    if (!store.items.some((item) => item.itemName.trim())) {
      Toast.show({
        type: "error",
        text1: t("toast.shipmentValidation.formInvalidTitle"),
        text2: t("createShipment.freight.steps.step7.itemsRequired"),
      });
      return;
    }
    router.push("/createShipment/doorToDoor/step-8");
  };

  const handleBack = () => router.back();

  return {
    invoiceDocument: store.invoiceDocument,
    packingListDocument: store.packingListDocument,
    isExtractingInvoice,
    invoiceSummary,
    uploadingKind,
    uploadInvoice,
    uploadPacking,
    removeInvoice: () => {
      store.setInvoiceDocument(null);
      store.setItems([]);
      setInvoiceSummary(null);
    },
    removePacking: () => store.setPackingListDocument(null),
    items: store.items,
    addItem: store.addItem,
    updateItem: store.updateItem,
    removeItem: store.removeItem,
    handleContinue,
    handleBack,
  };
}
