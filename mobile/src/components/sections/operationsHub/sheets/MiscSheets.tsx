// Smaller ops sheets: escalate, free-text (note / resolve), assign, contact carrier, DG quote.
import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { FieldLabel, Money, OptionGrid } from "@/components/sections/operationsHub/OpsPrimitives";
import { SheetScaffold } from "@/components/sections/operationsHub/sheets/SheetScaffold";
import { useOperationMutation, useOperationsUsers } from "@/lib/hooks/useAdminOperations";
import {
  adminOperationsService,
  type DangerousGoodsQuoteResult,
  type OperationShipmentDetail,
} from "@/lib/services/adminOperations";

type SheetProps = { shipment: OperationShipmentDetail; onDone: () => void };

function showError(title: string, error: unknown) {
  Toast.show({ type: "error", text1: title, text2: error instanceof Error ? error.message : undefined });
}

// ── Escalate to Special Handling ─────────────────────────────────────────────

export function EscalateSheet({ shipment, onDone }: SheetProps) {
  const { t } = useTranslation();
  const [priority, setPriority] = useState<"urgent" | "high" | "normal">("high");
  const [reason, setReason] = useState("");
  const mutation = useOperationMutation(shipment.id, () =>
    adminOperationsService.escalate(shipment.id, { priority, reason: reason.trim() }),
  );

  const handleSubmit = async () => {
    try {
      await mutation.mutateAsync(undefined);
      Toast.show({ type: "success", text1: t("adminOperations.escalateSheet.success"), text2: shipment.trackingNumber });
      onDone();
    } catch (error) {
      showError(t("adminOperations.escalateSheet.error"), error);
    }
  };

  return (
    <SheetScaffold
      title={t("adminOperations.escalateSheet.title")}
      subtitle={t("adminOperations.escalateSheet.subtitle")}
      submitLabel={t("adminOperations.escalateSheet.submit")}
      onSubmit={handleSubmit}
      submitting={mutation.isPending}
      submitDisabled={!reason.trim()}
    >
      <FieldLabel>{t("adminOperations.escalateSheet.priority")}</FieldLabel>
      <OptionGrid
        columns={3}
        options={(["urgent", "high", "normal"] as const).map((value) => ({
          value,
          label: t(`adminOperations.priority.${value}`),
        }))}
        value={priority}
        onChange={setPriority}
      />
      <FieldLabel>{t("adminOperations.escalateSheet.reason")}</FieldLabel>
      <Input
        placeholder={t("adminOperations.escalateSheet.reasonPlaceholder")}
        value={reason}
        onChangeText={setReason}
        multiline
        textAlignVertical="top"
        style={styles.textArea}
      />
    </SheetScaffold>
  );
}

// ── Free-text action (add note, resolve attention, resolve special handling) ─

export type TextActionKind = "note" | "resolveAttention" | "resolveSpecial";

export function TextActionSheet({ shipment, kind, onDone }: SheetProps & { kind: TextActionKind }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState<"INTERNAL" | "CLIENT">("INTERNAL");
  const required = kind === "note";

  const mutation = useOperationMutation(shipment.id, () => {
    const value = text.trim() || undefined;
    if (kind === "note") return adminOperationsService.addNote(shipment.id, { body: value!, visibility });
    if (kind === "resolveAttention") return adminOperationsService.resolveAttention(shipment.id, value);
    return adminOperationsService.resolveSpecialHandling(shipment.id, value);
  });

  const handleSubmit = async () => {
    try {
      await mutation.mutateAsync(undefined);
      Toast.show({ type: "success", text1: t(`adminOperations.textSheet.${kind}.success`), text2: shipment.trackingNumber });
      onDone();
    } catch (error) {
      showError(t(`adminOperations.textSheet.${kind}.error`), error);
    }
  };

  return (
    <SheetScaffold
      title={t(`adminOperations.textSheet.${kind}.title`)}
      subtitle={t(`adminOperations.textSheet.${kind}.subtitle`)}
      submitLabel={t(`adminOperations.textSheet.${kind}.submit`)}
      onSubmit={handleSubmit}
      submitting={mutation.isPending}
      submitDisabled={required && !text.trim()}
    >
      {kind === "note" && (
        <>
          <FieldLabel>{t("adminOperations.textSheet.note.visibility")}</FieldLabel>
          <OptionGrid
            options={[
              { value: "INTERNAL" as const, label: t("adminOperations.textSheet.note.internal") },
              { value: "CLIENT" as const, label: t("adminOperations.textSheet.note.client") },
            ]}
            value={visibility}
            onChange={setVisibility}
          />
        </>
      )}
      <FieldLabel>{t(`adminOperations.textSheet.${kind}.label`)}</FieldLabel>
      <Input
        placeholder={t(`adminOperations.textSheet.${kind}.placeholder`)}
        value={text}
        onChangeText={setText}
        multiline
        textAlignVertical="top"
        style={styles.textArea}
      />
    </SheetScaffold>
  );
}

// ── Assign to… ───────────────────────────────────────────────────────────────

export function AssignSheet({ shipment, onDone }: SheetProps) {
  const { t } = useTranslation();
  const { data: users, isLoading } = useOperationsUsers(true);
  const [selected, setSelected] = useState<string[]>(shipment.assignedToUserId ? [shipment.assignedToUserId] : []);
  const candidates = (users ?? []).filter(
    (user) => user.isActive && user.operationProfile?.isActive !== false && user.operationProfile?.canReceiveAssignments !== false,
  );

  const mutation = useOperationMutation(shipment.id, () =>
    adminOperationsService.reassign(shipment.id, { assignedToUserIds: selected }),
  );

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));

  const handleSubmit = async () => {
    try {
      await mutation.mutateAsync(undefined);
      Toast.show({ type: "success", text1: t("adminOperations.assignSheet.success"), text2: shipment.trackingNumber });
      onDone();
    } catch (error) {
      showError(t("adminOperations.assignSheet.error"), error);
    }
  };

  return (
    <SheetScaffold
      title={t("adminOperations.assignSheet.title")}
      subtitle={t("adminOperations.assignSheet.subtitle")}
      submitLabel={t("adminOperations.assignSheet.submit")}
      onSubmit={handleSubmit}
      submitting={mutation.isPending}
      submitDisabled={selected.length === 0}
    >
      <View style={[styles.listCard, { marginTop: rvs(16) }]}>
        {isLoading ? (
          <ActivityIndicator color={Colors.primary} style={styles.loading} />
        ) : candidates.length === 0 ? (
          <Text size="small" dimRate="60%" style={styles.emptyText}>
            {t("adminOperations.assignSheet.empty")}
          </Text>
        ) : (
          candidates.map((user, index) => {
            const checked = selected.includes(user.id);
            return (
              <Pressable
                key={user.id}
                onPress={() => toggle(user.id)}
                style={[styles.listRow, index > 0 && styles.listDivider]}
              >
                <View style={styles.listText}>
                  <Text size="small" weight="bold">
                    {user.username}
                  </Text>
                  <Text size="xs" dimRate="60%">
                    {[user.email, user.operationProfile?.level].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <Ionicons
                  name={checked ? "checkbox" : "square-outline"}
                  size={rs(22)}
                  color={checked ? Colors.primary : Colors.placeholder}
                />
              </Pressable>
            );
          })
        )}
      </View>
    </SheetScaffold>
  );
}

// ── Contact carrier ──────────────────────────────────────────────────────────

export function ContactCarrierSheet({ shipment }: { shipment: OperationShipmentDetail }) {
  const { t } = useTranslation();
  const contact = shipment.carrierContact;
  const whatsapp = contact?.whatsapp?.replace(/[^\d]/g, "");
  const options = [
    contact?.phone && { key: "phone", icon: "phone" as const, label: contact.phone, url: `tel:${contact.phone}` },
    whatsapp && { key: "whatsapp", icon: "message-circle" as const, label: contact!.whatsapp!, url: `https://wa.me/${whatsapp}` },
    contact?.email && {
      key: "email",
      icon: "mail" as const,
      label: contact.email,
      url: `mailto:${contact.email}?subject=${encodeURIComponent(
        `${shipment.carrierTrackingNumber ?? shipment.trackingNumber}`,
      )}`,
    },
  ].filter(Boolean) as { key: string; icon: keyof typeof Feather.glyphMap; label: string; url: string }[];

  return (
    <SheetScaffold
      title={t("adminOperations.carrierSheet.title", { carrier: shipment.carrierName ?? "" })}
      subtitle={[shipment.carrierName, shipment.carrierTrackingNumber].filter(Boolean).join(" · ") || undefined}
    >
      <View style={[styles.listCard, { marginTop: rvs(16) }]}>
        {options.length === 0 ? (
          <Text size="small" dimRate="60%" style={styles.emptyText}>
            {t("adminOperations.carrierSheet.none")}
          </Text>
        ) : (
          options.map((option, index) => (
            <Pressable
              key={option.key}
              onPress={() => Linking.openURL(option.url).catch(() => undefined)}
              style={[styles.listRow, index > 0 && styles.listDivider]}
            >
              <View style={styles.iconBox}>
                <Feather name={option.icon} size={rs(17)} color={Colors.primary} />
              </View>
              <View style={styles.listText}>
                <Text size="xs" dimRate="60%">
                  {t(`adminOperations.carrierSheet.${option.key}`)}
                </Text>
                <Text size="small" weight="bold">
                  {option.label}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </View>
    </SheetScaffold>
  );
}

// ── Dangerous goods quote ────────────────────────────────────────────────────

const DG_CARRIERS = [
  { code: "DHL", name: "DHL Express" },
  { code: "FEDEX", name: "FedEx" },
  { code: "ARAMEX", name: "Aramex" },
];
const VALIDITY_HOURS = ["24", "48", "72", "168"] as const;

export function DangerousGoodsQuoteSheet({ shipment, onDone }: SheetProps) {
  const { t } = useTranslation();
  const [carrier, setCarrier] = useState(
    DG_CARRIERS.find((c) => c.code === shipment.carrierCode?.toUpperCase())?.code ?? "DHL",
  );
  const [cost, setCost] = useState("");
  const [validity, setValidity] = useState<(typeof VALIDITY_HOURS)[number]>("48");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<DangerousGoodsQuoteResult["pricing"] | null>(null);

  const costValue = parseFloat(cost.replace(/,/g, ""));
  const mutation = useOperationMutation(shipment.id, () =>
    adminOperationsService.quoteDangerousGoods(shipment.id, {
      carrierCode: carrier,
      carrierName: DG_CARRIERS.find((c) => c.code === carrier)?.name,
      carrierCostSar: costValue,
      validUntil: new Date(Date.now() + Number(validity) * 3_600_000).toISOString(),
      note: note.trim() || undefined,
    }),
  );

  const handleSubmit = async () => {
    if (result) {
      onDone();
      return;
    }
    try {
      const response = await mutation.mutateAsync(undefined);
      setResult(response.pricing);
      Toast.show({ type: "success", text1: t("adminOperations.dgSheet.success"), text2: shipment.trackingNumber });
    } catch (error) {
      showError(t("adminOperations.dgSheet.error"), error);
    }
  };

  return (
    <SheetScaffold
      title={t("adminOperations.dgSheet.title")}
      subtitle={t("adminOperations.dgSheet.subtitle")}
      submitLabel={result ? t("adminOperations.dgSheet.done") : t("adminOperations.dgSheet.submit")}
      onSubmit={handleSubmit}
      submitting={mutation.isPending}
      submitDisabled={!result && !(costValue > 0)}
    >
      <FieldLabel>{t("adminOperations.dgSheet.carrier")}</FieldLabel>
      <OptionGrid
        columns={3}
        options={DG_CARRIERS.map((c) => ({ value: c.code, label: c.name }))}
        value={carrier}
        onChange={setCarrier}
      />
      <FieldLabel>{t("adminOperations.dgSheet.carrierCost")}</FieldLabel>
      <Input value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="0.00" editable={!result} />
      <FieldLabel>{t("adminOperations.dgSheet.validFor")}</FieldLabel>
      <OptionGrid
        columns={2}
        options={VALIDITY_HOURS.map((value) => ({ value, label: t(`adminOperations.dgSheet.validity.${value}`) }))}
        value={validity}
        onChange={setValidity}
      />
      <FieldLabel>{t("adminOperations.dgSheet.note")}</FieldLabel>
      <Input value={note} onChangeText={setNote} placeholder={t("adminOperations.dgSheet.notePlaceholder")} editable={!result} />
      <Text size="xs" dimRate="55%">
        {t("adminOperations.dgSheet.pricingHint")}
      </Text>

      {result && (
        <View style={styles.summary}>
          <SummaryRow label={t("adminOperations.dgSheet.carrierCostLabel")} amount={result.carrierCostSar} />
          <SummaryRow label={t("adminOperations.dgSheet.margin")} amount={result.marginAmount} />
          <SummaryRow label={t("adminOperations.dgSheet.vat")} amount={result.vatAmountSar} />
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text size="medium" weight="bold">
              {t("adminOperations.dgSheet.clientTotal")}
            </Text>
            <Money amount={result.clientTotalSar} size="large" color={Colors.primary} />
          </View>
        </View>
      )}
    </SheetScaffold>
  );
}

function SummaryRow({ label, amount }: { label: string; amount: number }) {
  return (
    <View style={styles.summaryRow}>
      <Text size="small" dimRate="60%">
        {label}
      </Text>
      <Money amount={amount} />
    </View>
  );
}

const styles = StyleSheet.create({
  textArea: {
    height: rvs(100),
    paddingTop: rvs(12),
  },
  listCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
    paddingVertical: rvs(12),
  },
  listDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  listText: {
    flex: 1,
  },
  iconBox: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(10),
    backgroundColor: "#FFF1E8",
    alignItems: "center",
    justifyContent: "center",
  },
  loading: {
    paddingVertical: rvs(20),
  },
  emptyText: {
    paddingVertical: rvs(16),
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
});
