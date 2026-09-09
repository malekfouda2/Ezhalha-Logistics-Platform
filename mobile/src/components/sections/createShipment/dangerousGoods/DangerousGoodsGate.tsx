import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import InfoBox from "@/components/ui/InfoBox";
import { KeyboardAwareScreen } from "@/components/ui/KeyboardAwareScreen";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import {
  useDangerousGoodsAccessStatus,
  useRequestDangerousGoodsAccess,
} from "@/lib/hooks/useDangerousGoodsAccessGate";

// Mirrors the web client's dangerous-goods request dialog
// (client/src/pages/client/create-shipment-select.tsx) — same two states (pending vs not)
// and the same copy, so a client sees one consistent message regardless of which app they're
// on. The DG index route renders this whenever the account isn't approved yet — it owns the
// whole screen; success means the index route redirects into the wizard instead.
export function DangerousGoodsGate() {
  const { t } = useTranslation();
  const { data, isLoading } = useDangerousGoodsAccessStatus();
  const requestMutation = useRequestDangerousGoodsAccess();
  const [reason, setReason] = useState("");

  const isPending = data?.request?.status === "pending";

  const handleRequest = async () => {
    try {
      await requestMutation.mutateAsync(reason.trim() || undefined);
      Toast.show({
        type: "success",
        text1: t("createShipment.dangerousGoods.gate.requestSuccessTitle"),
        text2: t("createShipment.dangerousGoods.gate.requestSuccessMessage"),
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("createShipment.dangerousGoods.gate.requestErrorTitle"),
        text2: error instanceof Error ? error.message : t("createShipment.dangerousGoods.gate.requestErrorMessage"),
      });
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <KeyboardAwareScreen contentContainerStyle={styles.content}>
        <View style={styles.iconWrapper}>
          <Ionicons name="warning-outline" size={rs(38)} color="#B8760A" />
        </View>

        <Text size="xl" weight="bold" style={styles.title}>
          {t("createShipment.dangerousGoods.gate.title")}
        </Text>

        {isPending ? (
          <View style={styles.infoBoxSpacing}>
            <InfoBox
              iconName="clock"
              backgroundColor="#FFFBEB"
              borderColor="#FDE68A"
              textColor="#92400E"
              iconColor="#92400E"
              text={t("createShipment.dangerousGoods.gate.requestPendingMessage")}
            />
          </View>
        ) : (
          <>
            <Text size="small" dimRate="60%" style={styles.description}>
              {t("createShipment.dangerousGoods.gate.description")}
            </Text>

            <Text size="small" weight="semibold" style={styles.reasonLabel}>
              {t("createShipment.dangerousGoods.gate.reasonLabel")}
            </Text>
            <Input
              placeholder={t("createShipment.dangerousGoods.gate.reasonPlaceholder")}
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={4}
              style={styles.reasonInput}
            />
            <Button
              title={
                requestMutation.isPending
                  ? t("createShipment.dangerousGoods.gate.requesting")
                  : t("createShipment.dangerousGoods.gate.requestAccess")
              }
              onPress={handleRequest}
              loading={requestMutation.isPending}
              disabled={requestMutation.isPending}
            />
          </>
        )}
      </KeyboardAwareScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: rs(24),
  },
  iconWrapper: {
    alignSelf: "center",
    width: rs(76),
    height: rs(76),
    borderRadius: rs(22),
    backgroundColor: "#FDF0D8",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: rvs(16),
  },
  title: {
    color: Colors.text,
    textAlign: "center",
    marginBottom: rvs(8),
  },
  description: {
    textAlign: "center",
    marginBottom: rvs(20),
  },
  infoBoxSpacing: {
    marginTop: rvs(4),
  },
  reasonLabel: {
    color: Colors.text,
    marginBottom: rvs(6),
  },
  reasonInput: {
    height: rvs(96),
    textAlignVertical: "top",
    marginBottom: rvs(16),
  },
});
