import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { rs, rvs } from "@/utils/responsive";

interface ShipmentFooterProps {
  onPress: () => void;
  title?: ReactNode;
  footerNote?: string;
}

const ShipmentFooter = ({
  onPress: handleContinue,
  title,
  footerNote,
}: ShipmentFooterProps) => {
  return (
    <View style={styles.footer}>
      <Button title={title ?? "Continue"} onPress={handleContinue} />
      {footerNote && (
        <Text style={styles.footerNote}>
          Booked with the carrier after payment
        </Text>
      )}
    </View>
  );
};

export default ShipmentFooter;

const styles = StyleSheet.create({
  footer: {
    marginTop: rvs(10),
    marginBottom: rvs(20),
    paddingHorizontal: rs(20),
  },

  title: {
    alignItems: "center",
    marginBottom: rvs(10),
  },
  footerNote: {
    textAlign: "center",
    color: "#8A93A3",
    fontSize: rs(13),
    marginTop: rvs(10),
  },
});
