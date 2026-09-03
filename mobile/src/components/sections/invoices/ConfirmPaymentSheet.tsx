// components/sections/invoices/ConfirmPaymentSheet.tsx
import { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { SaudiRiyal } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PaymentMethodCard } from "@/components/sections/createShipment/PaymentMethodCard";
import { TapCheckoutWebView, TapCheckoutResult } from "@/components/ui/TapCheckoutWebView";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { formatMoney, formatShortDate } from "@/utils/invoiceFormat";
import { SavedCard } from "@/lib/services/payments";
import { payInvoice } from "@/lib/services/invoices";
import type { Invoice } from "@shared/schema";

interface ConfirmPaymentSheetProps {
  visible: boolean;
  invoice: Invoice | null;
  onClose: () => void;
  onPaid: () => void;
}

function cardSubtitle(card: SavedCard, t: (key: string, opts?: any) => string) {
  const expiry =
    card.expMonth && card.expYear
      ? `${String(card.expMonth).padStart(2, "0")}/${String(card.expYear).slice(-2)}`
      : null;

  if (!expiry) return card.isDefault ? t("invoices.savedCards.default") : "";
  return card.isDefault
    ? `${t("invoices.savedCards.default")} · ${t("invoices.savedCards.expires", { date: expiry })}`
    : t("invoices.savedCards.expires", { date: expiry });
}

export function ConfirmPaymentSheet({
  visible,
  invoice,
  onClose,
  onPaid,
}: ConfirmPaymentSheetProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedCardId, setSelectedCardId] = useState<string | "new">("new");
  const [isPaying, setIsPaying] = useState(false);
  const [checkoutWebViewUrl, setCheckoutWebViewUrl] = useState<string | null>(null);

  const { data: savedCards = [] } = useQuery<SavedCard[]>({
    queryKey: ["/api/client/payments/tap/saved-cards"],
    enabled: visible,
  });

  useEffect(() => {
    if (!visible) return;
    const defaultCard = savedCards.find((c) => c.isDefault) ?? savedCards[0];
    setSelectedCardId(defaultCard?.id ?? "new");
  }, [visible, savedCards]);

  const invalidatePaymentQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/client/invoices"] });
    queryClient.invalidateQueries({ queryKey: ["/api/client/payments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/client/stats"] });
  };

  const handlePay = async () => {
    if (!invoice) return;
    setIsPaying(true);
    try {
      const selectedCard = savedCards.find((c) => c.id === selectedCardId);
      const result = await payInvoice({
        invoiceId: invoice.id,
        tapTokenId: selectedCard?.tapCardId,
      });

      if (result.transactionUrl) {
        setCheckoutWebViewUrl(result.transactionUrl);
        return;
      }

      Toast.show({
        type: "success",
        text1: t("invoices.confirmPayment.successTitle"),
        text2: t("invoices.confirmPayment.successMessage", { number: invoice.invoiceNumber }),
      });
      invalidatePaymentQueries();
      onPaid();
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("invoices.confirmPayment.errorTitle"),
        text2: error instanceof Error ? error.message : t("invoices.confirmPayment.errorMessage"),
      });
    } finally {
      setIsPaying(false);
    }
  };

  const handleCheckoutResult = ({ status, message }: TapCheckoutResult) => {
    setCheckoutWebViewUrl(null);

    if (status === "success") {
      Toast.show({
        type: "success",
        text1: t("invoices.confirmPayment.successTitle"),
        text2: invoice
          ? t("invoices.confirmPayment.successMessage", { number: invoice.invoiceNumber })
          : undefined,
      });
      invalidatePaymentQueries();
      onPaid();
      return;
    }

    if (status === "failed") {
      Toast.show({
        type: "error",
        text1: t("invoices.confirmPayment.errorTitle"),
        text2: message || t("invoices.confirmPayment.errorMessage"),
      });
      return;
    }

    Toast.show({
      type: "info",
      text1: t("invoices.confirmPayment.pendingTitle"),
    });
    invalidatePaymentQueries();
  };

  if (!invoice) return null;

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose}>
        <Text size="xl" weight="bold" style={styles.title}>
          {t("invoices.confirmPayment.title")}
        </Text>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text size="small" dimRate="65%">
              {t("invoices.confirmPayment.invoice")}
            </Text>
            <Text size="small" weight="bold">
              {invoice.invoiceNumber}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text size="small" dimRate="65%">
              {t("invoices.confirmPayment.due")}
            </Text>
            <Text size="small" weight="bold">
              {formatShortDate(invoice.dueDate)}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text size="medium" weight="bold">
              {t("invoices.confirmPayment.amount")}
            </Text>
            <View style={styles.amountRow}>
              <SaudiRiyal size={rs(16)} color={Colors.primary} style={styles.riyalIcon} />
              <Text size="large" weight="bold" style={{ color: Colors.primary }}>
                {formatMoney(invoice.amount)}
              </Text>
            </View>
          </View>
        </View>

        <Text size="xs" weight="semibold" dimRate="55%" textTransform="uppercase" style={styles.sectionLabel}>
          {t("invoices.confirmPayment.payWith")}
        </Text>

        {savedCards.map((card) => (
          <PaymentMethodCard
            key={card.id}
            title={`•••• ${card.lastFour ?? ""}`}
            subtitle={cardSubtitle(card, t)}
            iconLabel={(card.brand ?? "CARD").slice(0, 4).toUpperCase()}
            iconBackground="navy"
            selected={selectedCardId === card.id}
            onPress={() => setSelectedCardId(card.id)}
          />
        ))}

        <PaymentMethodCard
          title={t("invoices.confirmPayment.newCard")}
          subtitle={t("invoices.confirmPayment.newCardSubtitle")}
          iconLabel="+"
          iconBackground="#F2F3F5"
          iconColor={Colors.secondary}
          selected={selectedCardId === "new"}
          onPress={() => setSelectedCardId("new")}
        />

        <Button
          title={t("invoices.confirmPayment.pay", { amount: formatMoney(invoice.amount) })}
          onPress={handlePay}
          loading={isPaying}
          style={styles.payButton}
        />
      </BottomSheet>

      <TapCheckoutWebView
        url={checkoutWebViewUrl}
        onResult={handleCheckoutResult}
        onClose={() => setCheckoutWebViewUrl(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: rvs(16),
  },
  summaryCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
    paddingVertical: rvs(4),
    marginBottom: rvs(20),
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: rvs(12),
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  riyalIcon: {
    marginRight: rs(3),
  },
  sectionLabel: {
    marginBottom: rvs(10),
    letterSpacing: 0.5,
  },
  payButton: {
    marginTop: rvs(4),
  },
});
