import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";

import { useFulfillOrder } from "@/lib/hooks/useOrders";
import {
  confirmShipment,
  getCreditAccess,
  payLater,
  payShipment,
  type CreditAccessResponse,
} from "@/lib/services/createShipment";
import type { FulfillOrderResult } from "@/lib/services/orders";
import type { TapCheckoutResult } from "@/components/ui/TapCheckoutWebView";

export function useOrderFulfillPayment(orderId: string | undefined) {
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const fulfillMutation = useFulfillOrder();
  const [creditAccess, setCreditAccess] = useState<CreditAccessResponse | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [isPayingLater, setIsPayingLater] = useState(false);
  const [checkoutWebViewUrl, setCheckoutWebViewUrl] = useState<string | null>(null);
  const [pendingShipmentId, setPendingShipmentId] = useState<string | null>(null);

  useEffect(() => {
    getCreditAccess()
      .then(setCreditAccess)
      .catch(() => undefined);
  }, []);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/client/orders"] });
    queryClient.invalidateQueries({ queryKey: ["/api/client/shipments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/client/stats"] });
  };

  const finish = () => {
    invalidate();
    Toast.show({ type: "success", text1: t("orderFulfill.toast.successTitle") });
    router.back();
  };

  const errorToast = (error: unknown, fallback: string) =>
    Toast.show({
      type: "error",
      text1: fallback,
      text2: error instanceof Error ? error.message : undefined,
    });

  const payNow = async (result: FulfillOrderResult) => {
    setIsPaying(true);
    try {
      const data = await payShipment({ shipmentId: result.shipmentId });
      if (data.transactionUrl) {
        setPendingShipmentId(result.shipmentId);
        setCheckoutWebViewUrl(data.transactionUrl);
        return;
      }
      if (["CAPTURED", "AUTHORIZED"].includes(String(data.paymentStatus || "").toUpperCase())) {
        await confirmShipment({ shipmentId: data.shipmentId, paymentIntentId: data.paymentId });
        finish();
      }
    } catch (error) {
      errorToast(error, t("orderFulfill.toast.paymentErrorTitle"));
    } finally {
      setIsPaying(false);
    }
  };

  const payLaterNow = async (result: FulfillOrderResult) => {
    setIsPayingLater(true);
    try {
      await payLater(result.shipmentId);
      finish();
    } catch (error) {
      errorToast(error, t("orderFulfill.toast.payLaterErrorTitle"));
    } finally {
      setIsPayingLater(false);
    }
  };

  const handleFulfill = async (
    carrierCode: string,
    weightKg: number | undefined,
    method: "now" | "later",
  ) => {
    if (!orderId) return;
    try {
      const result = await fulfillMutation.mutateAsync({ id: orderId, carrierCode, weightKg });
      if (method === "later") {
        await payLaterNow(result);
      } else {
        await payNow(result);
      }
    } catch (error) {
      errorToast(error, t("orderFulfill.toast.fulfillErrorTitle"));
    }
  };

  const closeCheckoutWebView = () => setCheckoutWebViewUrl(null);

  const handleCheckoutWebViewResult = async ({ status, shipmentId, message }: TapCheckoutResult) => {
    setCheckoutWebViewUrl(null);
    if (status === "failed") {
      Toast.show({
        type: "error",
        text1: t("orderFulfill.toast.paymentErrorTitle"),
        text2: message,
      });
      return;
    }
    if (status === "pending") {
      Toast.show({ type: "info", text1: t("orderFulfill.toast.paymentPendingTitle") });
      return;
    }
    const targetShipmentId = shipmentId || pendingShipmentId;
    if (!targetShipmentId) return;
    try {
      await confirmShipment({ shipmentId: targetShipmentId });
      finish();
    } catch (error) {
      errorToast(error, t("orderFulfill.toast.paymentErrorTitle"));
    }
  };

  return {
    isFulfilling: fulfillMutation.isPending || isPaying,
    isPayingLater,
    creditAccess,
    checkoutWebViewUrl,
    handleFulfill,
    closeCheckoutWebView,
    handleCheckoutWebViewResult,
  };
}
