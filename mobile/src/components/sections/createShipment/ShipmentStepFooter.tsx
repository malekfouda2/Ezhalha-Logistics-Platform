import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { rs, rvs } from "@/utils/responsive";
import { useTranslation } from "react-i18next";

interface ShipmentFooterProps {
  onPress: () => void;
  title?: ReactNode;
  footerNote?: string;
  loading?: boolean;
}

const ShipmentFooter = ({
  onPress: handleContinue,
  title,
  footerNote,
  loading,
}: ShipmentFooterProps) => {
  const { t } = useTranslation();

  return (
    <View style={styles.footer}>
      <Button
        title={title ?? t("createShipment.express.common.continue")}
        onPress={handleContinue}
        loading={loading}
      />
      {footerNote && <Text style={styles.footerNote}>{footerNote}</Text>}
    </View>
  );
};

export default ShipmentFooter;

const styles = StyleSheet.create({
  footer: {
    marginVertical: rvs(20),
    paddingHorizontal: rs(20),
  },

  title: {
    alignItems: "center",
  },
  footerNote: {
    textAlign: "center",
    color: "#8A93A3",
    fontSize: rs(13),
    marginTop: rvs(10),
  },
});
