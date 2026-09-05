// components/ui/GeoSuggestInput.tsx

import { useEffect, useRef, useState } from "react";
import {
  View,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TextInputProps,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { api } from "@/api/client";
import { useKeyboardHeight } from "@/lib/hooks/useKeyboardHeight";

export interface GeoSuggestion {
  city: string;
  postalCode: string;
  state: string;
}

interface GeoSuggestInputProps
  extends Omit<TextInputProps, "value" | "onChangeText"> {
  mode: "city" | "postal";
  country: string;
  value: string;
  onChangeText: (value: string) => void;
  onPick: (suggestion: GeoSuggestion) => void;
  error?: string;
}

const MIN_DROPDOWN_HEIGHT = rvs(90);
const MAX_DROPDOWN_HEIGHT = rvs(220);
const DROPDOWN_GAP = rvs(4);
const DROPDOWN_MARGIN = rvs(8);

/**
 * Text input with city<->postal suggestions from GeoNames (via /api/geo/postal-suggest).
 * Mirrors client/src/components/geo-suggest-input.tsx for the mobile app.
 * mode="city": type a city, suggestions show matching city + postal; pick fills both.
 * mode="postal": type a postal code, suggestions show matching postal + city; pick fills both.
 * Degrades to a plain input when the provider isn't configured or returns nothing.
 *
 * The suggestion list renders as a plain absolutely-positioned sibling of the input, not a
 * <Modal> — a Modal opens in its own native layer and steals first responder on iOS, which
 * blurs the input and dismisses the keyboard the moment the list appears. It measures the
 * space free above and below the input (via measureInWindow, useKeyboardHeight and safe-area
 * insets) and opens on whichever side has more room, sized to fit that side — so it never
 * extends into the keyboard, which would otherwise swallow taps on rows hidden behind it.
 */
export function GeoSuggestInput({
  mode,
  country,
  value,
  onChangeText,
  onPick,
  error,
  onFocus,
  onBlur,
  ...rest
}: GeoSuggestInputProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GeoSuggestion[]>([]);
  const [containerRect, setContainerRect] = useState<{ top: number; bottom: number } | null>(null);
  const containerRef = useRef<View>(null);
  // Only auto-open the dropdown when the user is actually typing in THIS field. Picking a
  // city programmatically fills the sibling postal field's value, which would otherwise pop
  // that field's suggestion list open and force a second pick.
  const focusedRef = useRef(false);
  const justPicked = useRef(false);

  const { height: windowHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const cc = (country || "").trim().toUpperCase();
    const q = (value || "").trim();

    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    if (cc.length !== 2 || q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const param = mode === "postal" ? "postal" : "city";
        const data = await api.get<{ results?: GeoSuggestion[] }>(
          `/api/geo/postal-suggest?country=${encodeURIComponent(cc)}&${param}=${encodeURIComponent(q)}`,
        );
        if (cancelled) return;
        const list = Array.isArray(data?.results) ? data.results : [];
        setResults(list);
        setOpen(list.length > 0 && focusedRef.current);
      } catch {
        if (!cancelled) {
          setResults([]);
          setOpen(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, country, mode]);

  // Re-measure once the dropdown is about to show, and again whenever the keyboard's height
  // settles — that's when any keyboard-avoiding layout shift has finished, so this reads the
  // input's final on-screen position rather than a mid-animation one.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      containerRef.current?.measureInWindow((_x, y, _width, height) => {
        setContainerRect({ top: y, bottom: y + height });
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [open, keyboardHeight]);

  const pick = (s: GeoSuggestion) => {
    justPicked.current = true;
    onPick(s);
    setOpen(false);
    setResults([]);
  };

  const visibleBottom = windowHeight - keyboardHeight;
  const spaceBelow = containerRect
    ? visibleBottom - containerRect.bottom - DROPDOWN_MARGIN
    : MAX_DROPDOWN_HEIGHT;
  const spaceAbove = containerRect
    ? containerRect.top - insets.top - DROPDOWN_MARGIN
    : 0;
  const openUpward = spaceAbove > spaceBelow;
  const dropdownMaxHeight = Math.max(
    MIN_DROPDOWN_HEIGHT,
    Math.min(MAX_DROPDOWN_HEIGHT, openUpward ? spaceAbove : spaceBelow),
  );

  return (
    <View ref={containerRef} style={styles.container}>
      <Input
        {...rest}
        value={value}
        onChangeText={onChangeText}
        error={error}
        autoCorrect={false}
        onFocus={(e) => {
          focusedRef.current = true;
          if (results.length > 0) setOpen(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          focusedRef.current = false;
          // Delay the close so a tap on a suggestion registers before the list unmounts.
          setTimeout(() => setOpen(false), 150);
          onBlur?.(e);
        }}
        rightElement={
          loading ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : undefined
        }
      />

      {open && results.length > 0 && containerRect && (
        <View
          style={[
            styles.dropdown,
            openUpward
              ? { bottom: containerRect.bottom - containerRect.top + DROPDOWN_GAP }
              : { top: containerRect.bottom - containerRect.top + DROPDOWN_GAP },
            { maxHeight: dropdownMaxHeight },
          ]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {results.map((s, i) => (
              <Pressable
                key={`${s.city}-${s.postalCode}-${i}`}
                onPress={() => pick(s)}
                style={({ pressed }) => [
                  styles.option,
                  pressed && styles.optionPressed,
                ]}
              >
                <Ionicons
                  name="location-outline"
                  size={rs(14)}
                  color={Colors.textSecondary}
                  style={styles.optionIcon}
                />
                <Text size="small" numberOfLines={1} style={styles.optionText}>
                  {mode === "postal" ? (
                    <>
                      <Text size="small" weight="semibold">
                        {s.postalCode}
                      </Text>
                      {" — "}
                      {s.city}
                    </>
                  ) : (
                    <>
                      <Text size="small" weight="semibold">
                        {s.city}
                      </Text>
                      {" — "}
                      {s.postalCode}
                    </>
                  )}
                  {s.state ? `, ${s.state}` : ""}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    zIndex: 20,
  },
  dropdown: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 30,
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: rs(4),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: rs(12),
    paddingVertical: rvs(10),
  },
  optionPressed: {
    backgroundColor: Colors.background,
  },
  optionIcon: {
    marginEnd: rs(8),
  },
  optionText: {
    flex: 1,
    color: Colors.text,
  },
});
