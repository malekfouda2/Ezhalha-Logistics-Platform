// components/sections/invoices/RequestCreditAccessSheet.tsx
import { useState } from "react";
import { StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { rvs } from "@/utils/responsive";
import { requestCreditAccess } from "@/lib/services/invoices";

interface RequestCreditAccessSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function RequestCreditAccessSheet({ visible, onClose }: RequestCreditAccessSheetProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: () => requestCreditAccess(reason.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/credit-access"] });
      Toast.show({
        type: "success",
        text1: t("invoices.requestCreditAccess.successTitle"),
        text2: t("invoices.requestCreditAccess.successMessage"),
      });
      setReason("");
      onClose();
    },
    onError: (error: Error) => {
      Toast.show({
        type: "error",
        text1: t("invoices.requestCreditAccess.errorTitle"),
        text2: error.message,
      });
    },
  });

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text size="xl" weight="bold" style={styles.title}>
        {t("invoices.requestCreditAccess.title")}
      </Text>

      <Text size="small" dimRate="65%" style={styles.description}>
        {t("invoices.requestCreditAccess.description")}
      </Text>

      <Text size="xs" weight="semibold" dimRate="55%" textTransform="uppercase" style={styles.label}>
        {t("invoices.requestCreditAccess.reasonLabel")}
      </Text>

      <Input
        placeholder={t("invoices.requestCreditAccess.reasonPlaceholder")}
        value={reason}
        onChangeText={setReason}
        multiline
        numberOfLines={4}
        style={styles.textArea}
      />

      <Button
        title={t("invoices.requestCreditAccess.send")}
        onPress={() => mutation.mutate()}
        loading={mutation.isPending}
        style={styles.sendButton}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: rvs(8),
  },
  description: {
    marginBottom: rvs(20),
    lineHeight: rvs(20),
  },
  label: {
    marginBottom: rvs(10),
    letterSpacing: 0.5,
  },
  textArea: {
    height: rvs(110),
    paddingTop: rvs(14),
    textAlignVertical: "top",
  },
  sendButton: {
    marginTop: rvs(4),
  },
});
