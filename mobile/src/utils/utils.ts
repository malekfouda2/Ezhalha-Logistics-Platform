import { normalizeCountryCode } from "@shared/countries";
import { Alert } from "react-native";
import * as Sharing from "expo-sharing";
import { downloadFile } from "@/api/client";
export function countryCodeToFlag(countryCode?: string | null): string {
  const code = normalizeCountryCode(countryCode);

  if (!code) return "";

  return code
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

export const handleDownloadCommercialInvoice = async (shipmentId: string) => {
  try {
    const uri = await downloadFile(
      `/api/client/shipments/${shipmentId}/commercial-invoice.pdf`,
      `commercial-invoice-${shipmentId}.pdf`,
    );

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Commercial Invoice",
      });
    }
  } catch (error) {
    console.error("Failed to download commercial invoice:", error);

    Alert.alert(
      "Error",
      error instanceof Error
        ? error.message
        : "Could not download commercial invoice.",
    );
  }
};

export const handleDownloadCarrierLabel = async (shipmentId: string) => {
  try {
    const uri = await downloadFile(
      `/api/client/shipments/${shipmentId}/label.pdf`,
      `label-${shipmentId}.pdf`,
    );

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Carrier Label",
      });
    }
  } catch (error) {
    console.error("Failed to download carrier label:", error);

    Alert.alert(
      "Error",
      error instanceof Error
        ? error.message
        : "Could not download carrier label.",
    );
  }
};