import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { RefreshableScreen } from "@/components/ui/RefreshableScreen";
import InfoBox from "@/components/ui/InfoBox";
import { DashedActionButton } from "@/components/ui/DashedActionButton";
import { ScreenHeader } from "@/components/sections/profile/ScreenHeader";
import { NewAssignmentRuleSheet } from "@/components/sections/salesChannels/NewAssignmentRuleSheet";
import { SalesFeatureGate } from "@/components/sections/salesChannels/SalesFeatureGate";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useCarrierRules, useDeleteCarrierRule, useToggleCarrierRule } from "@/lib/hooks/useCarrierRules";
import { parseRuleConditions } from "@/lib/services/carrierRules";

export default function AssignmentRulesScreen() {
  return (
    <SalesFeatureGate>
      <AssignmentRulesScreenContent />
    </SalesFeatureGate>
  );
}

function AssignmentRulesScreenContent() {
  const { t } = useTranslation();
  const { data: rules, isLoading } = useCarrierRules();
  const toggleMutation = useToggleCarrierRule();
  const deleteMutation = useDeleteCarrierRule();
  const [sheetVisible, setSheetVisible] = useState(false);

  const summarize = (conditions: string | null) => {
    const c = parseRuleConditions(conditions);
    const parts: string[] = [];
    if (c.weight && c.weight !== "any") parts.push(t(`salesChannels.assignmentRules.weights.${weightKey(c.weight)}`));
    if (c.region && c.region !== "any") parts.push(t(`salesChannels.assignmentRules.regions.${c.region}`));
    return parts.length ? parts.join(" · ") : t("salesChannels.assignmentRules.anyOrder");
  };

  return (
    <View style={styles.screen}>
      <RefreshableScreen contentContainerStyle={styles.content}>
        <ScreenHeader
          title={t("salesChannels.assignmentRules.title")}
          subtitle={t("salesChannels.assignmentRules.subtitle")}
        />

        {isLoading ? (
          <ActivityIndicator color={Colors.primary} style={styles.loading} />
        ) : (
          <View style={styles.list}>
            {(rules ?? []).map((rule) => (
              <View key={rule.id} style={styles.ruleCard}>
                <View style={styles.ruleInfo}>
                  <Text size="medium" weight="bold" numberOfLines={1}>
                    {rule.name}
                  </Text>
                  <Text size="xs" dimRate="55%" numberOfLines={1}>
                    {summarize(rule.conditions)}
                  </Text>
                </View>

                <View style={styles.carrierBadge}>
                  <Text size="xs" weight="bold" style={styles.carrierBadgeText}>
                    {rule.strategy === "specific_carrier"
                      ? rule.carrierCode
                      : rule.strategy === "cheapest"
                        ? t("salesChannels.assignmentRules.cheapest")
                        : t("salesChannels.assignmentRules.fastest")}
                  </Text>
                </View>

                <Pressable onPress={() => toggleMutation.mutate(rule)} style={styles.toggleButton}>
                  <Text size="xs" weight="bold" style={rule.enabled ? styles.toggleOn : styles.toggleOff}>
                    {rule.enabled ? t("salesChannels.assignmentRules.on") : t("salesChannels.assignmentRules.off")}
                  </Text>
                </Pressable>

                <Pressable onPress={() => deleteMutation.mutate(rule.id)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={rs(18)} color={Colors.error} />
                </Pressable>
              </View>
            ))}

            {(rules ?? []).length === 0 ? (
              <Text size="small" dimRate="55%" style={styles.empty}>
                {t("salesChannels.assignmentRules.empty")}
              </Text>
            ) : null}

            <View style={styles.defaultFallbackCard}>
              <Ionicons name="star-outline" size={rs(16)} color={Colors.textSecondary} />
              <View style={styles.ruleInfo}>
                <Text size="medium" weight="bold">
                  {t("salesChannels.assignmentRules.defaultFallback.title")}
                </Text>
                <Text size="xs" dimRate="55%">
                  {t("salesChannels.assignmentRules.defaultFallback.subtitle")}
                </Text>
              </View>
              <View style={styles.defaultFallbackBadge}>
                <Text size="xs" weight="bold" style={styles.defaultFallbackBadgeText}>
                  {t("salesChannels.assignmentRules.cheapest")}
                </Text>
              </View>
            </View>
          </View>
        )}

        <DashedActionButton
          icon="plus"
          label={t("salesChannels.assignmentRules.newRule")}
          onPress={() => setSheetVisible(true)}
        />

        <InfoBox text={t("salesChannels.assignmentRules.infoBanner")} />
      </RefreshableScreen>

      <NewAssignmentRuleSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        nextPriority={(rules?.length ?? 0) + 1}
      />
    </View>
  );
}

function weightKey(value: string): string {
  if (value === "<1kg") return "under1";
  if (value === "1-5kg") return "between1and5";
  if (value === "≥5kg") return "over5";
  return "any";
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
  loading: {
    marginTop: rvs(40),
  },
  list: {
    gap: rs(10),
    marginBottom: rvs(16),
  },
  ruleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(10),
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    padding: rs(14),
  },
  ruleInfo: {
    flex: 1,
  },
  carrierBadge: {
    backgroundColor: "#FFF3EC",
    borderRadius: rs(20),
    paddingHorizontal: rs(10),
    paddingVertical: rvs(5),
  },
  carrierBadgeText: {
    color: Colors.primary,
  },
  toggleButton: {
    paddingHorizontal: rs(8),
    paddingVertical: rvs(6),
  },
  toggleOn: {
    color: "#1E9E5A",
  },
  toggleOff: {
    color: Colors.textSecondary,
  },
  empty: {
    textAlign: "center",
    paddingVertical: rvs(20),
  },
  defaultFallbackCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(10),
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Colors.border,
    borderRadius: rs(14),
    padding: rs(14),
  },
  defaultFallbackBadge: {
    backgroundColor: "#E3F2FD",
    borderRadius: rs(20),
    paddingHorizontal: rs(10),
    paddingVertical: rvs(5),
  },
  defaultFallbackBadgeText: {
    color: "#1565C0",
  },
});
