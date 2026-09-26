// Small presentational pieces shared across the Operations Hub screens.
import { ReactNode } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SaudiRiyal } from "lucide-react-native";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { formatMoney } from "@/utils/invoiceFormat";

/** Tracking numbers / AWBs read better monospaced, as on the web hub. */
export const MONO_FONT = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

export type PillTone = "amber" | "red" | "blue" | "purple" | "gray" | "green" | "orange";

const PILL_COLORS: Record<PillTone, { background: string; text: string }> = {
  amber: { background: "#FEF3C7", text: "#92400E" },
  red: { background: "#FDE8E8", text: "#B91C1C" },
  blue: { background: "#E0ECFF", text: "#1D4ED8" },
  purple: { background: "#F1E6FF", text: "#7E22CE" },
  gray: { background: "#E8ECF1", text: "#475569" },
  green: { background: "#E4F7EA", text: "#1E9E4B" },
  orange: { background: "#FFE9DE", text: Colors.primary },
};

export function Pill({ label, tone }: { label: string; tone: PillTone }) {
  const colors = PILL_COLORS[tone];
  return (
    <View style={[styles.pill, { backgroundColor: colors.background }]}>
      <Text size="xs" weight="bold" style={{ color: colors.text }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Money({
  amount,
  size = "small",
  color,
  decimals = true,
}: {
  amount: number | string | null | undefined;
  size?: "xs" | "small" | "medium" | "large";
  color?: string;
  decimals?: boolean;
}) {
  const n = typeof amount === "string" ? parseFloat(amount) : amount ?? 0;
  const iconSize = size === "large" ? rs(17) : size === "medium" ? rs(15) : rs(13);
  const text = decimals
    ? formatMoney(n)
    : (Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  return (
    <View style={styles.moneyRow}>
      <SaudiRiyal size={iconSize} color={color ?? Colors.text} style={styles.moneyIcon} />
      <Text size={size} weight="bold" style={color ? { color } : undefined}>
        {text}
      </Text>
    </View>
  );
}

export function SectionTitle({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text size="medium" weight="bold">
        {children}
      </Text>
      {right}
    </View>
  );
}

export interface FilterTab<K extends string> {
  key: K;
  label: string;
  count?: number;
}

/** Horizontal scrolling filter chips with counts — same look as the Applications tabs. */
export function FilterTabs<K extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: FilterTab<K>[];
  active: K;
  onChange: (key: K) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tabsScrollView}
      contentContainerStyle={styles.tabsRow}
    >
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={[styles.tabChip, selected && styles.tabChipActive]}
          >
            <Text size="small" weight="semibold" style={{ color: selected ? Colors.white : Colors.text }}>
              {tab.label}
            </Text>
            {tab.count !== undefined && (
              <View style={[styles.tabCount, selected && styles.tabCountActive]}>
                <Text size="xs" weight="bold" style={{ color: selected ? Colors.white : Colors.textSecondary }}>
                  {tab.count}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Label above a form control inside a sheet, e.g. "NEW STATUS". */
export function FieldLabel({ children }: { children: string }) {
  return (
    <Text size="xs" weight="bold" dimRate="60%" textTransform="uppercase" style={styles.fieldLabel}>
      {children}
    </Text>
  );
}

/** Equal-width option buttons laid out in a grid (2 or 3 per row). */
export function OptionGrid<V extends string>({
  options,
  value,
  onChange,
  columns = 2,
}: {
  options: { value: V; label: string }[];
  value: V | undefined;
  onChange: (value: V) => void;
  columns?: 2 | 3;
}) {
  return (
    <View style={styles.optionGrid}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.option,
              { width: columns === 2 ? "48.5%" : "31.5%" },
              selected && styles.optionSelected,
            ]}
          >
            <Text
              size="small"
              weight="bold"
              numberOfLines={1}
              style={{ color: selected ? Colors.primary : Colors.text }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    borderRadius: rs(20),
    paddingHorizontal: rs(10),
    paddingVertical: rvs(4),
  },
  moneyRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  moneyIcon: {
    marginEnd: rs(2),
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: rvs(10),
  },
  tabsScrollView: {
    flexGrow: 0,
    flexShrink: 0,
  },
  tabsRow: {
    gap: rs(8),
    paddingHorizontal: rs(16),
    paddingBottom: rvs(12),
  },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(6),
    paddingHorizontal: rs(14),
    paddingVertical: rvs(8),
    borderRadius: rs(18),
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tabCount: {
    minWidth: rs(22),
    paddingHorizontal: rs(6),
    paddingVertical: rvs(1),
    borderRadius: rs(10),
    backgroundColor: Colors.background,
    alignItems: "center",
  },
  tabCountActive: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  fieldLabel: {
    marginTop: rvs(16),
    marginBottom: rvs(8),
    letterSpacing: 1,
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: rvs(10),
  },
  option: {
    height: rvs(44),
    borderRadius: rs(14),
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: rs(6),
  },
  optionSelected: {
    borderColor: Colors.primary,
    backgroundColor: "#FFF3EC",
  },
});
