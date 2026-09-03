// components/ui/BottomSheet.tsx
import { ReactNode } from "react";
import { Modal, View, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import Toast from "react-native-toast-message";
import toastConfig from "./AppToast";
import { useKeyboardHeight } from "@/lib/hooks/useKeyboardHeight";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();

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

        <View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, rvs(20)) + rvs(10),
              marginBottom: keyboardHeight,
            },
          ]}
        >
          <View style={styles.handle} />
          {children}
        </View>
      </View>
      <Toast config={toastConfig} />
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
