import { useRouter } from "expo-router";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useCreateShipmentStore, CustomsItem, defaultCustomsItem } from "@/store/createExpressShipmentStore";
import { extractInvoiceItems, type ExtractInvoiceItemsResponse } from "@/lib/services/createShipment";
import { validateCustoms } from "@/utils/shipmentValidation";
import { FEDEX_TRADE_DOCUMENT_ALLOWED_CONTENT_TYPES, FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES } from "@shared/schema";
import { useUpload } from "../../useUpload";
import { normalizeTradeDocumentContentType } from "@/utils/documentContentType";


export function useCustomsStep() {
  const router = useRouter();
  const { t } = useTranslation();
  const store = useCreateShipmentStore();
  const [isExtractingInvoice, setIsExtractingInvoice] = useState(false);
  const [invoiceExtractionSummary, setInvoiceExtractionSummary] =
    useState<ExtractInvoiceItemsResponse["summary"] | null>(null);

  const { uploadFile, isUploading } = useUpload({
    onError: (error: Error) =>
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.express.invoice.uploadFailedTitle"),
        text2: error.message,
      }),
  });

  const invoiceDocument = store.tradeDocuments[0] ?? null;

  const handleInvoicePick = async (file: { uri: string; name: string; type: string; size: number }) => {
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

    const uploadResponse = await uploadFile(
      file.type === normalizedType ? file : { ...file, type: normalizedType },
    );
    if (!uploadResponse) return;

    setIsExtractingInvoice(true);
    try {
      const extraction = await extractInvoiceItems({
        shipmentType: store.shipmentType,
        shipperCountryCode: store.shipper.countryCode,
        recipientCountryCode: store.recipient.countryCode,
        fileName: uploadResponse.metadata.name,
        objectPath: uploadResponse.objectPath,
        contentType: uploadResponse.metadata.contentType,
      });

      const extractedItems: CustomsItem[] = extraction.items.map((item: any) => ({
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

      store.setItems(extractedItems.length > 0 ? extractedItems : [{ ...defaultCustomsItem }]);
      store.setTradeDocuments([
        {
          fileName: uploadResponse.metadata.name,
          objectPath: uploadResponse.objectPath,
          contentType: uploadResponse.metadata.contentType,
          size: uploadResponse.metadata.size,
          documentType: "COMMERCIAL_INVOICE",
        },
      ]);
      setInvoiceExtractionSummary(extraction.summary || null);
    } catch (error) {
      store.setTradeDocuments([]);
      setInvoiceExtractionSummary(null);
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.express.invoice.processErrorTitle"),
        text2:
          error instanceof Error
            ? error.message
            : t("toast.createShipment.express.invoice.processErrorMessage"),
      });
    } finally {
      setIsExtractingInvoice(false);
    }
  };

  const handleContinue = () => {
    const result = validateCustoms(store.customsInputMode, !!invoiceDocument, store.items);
    if (!result.ok) {
      Toast.show({
        type: "error",
        text1: result.title ? t(result.title, result.values) : t("toast.error.title"),
        text2: result.description ? t(result.description, result.values) : undefined,
      });
      return;
    }
    router.push("/createShipment/express/step-7");
  };

  const handleBack = () => router.push("/createShipment/express/step-5");

  // Mirrors web's destinationCountry calc (client/src/pages/client/create-shipment.tsx)
  const destinationCountryCode =
    store.shipmentType === "inbound"
      ? store.recipient.countryCode || "SA"
      : store.recipient.countryCode || store.shipper.countryCode || "SA";

  return {
    customsInputMode: store.customsInputMode,
    setCustomsInputMode: store.setCustomsInputMode,
    items: store.items,
    addItem: store.addItem,
    updateItem: store.updateItem,
    removeItem: store.removeItem,
    invoiceDocument,
    handleInvoicePick,
    clearInvoiceDocument: store.clearInvoiceDocument,
    isUploadingInvoice: isUploading,
    isExtractingInvoice,
    invoiceExtractionSummary,
    destinationCountryCode,
    handleContinue,
    handleBack,
  };
}