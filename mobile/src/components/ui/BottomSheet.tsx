// components/ui/BottomSheet.tsx
import { ReactNode } from "react";
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, rvs(20)) + rvs(10) },
            ]}
          >
            <View style={styles.handle} />
            {children}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(26, 26, 46, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: rs(24),
    borderTopRightRadius: rs(24),
    paddingHorizontal: rs(20),
    paddingTop: rvs(10),
  },
  handle: {
    alignSelf: "center",
    width: rs(40),
    height: rvs(4),
    borderRadius: rs(2),
    backgroundColor: Colors.border,
    marginBottom: rvs(18),
  },
});