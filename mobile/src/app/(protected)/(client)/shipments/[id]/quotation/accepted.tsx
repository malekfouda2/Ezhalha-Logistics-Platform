// app/quotations/[id]/accepted.tsx

import { View, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Colors, setOpacity } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { Shipment } from "@shared/schema";

export default function QuotationAcceptedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();

  const { data: quotation } = useQuery<Shipment>({
    queryKey: [`/api/client/shipments/${id}`],
    enabled: !!id,
  });

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="checkmark" size={rs(50)} color="#2db25e" />
        </View>

        <Text size="xxl" weight="bold" style={styles.title}>
          {t("shipments.quotation.accepted.title")}
        </Text>

        <Text size="small" dimRate="60%" style={styles.subtitle}>
          {t("shipments.quotation.accepted.subtitle")}
        </Text>

        <View style={styles.referenceCard}>
          <Text
            size="xs"
            weight="semibold"
            dimRate="55%"
            textTransform="uppercase"
            style={styles.referenceLabel}
          >
            {t("shipments.quotation.accepted.quotation")}
          </Text>
          <Text size="large" weight="bold">
            {quotation?.trackingNumber ?? id}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Button
          title={t("shipments.quotation.accepted.continueToPayment")}
          // onPress={() => router.push(`/shipments/${id}/payment`)}
          onPress={() => router.push(`/shipments`)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: rs(24),
  },

  iconWrap: {
    width: rs(96),
    height: rs(96),
    borderRadius: rs(48),
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: rvs(24),
  },

  title: {
    marginBottom: rvs(10),
    textAlign: "center",
  },

  subtitle: {
    textAlign: "center",
    marginBottom: rvs(28),
  },

  referenceCard: {
    width: "100%",
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingVertical: rvs(16),
    paddingHorizontal: rs(16),
    alignItems: "center",
  },

  referenceLabel: {
    marginBottom: rvs(6),
    letterSpacing: 0.5,
  },

  footer: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(10),
    paddingBottom: rvs(20),
    backgroundColor: Colors.background,
  },
});