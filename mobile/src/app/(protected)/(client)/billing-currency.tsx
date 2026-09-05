import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import InfoBox from "@/components/ui/InfoBox";
import { ScreenHeader } from "@/components/sections/profile/ScreenHeader";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

import { useClientAccount, useUpdateClientAccount } from "@/lib/hooks/useClientAccount";

const OPTIONS: Array<{ value: "SAR"; codeKey: "sar"; code: string }> = [
  { value: "SAR", codeKey: "sar", code: "SAR" },
];

export default function BillingCurrencyScreen() {
  const { t } = useTranslation();
  const { data: account } = useClientAccount();
  const updateMutation = useUpdateClientAccount();

  const [selected, setSelected] = useState<"SAR" >(
    (account?.preferredCurrency as "SAR") || "SAR",
  );

  React.useEffect(() => {
    if (account?.preferredCurrency === "SAR") {
      setSelected(account.preferredCurrency);
    }
  }, [account?.preferredCurrency]);

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ preferredCurrency: selected });
      Toast.show({
        type: "success",
        text1: t("billingCurrency.successTitle"),
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("billingCurrency.errorTitle"),
        text2: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <ScreenHeader title={t("billingCurrency.title")} subtitle={t("billingCurrency.subtitle")} />

        <View style={styles.card}>
          {OPTIONS.map((option, index) => {
            const isSelected = selected === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setSelected(option.value)}
                style={[styles.row, index > 0 && styles.rowDivider]}
              >
                <View style={styles.textBlock}>
                  <Text size="medium" weight="bold">
                    {option.code}
                  </Text>
                  <Text size="small" dimRate="60%">
                    {t(`billingCurrency.${option.codeKey}`)}
                  </Text>
                </View>

                <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                  {isSelected ? <View style={styles.radioInner} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.footer}>
        <Button
          title={updateMutation.isPending ? t("billingCurrency.saving") : t("billingCurrency.save")}
          onPress={handleSave}
          loading={updateMutation.isPending}
          disabled={updateMutation.isPending}
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
    paddingHorizontal: rs(16),
    paddingTop: rvs(8),
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    marginBottom: rvs(16),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(16),
    paddingVertical: rvs(16),
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  textBlock: {
    flex: 1,
  },
  radioOuter: {
    width: rs(22),
    height: rs(22),
    borderRadius: rs(11),
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: {
    borderColor: Colors.primary,
  },
  radioInner: {
    width: rs(11),
    height: rs(11),
    borderRadius: rs(6),
    backgroundColor: Colors.primary,
  },
  footer: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(8),
  },
});
