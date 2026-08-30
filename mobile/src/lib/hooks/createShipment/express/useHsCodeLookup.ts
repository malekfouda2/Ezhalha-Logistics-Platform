import { useState } from "react";
import { Alert } from "react-native";
import { CustomsItem, useCreateShipmentStore } from "@/store/createShipmentStore";
import { lookupHsCode, confirmHsCode } from "@/lib/services/createShipment";

function isGenericItemName(name: string): boolean {
  const GENERIC_NAMES = [
    "parts", "item", "items", "stuff", "accessories", "product", "products",
    "goods", "things", "misc", "miscellaneous", "other", "general", "sample",
    "gift", "package", "box", "shipment", "order",
  ];
  if (!name || name.trim().length < 4) return true;
  const lower = name.trim().toLowerCase();
  return GENERIC_NAMES.some((g) => lower === g || lower.startsWith(g + " ") || lower.endsWith(" " + g));
}

function confidenceFromNumber(c: number): CustomsItem["hsCodeConfidence"] {
  if (c >= 0.7) return "HIGH";
  if (c >= 0.4) return "MEDIUM";
  if (c > 0) return "LOW";
  return "MISSING";
}

export function useHsCodeLookup() {
  const [loading, setLoading] = useState(false);
  const shipmentType = useCreateShipmentStore((s) => s.shipmentType);
  const shipper = useCreateShipmentStore((s) => s.shipper);
  const recipient = useCreateShipmentStore((s) => s.recipient);

  const runLookup = async (item: CustomsItem): Promise<Partial<CustomsItem> | null> => {
    if (!item.itemName || !item.category || !item.countryOfOrigin) {
      Alert.alert("Please fill in item name, category, and origin country first");
      return null;
    }

    const destinationCountry =
      shipmentType === "inbound" ? recipient.countryCode || "SA" : recipient.countryCode || shipper.countryCode || "SA";

    setLoading(true);
    try {
      const data = await lookupHsCode({
        itemName: item.itemName,
        category: item.category,
        countryOfOrigin: item.countryOfOrigin,
        destinationCountry,
        itemDescription: item.itemDescription || undefined,
        material: item.material || undefined,
      });

      const needsDetails = data.candidates.length > 1 || isGenericItemName(item.itemName);
      const top = data.candidates[0];
      return {
        hsCodeCandidates: data.candidates,
        hsCode: top ? top.code : "",
        hsCodeSource: data.source as any,
        hsCodeConfidence: top ? confidenceFromNumber(top.confidence) : "MISSING",
        // caller decides whether to force-open a "details" UI state using `needsDetails`
      } as Partial<CustomsItem> & { _needsDetails?: boolean };
    } catch {
      Alert.alert("HS code lookup failed");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const confirmSelection = async (item: CustomsItem) => {
    if (!item.hsCode || !item.itemName || !item.category || !item.countryOfOrigin) return;
    await confirmHsCode({
      itemName: item.itemName,
      category: item.category,
      material: item.material || undefined,
      countryOfOrigin: item.countryOfOrigin,
      hsCode: item.hsCode,
      description: item.hsCodeCandidates.find((c) => c.code === item.hsCode)?.description,
    });
  };

  return { loading, runLookup, confirmSelection };
}