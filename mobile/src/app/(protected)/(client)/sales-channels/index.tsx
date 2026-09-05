import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { RefreshableScreen } from "@/components/ui/RefreshableScreen";
import { DashedActionButton } from "@/components/ui/DashedActionButton";
import { ChannelListItem } from "@/components/sections/salesChannels/ChannelListItem";
import { ConnectChannelSheet } from "@/components/sections/salesChannels/ConnectChannelSheet";
import { SalesFeatureGate } from "@/components/sections/salesChannels/SalesFeatureGate";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useSalesChannels } from "@/lib/hooks/useSalesChannels";

export default function SalesChannelsScreen() {
  return (
    <SalesFeatureGate>
      <SalesChannelsScreenContent />
    </SalesFeatureGate>
  );
}

function SalesChannelsScreenContent() {
  const { t } = useTranslation();
  const { data: channels, isLoading } = useSalesChannels();
  const [connectVisible, setConnectVisible] = useState(false);

  return (
    <View style={styles.screen}>
      <RefreshableScreen contentContainerStyle={styles.content}>
        <Text size="xl" weight="bold">
          {t("salesChannels.title")}
        </Text>
        <Text size="small" dimRate="60%" style={styles.subtitle}>
          {t("salesChannels.subtitle")}
        </Text>
        <DashedActionButton
          icon="plus"
          label={t("salesChannels.connectButton")}
          onPress={() => setConnectVisible(true)}
        />
        <View style={styles.quickActions}>
          <QuickActionButton
            icon="sliders"
            label={t("salesChannels.quickActions.assignmentRules")}
            onPress={() => router.push("/sales-channels/assignment-rules")}
          />
          
        </View>

        {isLoading ? (
          <ActivityIndicator color={Colors.primary} style={styles.loading} />
        ) : (
          <>
            {(channels ?? []).map((channel) => (
              <ChannelListItem
                key={channel.id}
                channel={channel}
                onOrdersPress={() => router.push("/sales-channels/orders")}
                onSettingsPress={() => router.push(`/sales-channels/${channel.id}`)}
              />
            ))}

            {(channels ?? []).length === 0 ? (
              <Text size="small" dimRate="55%" style={styles.empty}>
                {t("salesChannels.empty")}
              </Text>
            ) : null}
          </>
        )}


      </RefreshableScreen>

      <ConnectChannelSheet visible={connectVisible} onClose={() => setConnectVisible(false)} />
    </View>
  );
}

function QuickActionButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickActionButton, pressed && styles.quickActionButtonPressed]}
    >
      <Feather name={icon} size={rs(15)} color={Colors.primary} />
      <Text size="small" weight="bold" style={styles.quickActionLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(8),
    paddingBottom: rvs(24),
  },
  subtitle: {
    marginTop: rvs(4),
    marginBottom: rvs(18),
  },
  quickActions: {
    flexDirection: "row",
    gap: rs(10),
    marginBottom: rvs(18),
  },
  quickActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(8),
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingVertical: rvs(14),
  },
  quickActionButtonPressed: {
    opacity: 0.7,
  },
  quickActionLabel: {
    color: Colors.primary,
  },
  loading: {
    marginTop: rvs(40),
  },
  empty: {
    textAlign: "center",
    paddingVertical: rvs(20),
  },
});
