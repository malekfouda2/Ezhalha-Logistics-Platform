// The "Actions" menu on an ops shipment and every sheet it opens. One BottomSheet whose content
// switches, rather than a native modal per action — swapping stacked RN <Modal>s breaks touches.
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { SheetScaffold } from "@/components/sections/operationsHub/sheets/SheetScaffold";
import { openAttentionFlags, statusLabel } from "@/components/sections/operationsHub/opsFormat";
import { UpdateStatusSheet } from "@/components/sections/operationsHub/sheets/UpdateStatusSheet";
import { ExtraChargesSheet } from "@/components/sections/operationsHub/sheets/ExtraChargesSheet";
import { ContactClientSheet } from "@/components/sections/operationsHub/sheets/ContactClientSheet";
import {
  AssignSheet,
  ContactCarrierSheet,
  DangerousGoodsQuoteSheet,
  EscalateSheet,
  TextActionSheet,
} from "@/components/sections/operationsHub/sheets/MiscSheets";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { useOperationMutation } from "@/lib/hooks/useAdminOperations";
import { adminOperationsService, type OperationShipmentDetail } from "@/lib/services/adminOperations";

export type OpsSheet =
  | "actions"
  | "status"
  | "charges"
  | "carrier"
  | "client"
  | "escalate"
  | "resolveSpecial"
  | "resolveAttention"
  | "note"
  | "assign"
  | "dgQuote";

type FeatherName = keyof typeof Feather.glyphMap;

interface ActionItem {
  key: string;
  icon: FeatherName;
  label: string;
  onPress: () => void;
  danger?: boolean;
}

const DANGER = "#B91C1C";
const NOT_CANCELLABLE_STATUSES = ["picked_up", "in_transit", "customs_clearance", "out_for_delivery", "delivered", "cancelled", "returned"];

export function ShipmentActionsSheet({
  shipment,
  sheet,
  onChange,
}: {
  shipment: OperationShipmentDetail;
  sheet: OpsSheet | null;
  onChange: (sheet: OpsSheet | null) => void;
}) {
  const { t } = useTranslation();
  const { hasPermission } = useAdminAccess();
  const close = () => onChange(null);

  const canUpdate = hasPermission("operations", "update");
  const isDdp = shipment.shipmentKind === "DDP";
  const isDg = shipment.shipmentKind === "DANGEROUS_GOODS";
  const hasOpenAttention = openAttentionFlags(shipment).length > 0;
  const specialOpen = shipment.specialHandling?.status === "OPEN";
  const canQuoteDg =
    isDg && shipment.paymentStatus !== "paid" && ["dg_awaiting_carrier", "payment_pending"].includes(shipment.status);
  const warehouseTasksPending = shipment.operationTasks.some(
    (task) => task.stageKey === "warehouse" && task.status === "PENDING",
  );

  const cancelMutation = useOperationMutation(shipment.id, () => adminOperationsService.cancel(shipment.id));

  const confirmCancel = () => {
    close();
    Alert.alert(
      t("adminOperations.cancel.title"),
      t("adminOperations.cancel.message", { tracking: shipment.trackingNumber }),
      [
        { text: t("adminOperations.cancel.keep"), style: "cancel" },
        {
          text: t("adminOperations.cancel.confirm"),
          style: "destructive",
          onPress: async () => {
            try {
              await cancelMutation.mutateAsync(undefined);
              Toast.show({ type: "success", text1: t("adminOperations.cancel.success"), text2: shipment.trackingNumber });
            } catch (error) {
              Toast.show({
                type: "error",
                text1: t("adminOperations.cancel.error"),
                text2: error instanceof Error ? error.message : undefined,
              });
            }
          },
        },
      ],
    );
  };

  const items: (ActionItem | false)[] = [
    canUpdate && { key: "status", icon: "refresh-ccw", label: t("adminOperations.actions.updateStatus"), onPress: () => onChange("status") },
    canUpdate && canQuoteDg && { key: "dgQuote", icon: "alert-triangle", label: t("adminOperations.actions.quoteDg"), onPress: () => onChange("dgQuote") },
    canUpdate && isDdp && { key: "charges", icon: "plus", label: t("adminOperations.actions.extraCharges"), onPress: () => onChange("charges") },
    canUpdate && isDdp && warehouseTasksPending && {
      key: "received",
      icon: "clipboard",
      label: t("adminOperations.actions.receivedCheck"),
      onPress: () => {
        close();
        router.push(`/(protected)/(admin)/operations-hub/received-check/${shipment.id}`);
      },
    },
    !!shipment.carrierContact && { key: "carrier", icon: "phone", label: t("adminOperations.actions.contactCarrier"), onPress: () => onChange("carrier") },
    hasPermission("operations", "message-client") && { key: "client", icon: "mail", label: t("adminOperations.actions.contactClient"), onPress: () => onChange("client") },
    hasPermission("operations", "attention") && hasOpenAttention && {
      key: "resolveAttention",
      icon: "check-circle",
      label: t("adminOperations.actions.resolveAttention"),
      onPress: () => onChange("resolveAttention"),
    },
    hasPermission("operations", "special-handling") &&
      (specialOpen
        ? { key: "resolveSpecial", icon: "check-circle", label: t("adminOperations.actions.markResolved"), onPress: () => onChange("resolveSpecial") }
        : { key: "escalate", icon: "flag", label: t("adminOperations.actions.escalate"), onPress: () => onChange("escalate") }),
    {
      key: "scan",
      icon: "maximize",
      label: t("adminOperations.actions.scan"),
      onPress: () => {
        close();
        router.push("/(protected)/(admin)/operations-hub/scan");
      },
    },
    canUpdate && { key: "note", icon: "file-text", label: t("adminOperations.actions.addNote"), onPress: () => onChange("note") },
    hasPermission("operations", "assign") && { key: "assign", icon: "list", label: t("adminOperations.actions.assign"), onPress: () => onChange("assign") },
    hasPermission("shipments", "cancel") && !NOT_CANCELLABLE_STATUSES.includes(shipment.status) && {
      key: "cancel",
      icon: "x",
      label: t("adminOperations.actions.cancel"),
      onPress: confirmCancel,
      danger: true,
    },
  ];

  const renderContent = () => {
    switch (sheet) {
      case "status":
        return <UpdateStatusSheet shipment={shipment} onDone={close} />;
      case "charges":
        return <ExtraChargesSheet shipment={shipment} onDone={close} />;
      case "carrier":
        return <ContactCarrierSheet shipment={shipment} />;
      case "client":
        return <ContactClientSheet shipment={shipment} onDone={close} />;
      case "escalate":
        return <EscalateSheet shipment={shipment} onDone={close} />;
      case "resolveSpecial":
      case "resolveAttention":
      case "note":
        return <TextActionSheet key={sheet} shipment={shipment} kind={sheet} onDone={close} />;
      case "assign":
        return <AssignSheet shipment={shipment} onDone={close} />;
      case "dgQuote":
        return <DangerousGoodsQuoteSheet shipment={shipment} onDone={close} />;
      case "actions":
        return (
          <SheetScaffold
            title={t("adminOperations.actions.title")}
            subtitle={`${shipment.trackingNumber} · ${statusLabel(shipment.status, t)}`}
          >
            <View style={styles.list}>
              {(items.filter(Boolean) as ActionItem[]).map((item, index) => (
                <Pressable
                  key={item.key}
                  onPress={item.onPress}
                  style={({ pressed }) => [styles.row, index > 0 && styles.rowDivider, pressed && styles.pressed]}
                >
                  <View style={[styles.iconBox, item.danger && styles.iconBoxDanger]}>
                    <Feather name={item.icon} size={rs(18)} color={item.danger ? DANGER : Colors.primary} />
                  </View>
                  <Text size="medium" weight="bold" style={item.danger ? { color: DANGER } : undefined}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </SheetScaffold>
        );
      default:
        return null;
    }
  };

  return (
    <BottomSheet visible={sheet !== null} onClose={close}>
      {renderContent()}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: rvs(12),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(14),
    paddingVertical: rvs(11),
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  pressed: {
    opacity: 0.6,
  },
  iconBox: {
    width: rs(40),
    height: rs(40),
    borderRadius: rs(12),
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBoxDanger: {
    backgroundColor: "#FDE8E8",
  },
});
