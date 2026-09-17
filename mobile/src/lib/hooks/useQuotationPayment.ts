import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";

import {
  confirmShipment,
  getCreditAccess,
  payLater,
  payShipment,
  type CreditAccessResponse,
} from "@/lib/services/createShipment";
import { getSavedCards, type SavedCard } from "@/lib/services/payments";
import type { TapCheckoutResult } from "@/components/ui/TapCheckoutWebView";
import type { TapCheckoutPayResult } from "@/components/ui/TapCheckoutEntry";

export function useQuotationPayment(shipmentId: string | undefined, options?: { isQuote?: boolean }) {
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [creditAccess, setCreditAccess] = useState<CreditAccessResponse | null>(null);
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [isPaying, setIsPaying] = useState(false);
  const [isPayingLater, setIsPayingLater] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [checkoutWebViewUrl, setCheckoutWebViewUrl] = useState<string | null>(null);

  useEffect(() => {
    getCreditAccess()
      .then(setCreditAccess)
      .catch(() => undefined);
    getSavedCards()
      .then((cards) => setSavedCards(cards.filter((c) => c.status === "active")))
      .catch(() => undefined);
  }, []);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/client/shipments"] });
    queryClient.invalidateQueries({ queryKey: [`/api/client/shipments/${shipmentId}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/client/shipments/recent"] });
    queryClient.invalidateQueries({ queryKey: ["/api/client/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/client/invoices"] });
    queryClient.invalidateQueries({ queryKey: ["/api/client/payments"] });
  };

  const finish = () => {
    invalidate();
    Toast.show({ type: "success", text1: t("shipments.quotation.payment.toast.successTitle") });
    router.replace(
      options?.isQuote ? `/shipments/${shipmentId}/quotation` : `/shipments/${shipmentId}`,
    );
  };

  const errorToast = (error: unknown, fallback: string) =>
    Toast.show({
      type: "error",
      text1: fallback,
      text2: error instanceof Error ? error.message : undefined,
    });

  const handlePayNow = async (tapTokenId?: string, saveCardForFuture?: boolean) => {
    if (!shipmentId) return;
    setIsPaying(true);
    try {
      const data = await payShipment({ shipmentId, tapTokenId, saveCardForFuture });

      if (data.transactionUrl) {
        setCheckoutWebViewUrl(data.transactionUrl);
        return;
      }

      if (["CAPTURED", "AUTHORIZED"].includes(String(data.paymentStatus || "").toUpperCase())) {
        setIsConfirming(true);
        await confirmShipment({ shipmentId, paymentIntentId: data.paymentId });
        finish();
      }
    } catch (error) {
      // The charge may already have gone through at Tap even though this call failed
      // (e.g. confirmShipment errored after a successful charge), so the cached shipment
      // can be stale either way.
      invalidate();
      errorToast(error, t("shipments.quotation.payment.toast.errorTitle"));
    } finally {
      setIsPaying(false);
      setIsConfirming(false);
    }
  };

  const handlePayLater = async () => {
    if (!shipmentId) return;
    setIsPayingLater(true);
    try {
      await payLater(shipmentId);
      finish();
    } catch (error) {
      // Pay Later can partially apply (e.g. the credit invoice gets created before carrier
      // booking fails), so the cached shipment/invoice data can be stale even on failure.
      invalidate();
      errorToast(error, t("shipments.quotation.payment.toast.payLaterErrorTitle"));
    } finally {
      setIsPayingLater(false);
    }
  };

  const handleNativeCheckoutResult = async (payResult: TapCheckoutPayResult) => {
    if (payResult.status === "cancelled") return;

    if (payResult.status === "fallback") {
      await handlePayNow(undefined, true);
      return;
    }

    if (payResult.status === "pending") {
      Toast.show({ type: "info", text1: t("shipments.quotation.payment.toast.pendingTitle") });
      invalidate();
      return;
    }

    finish();
  };

  const closeCheckoutWebView = () => setCheckoutWebViewUrl(null);

  const handleCheckoutWebViewResult = async ({ status, shipmentId: resultShipmentId, message }: TapCheckoutResult) => {
    setCheckoutWebViewUrl(null);

    if (status === "failed") {
      invalidate();
      Toast.show({
        type: "error",
        text1: t("shipments.quotation.payment.toast.errorTitle"),
        text2: message,
      });
      return;
    }

    if (status === "pending") {
      invalidate();
      Toast.show({ type: "info", text1: t("shipments.quotation.payment.toast.pendingTitle") });
      return;
    }

    const targetShipmentId = resultShipmentId || shipmentId;
    if (!targetShipmentId) return;

    setIsConfirming(true);
    try {
      await confirmShipment({ shipmentId: targetShipmentId });
      finish();
    } catch (error) {
      invalidate();
      errorToast(error, t("shipments.quotation.payment.toast.errorTitle"));
    } finally {
      setIsConfirming(false);
    }
  };

  return {
    isPaying,
    isPayingLater,
    isConfirming,
    creditAccess,
    savedCards,
    checkoutWebViewUrl,
    handlePayNow,
    handlePayLater,
    handleNativeCheckoutResult,
    closeCheckoutWebView,
    handleCheckoutWebViewResult,
  };
}
