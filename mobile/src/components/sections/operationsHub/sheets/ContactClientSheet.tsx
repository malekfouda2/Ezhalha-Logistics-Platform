import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { FieldLabel, OptionGrid } from "@/components/sections/operationsHub/OpsPrimitives";
import { SheetScaffold } from "@/components/sections/operationsHub/sheets/SheetScaffold";
import { useOperationMutation } from "@/lib/hooks/useAdminOperations";
import {
  adminOperationsService,
  type ClientMessageChannel,
  type OperationShipmentDetail,
} from "@/lib/services/adminOperations";

type TemplateKey = "payment" | "delay" | "customs" | "delivery" | "update" | "custom";

const TEMPLATES: { key: TemplateKey; icon: keyof typeof Feather.glyphMap }[] = [
  { key: "payment", icon: "credit-card" },
  { key: "delay", icon: "clock" },
  { key: "customs", icon: "file-text" },
  { key: "delivery", icon: "truck" },
  { key: "update", icon: "mail" },
  { key: "custom", icon: "edit-3" },
];

export function ContactClientSheet({
  shipment,
  initialTemplate = "delay",
  onDone,
}: {
  shipment: OperationShipmentDetail;
  initialTemplate?: TemplateKey;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [channel, setChannel] = useState<ClientMessageChannel>("email");
  const [template, setTemplate] = useState<TemplateKey>(initialTemplate);
  const [message, setMessage] = useState("");

  // Same wording as the web hub's templates — the server stores and sends whatever text we give it.
  useEffect(() => {
    const name = shipment.recipient.name?.split(" ")[0] || shipment.clientName;
    setMessage(
      template === "custom"
        ? ""
        : t(`adminOperations.contactSheet.messages.${template}`, { name, tracking: shipment.trackingNumber }),
    );
  }, [template, shipment.id, shipment.recipient.name, shipment.clientName, shipment.trackingNumber, t]);

  const mutation = useOperationMutation(shipment.id, () =>
    adminOperationsService.messageClient(shipment.id, { message: message.trim(), template, channel }),
  );

  const handleSend = async () => {
    try {
      const result = await mutation.mutateAsync(undefined);
      // WhatsApp isn't wired server-side yet — the message is still logged on the shipment and
      // the client gets it in-app, so say that rather than claiming it was delivered.
      Toast.show({
        type: result.deliveryStatus === "sent" ? "success" : "info",
        text1:
          result.deliveryStatus === "sent"
            ? t("adminOperations.contactSheet.sent")
            : t("adminOperations.contactSheet.logged"),
        text2: result.deliveryMessage,
      });
      onDone();
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("adminOperations.contactSheet.error"),
        text2: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <SheetScaffold
      title={t("adminOperations.contactSheet.title")}
      subtitle={t("adminOperations.contactSheet.subtitle")}
      submitLabel={t("adminOperations.contactSheet.send")}
      onSubmit={handleSend}
      submitting={mutation.isPending}
      submitDisabled={!message.trim()}
    >
      <FieldLabel>{t("adminOperations.contactSheet.channel")}</FieldLabel>
      <OptionGrid
        options={[
          { value: "email" as const, label: t("adminOperations.contactSheet.channels.email") },
          { value: "whatsapp" as const, label: t("adminOperations.contactSheet.channels.whatsapp") },
        ]}
        value={channel}
        onChange={setChannel}
      />

      <FieldLabel>{t("adminOperations.contactSheet.message")}</FieldLabel>
      <View style={styles.templateCard}>
        {TEMPLATES.map((item, index) => {
          const selected = item.key === template;
          return (
            <Pressable
              key={item.key}
              onPress={() => setTemplate(item.key)}
              style={[styles.templateRow, index > 0 && styles.templateDivider]}
            >
              <View style={[styles.templateIcon, selected && styles.templateIconSelected]}>
                <Feather name={item.icon} size={rs(17)} color={selected ? Colors.primary : Colors.textSecondary} />
              </View>
              <View style={styles.templateText}>
                <Text size="small" weight="bold">
                  {t(`adminOperations.contactSheet.templates.${item.key}.title`)}
                </Text>
                <Text size="xs" dimRate="60%">
                  {t(`adminOperations.contactSheet.templates.${item.key}.subtitle`)}
                </Text>
              </View>
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Input
        placeholder={t("adminOperations.contactSheet.messagePlaceholder")}
        value={message}
        onChangeText={setMessage}
        multiline
        textAlignVertical="top"
        style={styles.messageInput}
      />
    </SheetScaffold>
  );
}

const styles = StyleSheet.create({
  templateCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(12),
    marginBottom: rvs(12),
  },
  templateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
    paddingVertical: rvs(11),
  },
  templateDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  templateIcon: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(10),
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  templateIconSelected: {
    backgroundColor: "#FFE9DE",
  },
  templateText: {
    flex: 1,
  },
  radio: {
    width: rs(22),
    height: rs(22),
    borderRadius: rs(11),
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: Colors.primary,
  },
  radioDot: {
    width: rs(11),
    height: rs(11),
    borderRadius: rs(6),
    backgroundColor: Colors.primary,
  },
  messageInput: {
    height: rvs(110),
    paddingTop: rvs(12),
  },
});
