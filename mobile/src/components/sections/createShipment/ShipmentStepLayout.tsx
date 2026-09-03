import { View, StyleSheet } from "react-native";
import ShipmentStepFooter from "./ShipmentStepFooter";
import { ShipmentStepHeader } from "./ShipmentStepHeader";
import { KeyboardAwareScreen } from "@/components/ui/KeyboardAwareScreen";
import { rs, rvs } from "@/utils/responsive";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/colors";
import { ReactNode } from "react";

interface ShipmentStepLayoutProps {
  title: string;
  subtitle: string;
  step: number;
  totalSteps: number;
  children: React.ReactNode;
  onContinue: () => void;
  continueLabel?: ReactNode;
  footerNote?: string;
  onBack?: ()=> void
  loading?: boolean;
}
export function ShipmentStepLayout({
  title,
  subtitle,
  step,
  totalSteps,
  children,
  onContinue,
  continueLabel,
  footerNote,
  onBack,
  loading,
}: ShipmentStepLayoutProps) {
  const router = useRouter();
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };
  return (
    <View style={styles.container}>
      <ShipmentStepHeader
        title={title}
        subtitle={subtitle}
        step={step}
        totalSteps={totalSteps}
        onBack={handleBack}
      />

      <KeyboardAwareScreen
        contentContainerStyle={styles.scrollContent}
        footer={
          <ShipmentStepFooter
            title={continueLabel}
            onPress={onContinue}
            footerNote={footerNote}
            loading={loading}
          />
        }
      >
        {children}
      </KeyboardAwareScreen>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: rs(16),
  },
});
