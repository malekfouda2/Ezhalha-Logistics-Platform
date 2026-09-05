import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import InfoBox from "@/components/ui/InfoBox";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useRequestSalesFeature, useSalesFeatureStatus } from "@/lib/hooks/useSalesFeatureGate";

export function SalesFeatureGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { data, isLoading } = useSalesFeatureStatus();
  const requestMutation = useRequestSalesFeature();
  const [reason, setReason] = useState("");

  const handleRequest = async () => {
    try {
      await requestMutation.mutateAsync(reason || undefined);
      Toast.show({ type: "success", text1: t("salesChannels.gate.requestSuccessTitle") });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("salesChannels.gate.requestErrorTitle"),
        text2: error instanceof Error ? error.message : undefined,
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

  if (data?.enabled) {
    return <>{children}</>;
  }

  const status = data?.request?.status;

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.iconWrapper}>
          <Ionicons name="storefront-outline" size={rs(38)} color={Colors.primary} />
        </View>

        <Text size="xl" weight="bold" style={styles.title}>
          {t("salesChannels.gate.title")}
        </Text>
        <Text size="small" dimRate="60%" style={styles.description}>
          {t("salesChannels.gate.description")}
        </Text>

        {status === "pending" ? (
          <View style={styles.infoBoxSpacing}>
            <InfoBox
              iconName="clock"
              backgroundColor="#FFFBEB"
              borderColor="#FDE68A"
              textColor="#92400E"
              iconColor="#92400E"
              text={t("salesChannels.gate.requestPendingMessage")}
            />
          </View>
        ) : status === "rejected" ? (
          <>
            <View style={styles.infoBoxSpacing}>
              <InfoBox
                iconName="x-circle"
                backgroundColor="#FDE8E8"
                borderColor="#F5B5B5"
                textColor={Colors.error}
                iconColor={Colors.error}
                text={data?.request?.adminNotes || t("salesChannels.gate.previousDeclinedTitle")}
              />
            </View>
            <Input
              placeholder={t("salesChannels.gate.reasonPlaceholder")}
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={4}
              style={styles.reasonInput}
            />
            <Button
              title={requestMutation.isPending ? t("salesChannels.gate.requesting") : t("salesChannels.gate.requestAgain")}
              onPress={handleRequest}
              loading={requestMutation.isPending}
              disabled={requestMutation.isPending}
            />
          </>
        ) : (
          <>
            <Input
              placeholder={t("salesChannels.gate.reasonPlaceholder")}
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={4}
              style={styles.reasonInput}
            />
            <Button
              title={requestMutation.isPending ? t("salesChannels.gate.requesting") : t("salesChannels.gate.requestAccess")}
              onPress={handleRequest}
              loading={requestMutation.isPending}
              disabled={requestMutation.isPending}
            />
            <Text size="xs" dimRate="55%" style={styles.footnote}>
              {t("salesChannels.gate.primaryContactNote")}
            </Text>
          </>
        )}
      </View>
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
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: rs(24),
  },
  iconWrapper: {
    alignSelf: "center",
    width: rs(76),
    height: rs(76),
    borderRadius: rs(22),
    backgroundColor: "#FFF3EC",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: rvs(16),
  },
  infoBoxSpacing: {
    marginBottom: rvs(16),
  },
  title: {
    textAlign: "center",
  },
  description: {
    textAlign: "center",
    marginTop: rvs(8),
    marginBottom: rvs(20),
  },
  reasonInput: {
    height: rvs(100),
    textAlignVertical: "top",
    paddingTop: rvs(14),
  },
  footnote: {
    textAlign: "center",
    marginTop: rvs(12),
  },
});
