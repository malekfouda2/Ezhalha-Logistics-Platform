import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { FieldLabel, Money, OptionGrid } from "@/components/sections/operationsHub/OpsPrimitives";
import { SheetScaffold } from "@/components/sections/operationsHub/sheets/SheetScaffold";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useOperationMutation } from "@/lib/hooks/useAdminOperations";
import { adminOperationsService, type OperationShipmentDetail } from "@/lib/services/adminOperations";

type ChargeType = "weight" | "cost" | "combined";

function parseAmount(value: string): number {
  const n = parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Door-to-door (ddp_manual) only — the charge routes 400 for every other fulfilment type.
 * Extra weight re-bills the measured quantity at the lane rate (server-priced, previewed live);
 * extra cost raises a custom DDP adjustment invoice. An optional carrier cost is recorded as a
 * shipment expense so the margin side is captured too.
 */
export function ExtraChargesSheet({ shipment, onDone }: { shipment: OperationShipmentDetail; onDone: () => void }) {
  const { t } = useTranslation();
  const config = shipment.ddpChargeConfig;
  const unit = config?.billingUnit ?? "KG";

  const [type, setType] = useState<ChargeType>("weight");
  const [measured, setMeasured] = useState(config?.currentMeasuredQuantity ? String(Number(config.currentMeasuredQuantity)) : "");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [carrierCost, setCarrierCost] = useState("");

  const withWeight = type === "weight" || type === "combined";
  const withCost = type === "cost" || type === "combined";

  const debouncedMeasured = useDebouncedValue(measured, 400);
  const targetQuantity = parseAmount(debouncedMeasured);
  const preview = useQuery({
    queryKey: ["/api/operations", "extra-weight-preview", shipment.id, targetQuantity],
    queryFn: () => adminOperationsService.previewExtraWeight(shipment.id, targetQuantity),
    enabled: withWeight && Number.isFinite(targetQuantity) && targetQuantity >= 0,
    retry: false,
  });

  const weightDelta = withWeight && preview.data ? Math.max(0, preview.data.deltaAmountSar) : 0;
  const customAmount = withCost ? parseAmount(amount) || 0 : 0;
  const cost = parseAmount(carrierCost) || 0;
  const clientCharge = weightDelta + customAmount;

  const mutation = useOperationMutation(shipment.id, async () => {
    let result: { detail: OperationShipmentDetail } | undefined;
    const notes = description.trim() || undefined;
    if (withWeight) {
      result = await adminOperationsService.addExtraWeight(shipment.id, {
        targetMeasuredQuantity: parseAmount(measured),
        notes,
      });
    }
    if (withCost) {
      result = await adminOperationsService.addCustomCharge(shipment.id, {
        description: description.trim(),
        amount: customAmount,
      });
    }
    if (cost > 0) {
      result = await adminOperationsService.addExpense(shipment.id, {
        description: description.trim() || t("adminOperations.chargesSheet.carrierCostDefault"),
        amountSar: cost,
      });
    }
    return result;
  });

  const validationError = (() => {
    if (withWeight) {
      const q = parseAmount(measured);
      if (!Number.isFinite(q) || q < 0) return t("adminOperations.chargesSheet.errors.quantity");
    }
    if (withCost) {
      if (description.trim().length < 3) return t("adminOperations.chargesSheet.errors.description");
      if (!(customAmount > 0)) return t("adminOperations.chargesSheet.errors.amount");
    }
    return undefined;
  })();

  const handleSubmit = async () => {
    if (validationError) {
      Toast.show({ type: "error", text1: validationError });
      return;
    }
    try {
      await mutation.mutateAsync(undefined);
      Toast.show({ type: "success", text1: t("adminOperations.chargesSheet.success"), text2: shipment.trackingNumber });
      onDone();
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("adminOperations.chargesSheet.error"),
        text2: error instanceof Error ? error.message : undefined,
      });
    }
  };

  if (!config) {
    return (
      <SheetScaffold title={t("adminOperations.chargesSheet.title")}>
        <Text size="small" dimRate="60%" style={styles.unavailable}>
          {t("adminOperations.chargesSheet.unavailable")}
        </Text>
      </SheetScaffold>
    );
  }

  return (
    <SheetScaffold
      title={t("adminOperations.chargesSheet.title")}
      subtitle={t("adminOperations.chargesSheet.subtitle")}
      submitLabel={t("adminOperations.chargesSheet.submit")}
      onSubmit={handleSubmit}
      submitting={mutation.isPending}
    >
      <FieldLabel>{t("adminOperations.chargesSheet.type")}</FieldLabel>
      <OptionGrid
        columns={3}
        options={[
          { value: "weight" as const, label: t("adminOperations.chargesSheet.types.weight") },
          { value: "cost" as const, label: t("adminOperations.chargesSheet.types.cost") },
          { value: "combined" as const, label: t("adminOperations.chargesSheet.types.combined") },
        ]}
        value={type}
        onChange={setType}
      />

      <FieldLabel>{t("adminOperations.chargesSheet.description")}</FieldLabel>
      <Input
        placeholder={t("adminOperations.chargesSheet.descriptionPlaceholder")}
        value={description}
        onChangeText={setDescription}
      />

      {withWeight && (
        <>
          <FieldLabel>{t("adminOperations.chargesSheet.measured", { unit })}</FieldLabel>
          <Input value={measured} onChangeText={setMeasured} keyboardType="decimal-pad" placeholder="0.00" />
          <Text size="xs" dimRate="55%" style={styles.hint}>
            {t("adminOperations.chargesSheet.measuredHint", {
              current: Number(config.currentMeasuredQuantity),
              unit,
              rate: Number(config.currentRatePerUnitSar).toFixed(2),
            })}
          </Text>
        </>
      )}

      {withCost && (
        <>
          <FieldLabel>{t("adminOperations.chargesSheet.clientSees")}</FieldLabel>
          <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={t("adminOperations.chargesSheet.amount")} />
        </>
      )}

      <FieldLabel>{t("adminOperations.chargesSheet.carrierCost")}</FieldLabel>
      <Input value={carrierCost} onChangeText={setCarrierCost} keyboardType="decimal-pad" placeholder={t("adminOperations.chargesSheet.costAmount")} />

      <View style={styles.summary}>
        {withWeight && (
          <View style={styles.summaryRow}>
            <Text size="small" dimRate="60%">
              {t("adminOperations.chargesSheet.weightCharge")}
            </Text>
            {preview.isFetching ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : preview.isError ? (
              <Text size="xs" style={styles.errorText}>
                {preview.error instanceof Error ? preview.error.message : "—"}
              </Text>
            ) : (
              <Money amount={weightDelta} />
            )}
          </View>
        )}
        {withCost && (
          <View style={styles.summaryRow}>
            <Text size="small" dimRate="60%">
              {t("adminOperations.chargesSheet.customCharge")}
            </Text>
            <Money amount={customAmount} />
          </View>
        )}
        <View style={styles.summaryRow}>
          <Text size="small" dimRate="60%">
            {t("adminOperations.chargesSheet.margin")}
          </Text>
          <Money amount={clientCharge - cost} />
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text size="medium" weight="bold">
            {t("adminOperations.chargesSheet.clientPays")}
          </Text>
          <Money amount={clientCharge} size="large" color={Colors.primary} />
        </View>
        <Text size="xs" dimRate="50%">
          {t("adminOperations.chargesSheet.taxNote")}
        </Text>
      </View>
    </SheetScaffold>
  );
}

const styles = StyleSheet.create({
  unavailable: {
    marginTop: rvs(12),
    lineHeight: rvs(18),
  },
  hint: {
    marginTop: rvs(-8),
  },
  summary: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    padding: rs(14),
    marginTop: rvs(16),
    gap: rvs(8),
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  errorText: {
    color: "#B91C1C",
    flexShrink: 1,
    textAlign: "right",
  },
});
