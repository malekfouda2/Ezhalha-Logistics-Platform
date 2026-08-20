// components/ui/KeyboardAwareScreen.tsx
import { ReactNode } from "react";
import {
  SafeAreaView,
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
}

export const KeyboardAwareScreen = ({
  children,
  contentContainerStyle,
  scrollViewProps,
  backgroundColor = Colors.background,
  keyboardVerticalOffset = 0,
}: KeyboardAwareScreenProps) => {
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 40 : keyboardVerticalOffset}
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});