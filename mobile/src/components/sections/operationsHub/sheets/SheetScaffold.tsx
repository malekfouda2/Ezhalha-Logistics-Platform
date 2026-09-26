import { ReactNode } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { rvs } from "@/utils/responsive";
import { useKeyboardHeight } from "@/lib/hooks/useKeyboardHeight";

interface SheetScaffoldProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  submitLabel?: string;
  onSubmit?: () => void;
  submitting?: boolean;
  submitDisabled?: boolean;
  danger?: boolean;
}

const DANGER = "#B91C1C";

/** Title + scrollable body + primary button — the layout every ops sheet shares. */
export function SheetScaffold({
  title,
  subtitle,
  children,
  submitLabel,
  onSubmit,
  submitting,
  submitDisabled,
  danger,
}: SheetScaffoldProps) {
  const { height: screenHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();
  const maxHeight = Math.min(screenHeight * 0.82, screenHeight - keyboardHeight - rvs(60));

  return (
    <ScrollView
      style={{ maxHeight }}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text size="large" weight="bold">
        {title}
      </Text>
      {subtitle ? (
        <Text size="small" dimRate="60%" style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}

      <View>{children}</View>

      {submitLabel && onSubmit ? (
        <Button
          title={submitLabel}
          onPress={onSubmit}
          loading={submitting}
          disabled={submitting || submitDisabled}
          style={danger ? { ...styles.submit, backgroundColor: DANGER, shadowColor: DANGER } : styles.submit}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: rvs(14),
  },
  subtitle: {
    marginTop: rvs(4),
  },
  submit: {
    marginTop: rvs(20),
  },
});
