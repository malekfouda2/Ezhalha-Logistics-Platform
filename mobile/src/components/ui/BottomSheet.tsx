// components/ui/BottomSheet.tsx
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

interface SheetHost {
  present: (id: string, node: ReactNode) => void;
  dismiss: (id: string) => void;
}

// Stacking a second native RN <Modal> on top of one that's already open
// (a BottomSheet rendered from inside another BottomSheet's content, e.g. a
// picker opened from within AddItemModal) breaks touch handling once the
// inner one closes. So a BottomSheet rendered inside an already-open one
// registers its content with the outer sheet's host instead of mounting its
// own <Modal> — it renders as a plain overlay inside the same native window.
const SheetHostContext = createContext<SheetHost | null>(null);

export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const parentHost = useContext(SheetHostContext);

  const idRef = useRef<string | null>(null);
  if (idRef.current === null) {
    idRef.current = `sheet-${Math.random().toString(36).slice(2)}`;
  }
  const id = idRef.current;

  const [hostedSheets, setHostedSheets] = useState<Record<string, ReactNode>>({});

  const ownHost = useMemo<SheetHost>(
    () => ({
      present: (sheetId, node) =>
        setHostedSheets((prev) => ({ ...prev, [sheetId]: node })),
      dismiss: (sheetId) =>
        setHostedSheets((prev) => {
          if (!(sheetId in prev)) return prev;
          const next = { ...prev };
          delete next[sheetId];
          return next;
        }),
    }),
    [],
  );

  const sheetUI = (
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
        <SheetHostContext.Provider value={ownHost}>{children}</SheetHostContext.Provider>
      </View>

      {Object.entries(hostedSheets).map(([sheetId, node]) => (
        <View key={sheetId} style={StyleSheet.absoluteFill}>
          {node}
        </View>
      ))}
    </View>
  );

  useEffect(() => {
    if (!parentHost) return;
    if (visible) {
      parentHost.present(id, sheetUI);
    } else {
      parentHost.dismiss(id);
    }
  });

  useEffect(() => {
    return () => parentHost?.dismiss(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentHost]);

  if (parentHost) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {sheetUI}
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
