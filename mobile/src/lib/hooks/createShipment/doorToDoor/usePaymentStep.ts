import { useRouter } from "expo-router";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { payShipment, confirmShipment, payLater, getCreditAccess, CreditAccessResponse } from "@/lib/services/createShipment";
import { getSavedCards, SavedCard } from "@/lib/services/payments";
import { TapCheckoutResult } from "@/components/ui/TapCheckoutWebView";
import { useDoorToDoorStore } from "@/store/createDoorToDoorStore";
import { COUNTRY_CODE_SELECT_OPTIONS } from "@shared/countries";

function countryLabel(code: string) {
  return COUNTRY_CODE_SELECT_OPTIONS.find((c) => c.value === code)?.label ?? code;
}

export function usePaymentStep() {
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const checkoutData = useDoorToDoorStore((s) => s.checkoutData);
  const setConfirmData = useDoorToDoorStore((s) => s.setConfirmData);
  const transportMethod = useDoorToDoorStore((s) => s.transportMethod);
  const originCountryCode = useDoorToDoorStore((s) => s.originCountryCode);
  const destinationCountryCode = useDoorToDoorStore((s) => s.destinationCountryCode);

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

  const goToConfirmation = () => {
    const methodLabel = transportMethod === "air" ? "Air" : transportMethod === "sea" ? "Sea" : "Land";
    const route = `${methodLabel} · ${countryLabel(originCountryCode)} → ${countryLabel(destinationCountryCode)}`;
    router.replace({
      pathname: "/createShipment/confirmation",
      params: {
        type: "freight",
        trackingNumber: checkoutData?.trackingNumber ?? "",
        route,
        shipmentId: checkoutData?.shipmentId ?? "",
      },
    });
  };

  const handlePayNow = async (tapTokenId?: string, saveCardForFuture?: boolean) => {
    if (!checkoutData) return;
    setIsPaying(true);
    try {
      const data = await payShipment({ shipmentId: checkoutData.shipmentId, tapTokenId, saveCardForFuture });

      if (data.transactionUrl) {
        setCheckoutWebViewUrl(data.transactionUrl);
        return;
      }

      if (["CAPTURED", "AUTHORIZED"].includes(String(data.paymentStatus || "").toUpperCase())) {
        setIsConfirming(true);
        const confirmed = await confirmShipment({ shipmentId: data.shipmentId, paymentIntentId: data.paymentId });
        setConfirmData(confirmed);
        invalidateShipmentQueries();
        goToConfirmation();
      }
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.express.payment.errorTitle"),
        text2: error instanceof Error ? error.message : t("toast.createShipment.express.payment.errorMessage"),
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
        text1: t("toast.createShipment.express.payment.errorTitle"),
        text2: message || t("toast.createShipment.express.payment.errorMessage"),
      });
      return;
    }

    if (status === "pending") {
      Toast.show({
        type: "info",
        text1: t("toast.createShipment.express.payment.pendingTitle"),
        text2: t("toast.createShipment.express.payment.pendingMessage"),
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
      goToConfirmation();
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.express.payment.errorTitle"),
        text2: error instanceof Error ? error.message : t("toast.createShipment.express.payment.errorMessage"),
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
      goToConfirmation();
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.express.payLater.errorTitle"),
        text2: error instanceof Error ? error.message : t("toast.createShipment.express.payLater.errorMessage"),
      });
    } finally {
      setIsPayingLater(false);
    }
  };

  const handleBack = () => router.back();

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
    handleBack,
    closeCheckoutWebView,
    handleCheckoutWebViewResult,
  };
}
