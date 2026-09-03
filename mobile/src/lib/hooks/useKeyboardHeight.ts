import { useEffect, useState } from "react";
import { Keyboard, KeyboardEvent, Platform } from "react-native";

/**
 * Tracks the live keyboard height.
 *
 * KeyboardAvoidingView measures its position via onLayout, which is
 * unreliable inside a Modal's separate native layer (and Android gets no
 * avoidance at all with behavior=undefined) — so any sheet rendered inside a
 * <Modal> should shift itself by this value instead, which works the same on
 * both platforms regardless of how the Modal's window handles resize.
 */
export function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

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

  return keyboardHeight;
}
