import { View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { rs } from "@/utils/responsive";
import { BackButton } from "@/components/ui/BackButton";

interface TrackingHeaderProps {
  trackingNumber: string;
}

export function TrackingHeader({ trackingNumber }: TrackingHeaderProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <BackButton />

      <View style={styles.titleWrap}>
        <Text size="large" weight="bold">
          {t("shipments.tracking.title")}
        </Text>

        <Text size="small" weight="medium" dimRate="70%">
          {trackingNumber}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  titleWrap: {
    paddingStart: rs(10),
  },
});