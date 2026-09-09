// app/create-shipment/dangerousGoods/index.tsx

import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect } from "expo-router";

import { Colors } from "@/constants/colors";
import { DangerousGoodsGate } from "@/components/sections/createShipment/dangerousGoods/DangerousGoodsGate";
import { useDangerousGoodsAccessStatus } from "@/lib/hooks/useDangerousGoodsAccessGate";

export default function DangerousGoodsIndex() {
  const { data, isLoading } = useDangerousGoodsAccessStatus();

  if (isLoading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (data?.enabled) {
    return <Redirect href="/createShipment/dangerousGoods/step-1" />;
  }

  return <DangerousGoodsGate />;
}

const styles = StyleSheet.create({
  centerScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
});
