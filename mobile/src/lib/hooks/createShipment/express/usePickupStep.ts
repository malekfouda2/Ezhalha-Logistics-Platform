import { useRouter } from "expo-router";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useCreateShipmentStore, isInternationalShipment } from "@/store/createShipmentStore";
import { CheckoutPayload, submitCheckout } from "@/lib/services/createShipment";

const PICKUP_CUTOFF_HOUR = 15; // keep in sync with server

function isKsaWeekendDow(dow: number): boolean {
  return dow === 5 || dow === 6;
}

export function computeDefaultPickup(now: Date = new Date()): { date: string; sameDay: boolean } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {} as Record<string, string>);
  const y = Number(parts.year), m = Number(parts.month), d = Number(parts.day);
  const hour = Number(parts.hour === "24" ? "0" : parts.hour);
  const cur = new Date(Date.UTC(y, m - 1, d));
  if (hour < PICKUP_CUTOFF_HOUR && !isKsaWeekendDow(cur.getUTCDay())) {
    return { date: cur.toISOString().slice(0, 10), sameDay: true };
  }
  do { cur.setUTCDate(cur.getUTCDate() + 1); } while (isKsaWeekendDow(cur.getUTCDay()));
  return { date: cur.toISOString().slice(0, 10), sameDay: false };
}

export function usePickupStep() {
  const router = useRouter();
  const { t } = useTranslation();
  const store = useCreateShipmentStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastCheckoutSignature, setLastCheckoutSignature] = useState<string | null>(null);

  const isInternational = isInternationalShipment(store.shipmentType);
  const defaultPickup = computeDefaultPickup();

  const buildCheckoutPayload = (): CheckoutPayload | null => {
    if (!store.selectedQuoteId) return null;

    const payload: CheckoutPayload = {
      quoteId: store.selectedQuoteId,
      pickup: {
        requested: true,
        date: store.pickup.custom && store.pickup.date ? store.pickup.date : defaultPickup.date,
        readyTime: store.pickup.readyTime,
        closeTime: store.pickup.closeTime,
        location: store.pickup.location || undefined,
        instructions: store.pickup.instructions || undefined,
      },
    };

    if (isInternational) {
      payload.items = store.items
        .filter((item) => item.itemName.trim() !== "")
        .map((item) => ({
          itemName: item.itemName,
          itemDescription: item.itemDescription || undefined,
          category: item.category,
          material: item.material || undefined,
          countryOfOrigin: item.countryOfOrigin,
          hsCode: item.hsCode || undefined,
          hsCodeSource: item.hsCodeSource || undefined,
          hsCodeConfidence: item.hsCodeConfidence || undefined,
          hsCodeCandidates: item.hsCodeCandidates.length > 0 ? item.hsCodeCandidates : undefined,
          price: item.price,
          currency: item.currency,
          quantity: item.quantity,
        }));
      payload.tradeDocuments = store.customsInputMode === "invoice" ? store.tradeDocuments : [];
    }

    return payload;
  };

  const handleContinue = async () => {
    const payload = buildCheckoutPayload();
    if (!payload) return;
    if (isSubmitting) return;

    const signature = JSON.stringify(payload);
    if (signature === lastCheckoutSignature && store.checkoutData) {
      router.push("/createShipment/express/step-8");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await submitCheckout(payload);
      setLastCheckoutSignature(signature);
      store.setCheckoutData(data);
      router.push("/createShipment/express/step-8");
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("toast.createShipment.express.checkout.errorTitle"),
        text2:
          error instanceof Error
            ? error.message
            : t("toast.createShipment.express.checkout.errorMessage"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () =>
    router.push(isInternational ? "/createShipment/express/step-6" : "/createShipment/express/step-5");

  return {
    pickup: store.pickup,
    setPickup: store.setPickup,
    defaultPickup,
    isSubmitting,
    handleContinue,
    handleBack,
  };
}