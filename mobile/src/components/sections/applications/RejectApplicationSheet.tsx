import { useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";
import type { ClientApplication } from "@shared/schema";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import InfoBox from "@/components/ui/InfoBox";
import { Colors } from "@/constants/colors";
import { rvs } from "@/utils/responsive";
import { useKeyboardHeight } from "@/lib/hooks/useKeyboardHeight";
import { useReviewApplication } from "@/lib/hooks/useAdminApplications";
import { applicationDisplayName } from "@/components/sections/applications/applicationFormat";

const DANGER = "#B91C1C";

interface RejectApplicationSheetProps {
  application: ClientApplication;
  visible: boolean;
  onClose: () => void;
  onRejected: () => void;
}

export function RejectApplicationSheet({ application, visible, onClose, onRejected }: RejectApplicationSheetProps) {
  const { t } = useTranslation();
  const { height: screenHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();
  const sheetMaxHeight = Math.min(screenHeight * 0.8, screenHeight - keyboardHeight - rvs(60));

  const reviewMutation = useReviewApplication();
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();

  const handleClose = () => {
    onClose();
    setReason("");
    setReasonError(undefined);
  };

  const name = applicationDisplayName(application);
  const accountTypeLabel = t(`adminApplicationsScreen.accountType.${application.accountType}`, {
    defaultValue: application.accountType,
  });

  const handleReject = async () => {
    const trimmed = reason.trim();
    // The reason is emailed to the applicant as-is (sendApplicationRejected) — an empty one
    // would send them a rejection with no explanation.
    if (!trimmed) {
      setReasonError(t("adminApplicationsScreen.reject.reasonRequired"));
      return;
    }

    try {
      await reviewMutation.mutateAsync({ id: application.id, data: { action: "reject", notes: trimmed } });
      Toast.show({
        type: "success",
        text1: t("adminApplicationsScreen.reject.successTitle"),
        text2: t("adminApplicationsScreen.reject.successMessage", { name }),
      });
      handleClose();
      onRejected();
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("adminApplicationsScreen.reject.errorTitle"),
        text2: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      <ScrollView
        style={{ maxHeight: sheetMaxHeight }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text size="large" weight="bold">
          {t("adminApplicationsScreen.reject.title")}
        </Text>
        <Text size="small" dimRate="60%" style={styles.subtitle}>
          {name} · {accountTypeLabel}
        </Text>

        <Text size="xs" weight="bold" dimRate="60%" textTransform="uppercase" style={styles.sectionLabel}>
          {t("adminApplicationsScreen.reject.reason")}
        </Text>
        <Input
          placeholder={t("adminApplicationsScreen.reject.reasonPlaceholder")}
          value={reason}
          onChangeText={(value) => {
            setReason(value);
            if (reasonError) setReasonError(undefined);
          }}
          multiline
          textAlignVertical="top"
          error={reasonError}
          style={styles.reasonInput}
        />

        <InfoBox
          text={t("adminApplicationsScreen.reject.notice")}
          iconName="alert-triangle"
          backgroundColor={Colors.amberBackgroundColor}
          borderColor={Colors.amberBorderColor}
          textColor={Colors.amberTextColor}
          iconColor={Colors.amberTextColor}
        />

        <Button
          title={t("adminApplicationsScreen.reject.submit")}
          onPress={handleReject}
          loading={reviewMutation.isPending}
          disabled={reviewMutation.isPending}
          style={styles.submit}
        />
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // Room for the submit button's shadow, which the ScrollView would otherwise clip.
  scrollContent: {
    paddingBottom: rvs(14),
  },
  subtitle: {
    marginTop: rvs(4),
  },
  sectionLabel: {
    marginTop: rvs(18),
    marginBottom: rvs(8),
    letterSpacing: 1,
  },
  reasonInput: {
    height: rvs(100),
    paddingTop: rvs(12),
  },
  submit: {
    marginTop: rvs(16),
    backgroundColor: DANGER,
    shadowColor: DANGER,
  },
});
