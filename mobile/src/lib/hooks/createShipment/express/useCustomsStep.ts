import { useRouter } from "expo-router";
import { Alert } from "react-native";
import { useState } from "react";
import { useCreateShipmentStore, CustomsItem, defaultCustomsItem } from "@/store/createShipmentStore";
import { extractInvoiceItems } from "@/lib/services/createShipment";
import { validateCustoms } from "@/utils/shipmentValidation";
import { FEDEX_TRADE_DOCUMENT_ALLOWED_CONTENT_TYPES, FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES } from "@shared/schema";
import { useUpload } from "../../useUpload";


export function useCustomsStep() {
  const router = useRouter();
  const store = useCreateShipmentStore();
  const [isExtractingInvoice, setIsExtractingInvoice] = useState(false);
  const [invoiceExtractionSummary, setInvoiceExtractionSummary] = useState<any>(null);

  const { uploadFile, isUploading } = useUpload({
    onError: (error: Error) => Alert.alert("Invoice upload failed", error.message),
  });

  const invoiceDocument = store.tradeDocuments[0] ?? null;

  const handleInvoicePick = async (file: { uri: string; name: string; type: string; size: number }) => {
    const normalizedType = file.type.split(";")[0].trim().toLowerCase();

    if (!(FEDEX_TRADE_DOCUMENT_ALLOWED_CONTENT_TYPES as readonly string[]).includes(normalizedType)) {
      Alert.alert(
        "Unsupported invoice format",
        "Upload a PDF, DOC, DOCX, XLS, XLSX, RTF, TXT, JPG, JPEG, PNG, BMP, TIFF, or GIF invoice.",
      );
      return;
    }
    if (file.size > FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES) {
      Alert.alert(
        "Invoice is too large",
        `The invoice exceeds the ${Math.round(FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES / (1024 * 1024))}MB limit.`,
      );
      return;
    }

    const uploadResponse = await uploadFile(file);
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
      Alert.alert(
        "Could not process invoice",
        error instanceof Error ? error.message : "Please upload another invoice or enter the items manually.",
      );
    } finally {
      setIsExtractingInvoice(false);
    }
  };

  const handleContinue = () => {
    const result = validateCustoms(store.customsInputMode, !!invoiceDocument, store.items);
    if (!result.ok) {
      Alert.alert(result.title || "Error", result.description);
      return;
    }
    router.push("/createShipment/express/pickup");
  };

  const handleBack = () => router.push("/createShipment/express/step-5");

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
    handleContinue,
    handleBack,
  };
}