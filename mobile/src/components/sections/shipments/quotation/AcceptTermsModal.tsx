// components/sections/quotations/AcceptTermsSheet.tsx
import { useState } from "react";
import { View, StyleSheet, Switch } from "react-native";
import { SaudiRiyal } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

interface AcceptTermsSheetProps {
  visible: boolean;
  total: string | number;
  isPending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function AcceptTermsSheet({
  visible,
  total,
  isPending = false,
  onConfirm,
  onClose,
}: AcceptTermsSheetProps) {
  const { t } = useTranslation();
  const [accepted, setAccepted] = useState(true);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text size="xl" weight="bold" style={styles.title}>
        {t("shipments.quotation.accept.title")}
      </Text>

      <Text size="small" dimRate="65%" style={styles.description}>
        {t("shipments.quotation.accept.description")}
      </Text>

      <View style={styles.totalCard}>
        <Text size="small" dimRate="65%">
          {t("shipments.quotation.accept.total")}
        </Text>
        <View style={styles.totalValueRow}>
          <SaudiRiyal size={rs(14)} color={Colors.text} style={styles.riyalIcon} />
          <Text size="medium" weight="bold">
            {total}
          </Text>
        </View>
      </View>

      <View style={styles.toggleRow}>
        <Text size="small" weight="medium" style={{ flex: 1 }}>
          {t("shipments.quotation.accept.acceptTerms")}
        </Text>
        <Switch
          value={accepted}
          onValueChange={setAccepted}
          trackColor={{ false: Colors.border, true: Colors.primary }}
          thumbColor={Colors.white}
        />
      </View>

      <Button
        title={t("shipments.quotation.accept.confirm")}
        onPress={onConfirm}
        loading={isPending}
        disabled={!accepted}
        style={styles.confirmButton}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: rvs(8),
  },
  description: {
    marginBottom: rvs(20),
    lineHeight: rvs(20),
  },
  totalCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
    paddingVertical: rvs(14),
    marginBottom: rvs(12),
  },
  totalValueRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  riyalIcon: {
    marginRight: rs(3),
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
    paddingVertical: rvs(14),
    marginBottom: rvs(20),
    gap: rs(10),
  },
  confirmButton: {
    marginTop: 0,
  },
});