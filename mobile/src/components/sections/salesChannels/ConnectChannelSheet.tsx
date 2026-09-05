import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ChipSelect } from "@/components/ui/ChipSelect";
import InfoBox from "@/components/ui/InfoBox";
import { PlatformIcon } from "@/components/sections/salesChannels/PlatformIcon";
import { CarrierModeSelect } from "@/components/sections/salesChannels/CarrierModeSelect";
import { Colors } from "@/constants/colors";
import { PLATFORMS, platformMeta } from "@/constants/platforms";
import { rs, rvs } from "@/utils/responsive";
import { useConnectSalesChannel } from "@/lib/hooks/useSalesChannels";
import type { SalesChannelSyncSettings } from "@/lib/services/salesChannels";

interface ConnectChannelSheetProps {
  visible: boolean;
  onClose: () => void;
}

type Step = "platform" | "credentials" | "sync" | "carrier";

const EMPTY_CREDENTIALS_FORM = { name: "", storeUrl: "", consumerKey: "", consumerSecret: "" };
const DEFAULT_SYNC: Required<SalesChannelSyncSettings> = {
  importPaidOnly: "paid",
  onNewOrder: "review",
  pickup: "default",
};

export function ConnectChannelSheet({ visible, onClose }: ConnectChannelSheetProps) {
  const { t } = useTranslation();
  const connectMutation = useConnectSalesChannel();

  const [step, setStep] = useState<Step>("platform");
  const [platform, setPlatform] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_CREDENTIALS_FORM);
  const [sync, setSync] = useState<Required<SalesChannelSyncSettings>>(DEFAULT_SYNC);
  const [carrierMode, setCarrierMode] = useState<"manual" | "auto">("manual");

  const reset = () => {
    setStep("platform");
    setPlatform(null);
    setForm(EMPTY_CREDENTIALS_FORM);
    setSync(DEFAULT_SYNC);
    setCarrierMode("manual");
  };

  const handleClose = () => {
    onClose();
    reset();
  };

  const handleSubmit = async () => {
    if (!platform) return;
    try {
      await connectMutation.mutateAsync({
        platform,
        name: form.name || form.storeUrl,
        storeUrl: form.storeUrl,
        carrierMode,
        syncSettings: sync,
        credentials: { consumer_key: form.consumerKey, consumer_secret: form.consumerSecret },
      });
      Toast.show({ type: "success", text1: t("salesChannels.connect.successTitle") });
      handleClose();
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("salesChannels.connect.errorTitle"),
        text2: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const canSubmitCredentials = Boolean(form.storeUrl && form.consumerKey && form.consumerSecret);

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      {step === "platform" ? (
        <View>
          <Text size="large" weight="bold" style={styles.title}>
            {t("salesChannels.connect.title")}
          </Text>
          <Text size="small" dimRate="60%" style={styles.subtitle}>
            {t("salesChannels.connect.subtitle")}
          </Text>

          <View style={styles.list}>
            {PLATFORMS.map((p, index) => (
              <Pressable
                key={p.id}
                disabled={!p.available}
                onPress={() => {
                  setPlatform(p.id);
                  setStep("credentials");
                }}
                style={({ pressed }) => [
                  styles.platformRow,
                  index > 0 && styles.platformRowDivider,
                  pressed && p.available && styles.pressed,
                  !p.available && styles.platformRowDisabled,
                ]}
              >
                <PlatformIcon platform={p.id} size={40} />
                <View style={styles.platformInfo}>
                  <Text size="medium" weight="bold">
                    {p.label}
                  </Text>
                  <Text size="small" dimRate="55%">
                    {p.available
                      ? t("salesChannels.connect.apiKey")
                      : t("salesChannels.connect.comingSoon")}
                  </Text>
                </View>
                {p.available ? (
                  <Ionicons name="chevron-forward" size={rs(18)} color={Colors.textSecondary} />
                ) : null}
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text size="large" weight="bold" style={styles.title}>
            {t("salesChannels.connect.formTitle", { platform: platformMeta(platform ?? "").label })}
          </Text>

          {step === "credentials" ? (
            <>
              <Input
                label={t("salesChannels.connect.storeName")}
                placeholder={t("salesChannels.connect.storeNamePlaceholder")}
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
              />
              <Input
                label={t("salesChannels.connect.storeUrl")}
                placeholder="shop.example.com"
                autoCapitalize="none"
                value={form.storeUrl}
                onChangeText={(v) => setForm((f) => ({ ...f, storeUrl: v }))}
              />
              <Input
                label={t("salesChannels.connect.consumerKey")}
                placeholder="ck_xxx"
                autoCapitalize="none"
                value={form.consumerKey}
                onChangeText={(v) => setForm((f) => ({ ...f, consumerKey: v }))}
              />
              <Input
                label={t("salesChannels.connect.consumerSecret")}
                placeholder="cs_xxx"
                autoCapitalize="none"
                secureTextEntry
                value={form.consumerSecret}
                onChangeText={(v) => setForm((f) => ({ ...f, consumerSecret: v }))}
              />

              <View style={styles.formActions}>
                <Button
                  title={t("salesChannels.connect.back")}
                  variant="outline"
                  onPress={() => setStep("platform")}
                  style={styles.backButton}
                />
                <Button
                  title={t("salesChannels.connect.next")}
                  onPress={() => setStep("sync")}
                  disabled={!canSubmitCredentials}
                  style={styles.connectButton}
                />
              </View>
            </>
          ) : null}

          {step === "sync" ? (
            <>
              <ChipSelect
                label={t("salesChannels.connect.importOrders")}
                value={sync.importPaidOnly}
                onChange={(v) => setSync((s) => ({ ...s, importPaidOnly: v as "paid" | "all" | "tagged" }))}
                options={[
                  { value: "paid", label: t("salesChannels.connect.importOrdersPaid") },
                  { value: "all", label: t("salesChannels.connect.importOrdersAll") },
                  { value: "tagged", label: t("salesChannels.connect.importOrdersTagged") },
                ]}
              />

              <ChipSelect
                label={t("salesChannels.connect.onNewOrder")}
                value={sync.onNewOrder}
                onChange={(v) => setSync((s) => ({ ...s, onNewOrder: v as "review" | "auto" }))}
                options={[
                  { value: "review", label: t("salesChannels.connect.onNewOrderReview") },
                  { value: "auto", label: t("salesChannels.connect.onNewOrderAuto") },
                ]}
              />

              <ChipSelect
                label={t("salesChannels.connect.pickupLocation")}
                value={sync.pickup}
                onChange={() => undefined}
                options={[{ value: "default", label: t("salesChannels.connect.pickupLocationDefault") }]}
              />

              <View style={styles.formActions}>
                <Button
                  title={t("salesChannels.connect.back")}
                  variant="outline"
                  onPress={() => setStep("credentials")}
                  style={styles.backButton}
                />
                <Button
                  title={t("salesChannels.connect.next")}
                  onPress={() => setStep("carrier")}
                  style={styles.connectButton}
                />
              </View>
            </>
          ) : null}

          {step === "carrier" ? (
            <>
              <Text size="xs" weight="semibold" dimRate="55%" textTransform="uppercase" style={styles.sectionLabel}>
                {t("salesChannels.connect.carrierMode")}
              </Text>

              <CarrierModeSelect value={carrierMode} onChange={setCarrierMode} />

              <View style={styles.infoBoxSpacing}>
                <InfoBox text={t("salesChannels.connect.carrierModeNote")} />
              </View>

              <View style={styles.formActions}>
                <Button
                  title={t("salesChannels.connect.back")}
                  variant="outline"
                  onPress={() => setStep("sync")}
                  style={styles.backButton}
                />
                <Button
                  title={connectMutation.isPending ? t("salesChannels.connect.connecting") : t("salesChannels.connect.connect")}
                  onPress={handleSubmit}
                  loading={connectMutation.isPending}
                  disabled={connectMutation.isPending}
                  style={styles.connectButton}
                />
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: rvs(6),
  },
  subtitle: {
    marginBottom: rvs(16),
  },
  sectionLabel: {
    marginBottom: rvs(8),
    letterSpacing: 0.5,
  },
  list: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
    marginBottom: rvs(20),
  },
  platformRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
    paddingVertical: rvs(13),
  },
  platformRowDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  platformRowDisabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.7,
  },
  platformInfo: {
    flex: 1,
  },
  infoBoxSpacing: {
    marginBottom: rvs(4),
  },
  formActions: {
    flexDirection: "row",
    gap: rs(10),
    marginTop: rvs(4),
    marginBottom: rvs(20),
  },
  backButton: {
    flex: 1,
  },
  connectButton: {
    flex: 2,
  },
});
