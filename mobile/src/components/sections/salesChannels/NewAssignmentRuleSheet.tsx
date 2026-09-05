import React, { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ChipSelect } from "@/components/ui/ChipSelect";
import { rvs } from "@/utils/responsive";
import { useCreateCarrierRule } from "@/lib/hooks/useCarrierRules";
import type { CarrierRule } from "@/lib/services/carrierRules";

const LOCAL_CARRIERS = ["SMSA", "Naqel", "Zajil", "SPL", "iMile"];

const WEIGHT_OPTIONS = [
  { value: "any", labelKey: "any" },
  { value: "<1kg", labelKey: "under1" },
  { value: "1-5kg", labelKey: "between1and5" },
  { value: "≥5kg", labelKey: "over5" },
];

const REGION_OPTIONS = [
  { value: "any", labelKey: "any" },
  { value: "central", labelKey: "central" },
  { value: "western", labelKey: "western" },
  { value: "eastern", labelKey: "eastern" },
  { value: "south", labelKey: "south" },
];

interface NewAssignmentRuleSheetProps {
  visible: boolean;
  onClose: () => void;
  nextPriority: number;
}

const EMPTY_FORM = {
  name: "",
  weight: "any",
  region: "any",
  carrierCode: LOCAL_CARRIERS[0],
};

export function NewAssignmentRuleSheet({ visible, onClose, nextPriority }: NewAssignmentRuleSheetProps) {
  const { t } = useTranslation();
  const createMutation = useCreateCarrierRule();
  const [form, setForm] = useState(EMPTY_FORM);

  const handleClose = () => {
    onClose();
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async () => {
    try {
      await createMutation.mutateAsync({
        name: form.name,
        priority: nextPriority,
        enabled: true,
        conditions: JSON.stringify({ weight: form.weight, region: form.region, value: "any", channel: "any" }),
        strategy: "specific_carrier" as CarrierRule["strategy"],
        carrierCode: form.carrierCode,
      });
      Toast.show({ type: "success", text1: t("salesChannels.assignmentRules.form.successTitle") });
      handleClose();
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("salesChannels.assignmentRules.form.errorTitle"),
        text2: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text size="large" weight="bold" style={styles.title}>
          {t("salesChannels.assignmentRules.form.title")}
        </Text>

        <Input
          placeholder={t("salesChannels.assignmentRules.form.namePlaceholder")}
          value={form.name}
          onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
        />

        <ChipSelect
          label={t("salesChannels.assignmentRules.form.destination")}
          value={form.region}
          onChange={(v) => setForm((f) => ({ ...f, region: v }))}
          options={REGION_OPTIONS.map((o) => ({
            value: o.value,
            label: t(`salesChannels.assignmentRules.regions.${o.labelKey}`),
          }))}
        />

        <ChipSelect
          label={t("salesChannels.assignmentRules.form.weight")}
          value={form.weight}
          onChange={(v) => setForm((f) => ({ ...f, weight: v }))}
          options={WEIGHT_OPTIONS.map((o) => ({
            value: o.value,
            label: t(`salesChannels.assignmentRules.weights.${o.labelKey}`),
          }))}
        />

        <ChipSelect
          label={t("salesChannels.assignmentRules.form.carrier")}
          value={form.carrierCode}
          onChange={(v) => setForm((f) => ({ ...f, carrierCode: v }))}
          options={LOCAL_CARRIERS.map((c) => ({ value: c, label: c }))}
        />

        <Button
          title={createMutation.isPending ? t("salesChannels.assignmentRules.form.saving") : t("salesChannels.assignmentRules.form.save")}
          onPress={handleSubmit}
          loading={createMutation.isPending}
          disabled={!form.name || createMutation.isPending}
          style={styles.submit}
        />
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: rvs(16),
  },
  submit: {
    marginBottom: rvs(20),
  },
});
