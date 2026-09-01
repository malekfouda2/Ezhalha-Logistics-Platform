// components/ui/BottomSheet.tsx
import { ReactNode, useEffect, useState } from "react";
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  Keyboard,
  KeyboardEvent,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import Toast from "react-native-toast-message";
import toastConfig from "./AppToast";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // KeyboardAvoidingView measures its position via onLayout, which is
  // unreliable inside a Modal's separate native layer (and Android gets no
  // avoidance at all with behavior=undefined) — so shift the sheet manually
  // by the real keyboard height instead, which works the same on both
  // platforms regardless of how the Modal's window handles resize.
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) =>
      setKeyboardHeight(e.endCoordinates?.height ?? 0),
    );
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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
