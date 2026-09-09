import { useRouter } from "expo-router";
import { useState } from "react";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";

import { useDangerousGoodsStore, DgDraftPackage } from "@/store/createDangerousGoodsStore";
import {
  submitDangerousGoodsShipment,
  generateIdempotencyKey,
  DangerousGoodsSubmitPayload,
} from "@/lib/services/dangerousGoodsShipment";

export function useReviewStep() {
  const router = useRouter();
  const { t } = useTranslation();
  const store = useDangerousGoodsStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isInternational = store.shipmentType !== "domestic";

  const handleContinue = async () => {
    if (!store.contentKind) {
      Toast.show({
        type: "error",
        text1: t("createShipment.dangerousGoods.steps.step5.selectRequired"),
      });
      router.push("/createShipment/dangerousGoods/step-5");
      return;
    }

    if (isInternational && store.items.filter((i) => i.itemName.trim() !== "").length === 0) {
      Toast.show({
        type: "error",
        text1: t("toast.shipmentValidation.customsItemRequired"),
      });
      router.push("/createShipment/dangerousGoods/step-7");
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      // The server rejects an empty commodities array per package — the store always seeds
      // one blank slot, but fall back defensively here too in case it's ever cleared.
      const dgPackages: DgDraftPackage[] = store.dgPackages.map((pkg) => ({
        packageIndex: pkg.packageIndex,
        commodities:
          pkg.commodities.length > 0
            ? pkg.commodities.map((c) => ({
                unNumber: c.unNumber,
                properShippingName: c.properShippingName,
                technicalName: c.technicalName,
                hazardClass: c.hazardClass,
                packingGroup: c.packingGroup,
                packingInstruction: c.packingInstruction,
                quantity: c.quantity,
                cargoAircraftOnly: c.cargoAircraftOnly,
              }))
            : [{}],
      }));

      const payload: DangerousGoodsSubmitPayload = {
        shipmentType: store.shipmentType || "domestic",
        shipper: store.shipper,
        recipient: store.recipient,
        packages: store.packages,
        weightUnit: store.weightUnit,
        dimensionUnit: store.dimensionUnit,
        packageType: store.packageType,
        currency: store.currency,
        items: isInternational ? store.items.filter((i) => i.itemName.trim() !== "") : [],
        tradeDocuments: store.tradeDocuments,
        dangerousGoods: {
          regulation: store.regulation,
          contentKind: store.contentKind,
          dryIceWeightKg: store.dryIceWeightKg,
          packages: dgPackages,
        },
        dangerousGoodsDocuments: store.dgDocuments,
        preferredPickupDate: store.preferredPickupDate || undefined,
        specialInstructions: store.specialInstructions || undefined,
      };

      const result = await submitDangerousGoodsShipment(payload, generateIdempotencyKey());
      // Navigating out of createShipment/dangerousGoods unmounts that stack, which resets
      // the store — same pattern every other shipment type uses to reach this shared screen.
      router.replace({
        pathname: "/createShipment/confirmation",
        params: { type: "dangerousGoods", trackingNumber: result.trackingNumber, shipmentId: result.shipmentId },
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.dangerousGoods.submit.errorTitle"),
        text2: error instanceof Error ? error.message : t("toast.createShipment.dangerousGoods.submit.errorMessage"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => router.back();

  return {
    shipper: store.shipper,
    recipient: store.recipient,
    packages: store.packages,
    contentKind: store.contentKind,
    commodities: store.dgPackages[0]?.commodities ?? [],
    documentCount: store.dgDocuments.length,
    preferredPickupDate: store.preferredPickupDate,
    setPreferredPickupDate: store.setPreferredPickupDate,
    isSubmitting,
    handleContinue,
    handleBack,
  };
}
