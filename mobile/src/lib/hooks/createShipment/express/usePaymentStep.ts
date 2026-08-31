import { useRouter } from "expo-router";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";
import { useCreateShipmentStore } from "@/store/createShipmentStore";
import { useState } from "react";
import { Linking } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { payShipment, confirmShipment, payLater } from "@/lib/services/createShipment";

export function usePaymentStep() {
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const checkoutData = useCreateShipmentStore((s) => s.checkoutData);
  const setConfirmData = useCreateShipmentStore((s) => s.setConfirmData);
  const [isPaying, setIsPaying] = useState(false);
  const [isPayingLater, setIsPayingLater] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const invalidateShipmentQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/client/shipments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/client/shipments/recent"] });
    queryClient.invalidateQueries({ queryKey: ["/api/client/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/client/invoices"] });
    queryClient.invalidateQueries({ queryKey: ["/api/client/payments"] });
  };

  const handlePayNow = async (tapTokenId: string, saveCardForFuture?: boolean) => {
    if (!checkoutData) return;
    setIsPaying(true);
    try {
      const data = await payShipment({
        shipmentId: checkoutData.shipmentId,
        tapTokenId,
        saveCardForFuture,
      });

      if (data.transactionUrl) {
        await Linking.openURL(data.transactionUrl);
        return;
      }

      if (["CAPTURED", "AUTHORIZED"].includes(String(data.paymentStatus || "").toUpperCase())) {
        setIsConfirming(true);
        const confirmed = await confirmShipment({
          shipmentId: data.shipmentId,
          paymentIntentId: data.paymentId,
        });
        setConfirmData(confirmed);
        invalidateShipmentQueries();
        router.push({ pathname: "/createShipment/confirmation", params: { type: "express" } });
      }
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.express.payment.errorTitle"),
        text2:
          error instanceof Error
            ? error.message
            : t("toast.createShipment.express.payment.errorMessage"),
      });
    } finally {
      setIsPaying(false);
      setIsConfirming(false);
    }
  };

  const handlePayLater = async () => {
    if (!checkoutData?.shipmentId) return;
    setIsPayingLater(true);
    try {
      const data = await payLater(checkoutData.shipmentId);
      setConfirmData({
        shipment: data.shipment,
        carrierTrackingNumber: data.carrierTrackingNumber || "",
        labelUrl: data.labelUrl,
        estimatedDelivery: data.estimatedDelivery,
      });
      invalidateShipmentQueries();
      queryClient.invalidateQueries({ queryKey: ["/api/client/credit-invoices"] });
      router.push({ pathname: "/createShipment/confirmation", params: { type: "express" } });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.express.payLater.errorTitle"),
        text2:
          error instanceof Error
            ? error.message
            : t("toast.createShipment.express.payLater.errorMessage"),
      });
    } finally {
      setIsPayingLater(false);
    }
  };

  const handleBack = () => router.back();

  return { checkoutData, isPaying, isPayingLater, isConfirming, handlePayNow, handlePayLater, handleBack };
}