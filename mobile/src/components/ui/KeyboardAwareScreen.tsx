// components/ui/KeyboardAwareScreen.tsx
import { ReactNode } from "react";
import {
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ScrollViewProps,
  ViewStyle,
} from "react-native";
import { Colors } from "@/constants/colors";
export interface KeyboardAwareScreenProps {
  children: ReactNode;
  contentContainerStyle?: ViewStyle;
  scrollViewProps?: Partial<ScrollViewProps>;
  backgroundColor?: string;
  keyboardVerticalOffset?: number;
  footer?: ReactNode;
}

export const KeyboardAwareScreen = ({
  children,
  contentContainerStyle,
  scrollViewProps,
  keyboardVerticalOffset = 20,
  footer,
}: KeyboardAwareScreenProps) => {
  return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : keyboardVerticalOffset}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          {...scrollViewProps}
        >
          {children}
        </ScrollView>
        {footer}
      </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});