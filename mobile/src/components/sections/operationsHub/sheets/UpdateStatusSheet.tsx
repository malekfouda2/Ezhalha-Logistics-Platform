import { useState } from "react";
import { StyleSheet, Switch, View } from "react-native";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { FieldLabel, OptionGrid } from "@/components/sections/operationsHub/OpsPrimitives";
import { statusLabel } from "@/components/sections/operationsHub/opsFormat";
import { SheetScaffold } from "@/components/sections/operationsHub/sheets/SheetScaffold";
import { useOperationMutation } from "@/lib/hooks/useAdminOperations";
import { adminOperationsService, type OperationShipmentDetail } from "@/lib/services/adminOperations";

// `cancelled` is deliberately not here: setting it as a plain status skips the carrier cancel and
// the refund request. Cancelling goes through the "Cancel shipment" action instead.
const STATUSES = [
  "processing",
  "in_transit",
  "customs_clearance",
  "out_for_delivery",
  "on_hold",
  "returned",
  "delivered",
  "carrier_error",
];

export function UpdateStatusSheet({ shipment, onDone }: { shipment: OperationShipmentDetail; onDone: () => void }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<string | undefined>();
  const [note, setNote] = useState("");
  const [notifyClient, setNotifyClient] = useState(true);

  const mutation = useOperationMutation(shipment.id, async () => {
    const result = await adminOperationsService.updateStatus(shipment.id, { status: status!, notifyClient });
    const trimmed = note.trim();
    if (!trimmed) return result;
    // The status route has no note field — the internal note is its own INTERNAL-visibility note.
    return adminOperationsService.addNote(shipment.id, { body: trimmed, visibility: "INTERNAL" });
  });

  const handleSubmit = async () => {
    try {
      await mutation.mutateAsync(undefined);
      Toast.show({
        type: "success",
        text1: t("adminOperations.statusSheet.success"),
        text2: `${shipment.trackingNumber} → ${statusLabel(status, t)}`,
      });
      onDone();
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("adminOperations.statusSheet.error"),
        text2: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <SheetScaffold
      title={t("adminOperations.statusSheet.title")}
      subtitle={t("adminOperations.statusSheet.subtitle")}
      submitLabel={t("adminOperations.statusSheet.submit")}
      onSubmit={handleSubmit}
      submitting={mutation.isPending}
      submitDisabled={!status || status === shipment.status}
    >
      <FieldLabel>{t("adminOperations.statusSheet.newStatus")}</FieldLabel>
      <OptionGrid
        options={STATUSES.map((value) => ({ value, label: statusLabel(value, t) }))}
        value={status}
        onChange={setStatus}
      />

      <FieldLabel>{t("adminOperations.statusSheet.note")}</FieldLabel>
      <Input
        placeholder={t("adminOperations.statusSheet.notePlaceholder")}
        value={note}
        onChangeText={setNote}
        multiline
        textAlignVertical="top"
        style={styles.noteInput}
      />

      <View style={styles.toggleCard}>
        <View style={styles.toggleText}>
          <Text size="medium" weight="bold">
            {t("adminOperations.statusSheet.emailClient")}
          </Text>
          <Text size="xs" dimRate="60%" style={styles.toggleHint}>
            {t("adminOperations.statusSheet.emailClientHint")}
          </Text>
        </View>
        <Switch
          value={notifyClient}
          onValueChange={setNotifyClient}
          trackColor={{ false: Colors.border, true: Colors.primary }}
          thumbColor={Colors.white}
        />
      </View>
    </SheetScaffold>
  );
}

const styles = StyleSheet.create({
  noteInput: {
    height: rvs(70),
    paddingTop: rvs(12),
  },
  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    padding: rs(14),
  },
  toggleText: {
    flex: 1,
    marginEnd: rs(10),
  },
  toggleHint: {
    marginTop: rvs(2),
  },
});
