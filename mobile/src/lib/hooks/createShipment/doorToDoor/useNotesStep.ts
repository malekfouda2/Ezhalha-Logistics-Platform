import { useState } from "react";
import { useRouter } from "expo-router";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";

import { useDoorToDoorStore } from "@/store/createDoorToDoorStore";
import { submitDdpCheckout, DdpCheckoutItem } from "@/lib/services/ddp";

const HS_SOURCES = ["USER", "FEDEX", "HISTORY", "UNKNOWN"] as const;
const HS_CONFIDENCE = ["HIGH", "MEDIUM", "LOW", "MISSING"] as const;

export function useNotesStep() {
  const router = useRouter();
  const { t } = useTranslation();
  const store = useDoorToDoorStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleContinue = async () => {
    if (!store.acceptedCustoms || !store.acceptedTerms || !store.acceptedBroker) {
      Toast.show({
        type: "error",
        text1: t("toast.shipmentValidation.formInvalidTitle"),
        text2: t("createShipment.freight.steps.step8.acceptRequired"),
      });
      return;
    }
    if (!store.quote) {
      router.push("/createShipment/doorToDoor/step-5");
      return;
    }
    if (isSubmitting) return;

    const documents = [store.invoiceDocument, store.packingListDocument].filter(
      (d): d is NonNullable<typeof d> => !!d,
    );

    const signature = JSON.stringify({
      quoteId: store.quote.quoteId,
      items: store.items,
      documents,
      specialInstructions: store.specialInstructions,
      supplierAddress: store.supplierAddress,
      acceptedCustoms: store.acceptedCustoms,
      acceptedTerms: store.acceptedTerms,
      acceptedBroker: store.acceptedBroker,
    });

    if (store.checkoutData && signature === store.lastCheckoutSignature) {
      router.push("/createShipment/doorToDoor/step-9");
      return;
    }

    setIsSubmitting(true);
    try {
      const instructions = [
        store.supplierAddress ? `Pickup address: ${store.supplierAddress}` : "",
        store.specialInstructions,
      ]
        .filter(Boolean)
        .join("\n");

      const items: DdpCheckoutItem[] = store.items
        .filter((item) => item.itemName.trim())
        .map((item) => ({
          itemName: item.itemName,
          itemDescription: item.itemDescription || undefined,
          category: item.category,
          material: item.material || undefined,
          countryOfOrigin: item.countryOfOrigin,
          hsCode: item.hsCode || undefined,
          hsCodeSource: (HS_SOURCES as readonly string[]).includes(item.hsCodeSource)
            ? (item.hsCodeSource as DdpCheckoutItem["hsCodeSource"])
            : undefined,
          hsCodeConfidence: (HS_CONFIDENCE as readonly string[]).includes(item.hsCodeConfidence)
            ? (item.hsCodeConfidence as DdpCheckoutItem["hsCodeConfidence"])
            : undefined,
          hsCodeCandidates: item.hsCodeCandidates?.length ? item.hsCodeCandidates : undefined,
          price: item.price,
          quantity: item.quantity,
          currency: item.currency,
        }));

      const checkout = await submitDdpCheckout({
        quoteId: store.quote.quoteId,
        items,
        tradeDocuments: documents,
        specialInstructions: instructions || undefined,
        customsComplianceAccepted: true,
        termsAccepted: true,
        brokerAuthorizationAccepted: true,
      });

      store.setCheckoutData({
        shipmentId: checkout.shipmentId,
        trackingNumber: checkout.trackingNumber,
        amount: checkout.amount,
        currency: checkout.currency,
      });
      store.setLastCheckoutSignature(signature);
      router.push("/createShipment/doorToDoor/step-9");
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("createShipment.freight.steps.step8.checkoutErrorTitle"),
        text2: error instanceof Error ? error.message : t("createShipment.freight.steps.step8.checkoutErrorMessage"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => router.back();

  return {
    specialInstructions: store.specialInstructions,
    setSpecialInstructions: store.setSpecialInstructions,
    acceptedCustoms: store.acceptedCustoms,
    setAcceptedCustoms: store.setAcceptedCustoms,
    acceptedTerms: store.acceptedTerms,
    setAcceptedTerms: store.setAcceptedTerms,
    acceptedBroker: store.acceptedBroker,
    setAcceptedBroker: store.setAcceptedBroker,
    isSubmitting,
    handleContinue,
    handleBack,
  };
}
