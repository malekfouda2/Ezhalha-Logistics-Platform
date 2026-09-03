import { useRouter } from "expo-router";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useCreateLocalShipmentStore } from "@/store/createLocalShipmentStore";
import { payShipment, confirmShipment, payLater, getCreditAccess, CreditAccessResponse } from "@/lib/services/createShipment";
import { getSavedCards, SavedCard } from "@/lib/services/payments";
import { TapCheckoutResult } from "@/components/payments/TapCheckoutWebView";

export function useLocalPaymentStep() {
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const checkoutData = useCreateLocalShipmentStore((s) => s.checkoutData);
  const setConfirmData = useCreateLocalShipmentStore((s) => s.setConfirmData);
  const [isPaying, setIsPaying] = useState(false);
  const [isPayingLater, setIsPayingLater] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [creditAccess, setCreditAccess] = useState<CreditAccessResponse | null>(null);
  const [checkoutWebViewUrl, setCheckoutWebViewUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSavedCards()
      .then((cards) => {
        if (!cancelled) setSavedCards(cards.filter((c) => c.status === "active"));
      })
      .catch(() => undefined);
    getCreditAccess()
      .then((access) => {
        if (!cancelled) setCreditAccess(access);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const invalidateShipmentQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/client/shipments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/client/shipments/recent"] });
    queryClient.invalidateQueries({ queryKey: ["/api/client/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/client/invoices"] });
    queryClient.invalidateQueries({ queryKey: ["/api/client/payments"] });
  };

  const handlePayNow = async (tapTokenId?: string, saveCardForFuture?: boolean) => {
    if (!checkoutData) return;
    setIsPaying(true);
    try {
      const data = await payShipment({
        shipmentId: checkoutData.shipmentId,
        tapTokenId,
        saveCardForFuture,
      });

      if (data.transactionUrl) {
        setCheckoutWebViewUrl(data.transactionUrl);
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
        router.replace({
          pathname: "/createShipment/confirmation",
          params: { type: "local", shipmentId: data.shipmentId },
        });
      }
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.local.payment.errorTitle"),
        text2:
          error instanceof Error
            ? error.message
            : t("toast.createShipment.local.payment.errorMessage"),
      });
    } finally {
      setIsPaying(false);
      setIsConfirming(false);
    }
  };

  const closeCheckoutWebView = () => setCheckoutWebViewUrl(null);

  const handleCheckoutWebViewResult = async ({ status, shipmentId, message }: TapCheckoutResult) => {
    setCheckoutWebViewUrl(null);

    if (status === "failed") {
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.local.payment.errorTitle"),
        text2: message || t("toast.createShipment.local.payment.errorMessage"),
      });
      return;
    }

    if (status === "pending") {
      Toast.show({
        type: "info",
        text1: t("toast.createShipment.local.payment.pendingTitle"),
        text2: t("toast.createShipment.local.payment.pendingMessage"),
      });
      return;
    }

    const targetShipmentId = shipmentId || checkoutData?.shipmentId;
    if (!targetShipmentId) return;

    setIsConfirming(true);
    try {
      const confirmed = await confirmShipment({ shipmentId: targetShipmentId });
      setConfirmData(confirmed);
      invalidateShipmentQueries();
      router.replace({
        pathname: "/createShipment/confirmation",
        params: { type: "local", shipmentId: targetShipmentId },
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.local.payment.errorTitle"),
        text2:
          error instanceof Error
            ? error.message
            : t("toast.createShipment.local.payment.errorMessage"),
      });
    } finally {
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
      router.replace({
        pathname: "/createShipment/confirmation",
        params: { type: "local", shipmentId: checkoutData.shipmentId },
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.local.payLater.errorTitle"),
        text2:
          error instanceof Error
            ? error.message
            : t("toast.createShipment.local.payLater.errorMessage"),
      });
    } finally {
      setIsPayingLater(false);
    }
  };

  return {
    checkoutData,
    isPaying,
    isPayingLater,
    isConfirming,
    savedCards,
    creditAccess,
    checkoutWebViewUrl,
    handlePayNow,
    handlePayLater,
    handleBack: () => router.back(),
    closeCheckoutWebView,
    handleCheckoutWebViewResult,
  };
}
