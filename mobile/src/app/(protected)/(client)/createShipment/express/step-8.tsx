// app/create-shipment/express/step-8.tsx

import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { OrderSummaryCard } from "@/components/sections/createShipment/OrderSummaryCard";
import { PaymentMethodCard } from "@/components/sections/createShipment/PaymentMethodCard";
import { SaudiRiyal } from "lucide-react-native";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";

const SUMMARY_LINES = [
  { label: "Shipping", value: "620.00" },
  { label: "Fuel surcharge", value: "58.00" },
  { label: "Pickup", value: "25.00" },
  { label: "VAT (15%)", value: "92.00" },
];

const TOTAL = "795.00";

type PaymentMethodId = "visa" | "new-card" | "pay-later";

export default function PaymentOptionsScreen() {
  const router = useRouter();

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodId>("visa");

  const handlePay = () => {
    router.push("/createShipment/express/confirmation");
  };

  return (
    <ShipmentStepLayout
      step={8}
      totalSteps={8}
      title="Payment Options"
      subtitle="Order Summary"
      onContinue={handlePay}
      continueLabel={
        <View style={styles.continueTitle}>
          <Text size="medium" weight="semibold" style={styles.continueText}>
            Pay
          </Text>
          <SaudiRiyal size={rs(18)} color={Colors.white} />
          <Text size="medium" weight="semibold" style={styles.continueText}>
            {TOTAL}
          </Text>
        </View>
      }
      footerNote="Booked with the carrier after payment"
    >
      <OrderSummaryCard lines={SUMMARY_LINES} total={TOTAL} />

      <SectionTitle title={"PAY WITH"} />
      <PaymentMethodCard
        title="•••• 4242"
        subtitle="Expires 09/28"
        iconLabel="VISA"
        iconBackground="#1A1F71"
        selected={selectedMethod === "visa"}
        onPress={() => setSelectedMethod("visa")}
      />

      <PaymentMethodCard
        title="New card"
        subtitle="Secured by Tap"
        iconLabel="+"
        iconBackground={"#F2F3F5"}
        iconColor={Colors.secondary}
        selected={selectedMethod === "new-card"}
        onPress={() => setSelectedMethod("new-card")}
      />

      <PaymentMethodCard
        title="Pay later · 30 days"
        subtitle={
          <>
            <Text size="small" weight="semibold" style={styles.subtitleText}>
              42,300
            </Text>

            <SaudiRiyal size={rs(14)} color={Colors.textSecondary} />

            <Text size="small" weight="semibold" style={styles.subtitleText}>
              credit available
            </Text>
          </>
        }
        iconLabel=""
        iconBackground="#FFE8DA"
        iconColor={Colors.primary}
        selected={selectedMethod === "pay-later"}
        onPress={() => setSelectedMethod("pay-later")}
      />
    </ShipmentStepLayout>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  scrollContent: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(16),
  },

  sectionTitle: {
    color: "#687994",
    letterSpacing: 1,
    marginBottom: rvs(10),
    marginStart: rs(4),
  },

  footer: {
    paddingHorizontal: rs(20),
    paddingTop: rvs(10),
    paddingBottom: rvs(10),
    backgroundColor: Colors.background,
  },
  continueTitle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(4),
  },

  continueText: {
    color: Colors.white,
  },
  footerNote: {
    textAlign: "center",
    color: "#8A93A3",
    fontSize: rs(13),
    marginTop: rvs(10),
  },
  subtitleText: {
    color: Colors.textSecondary,
  },
});
