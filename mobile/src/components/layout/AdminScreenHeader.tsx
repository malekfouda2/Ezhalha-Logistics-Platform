// components/layout/AdminScreenHeader.tsx
//
// The small top bar shared by the admin tab screens that aren't the dashboard
// (Ops, Shipments, Finance): a hamburger into the same AdminDrawer, a title,
// and an optional right-side accessory.
import { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

interface AdminScreenHeaderProps {
  title: string;
  /** e.g. the permission a screen needs, shown under the title when it can't be reached. */
  subtitle?: string;
  onMenuPress: () => void;
  right?: ReactNode;
}

export function AdminScreenHeader({ title, subtitle, onMenuPress, right }: AdminScreenHeaderProps) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.iconButton} onPress={onMenuPress} hitSlop={rs(8)}>
        <Ionicons name="menu" size={rs(20)} color={Colors.text} />
      </Pressable>

      <View style={styles.titleBlock}>
        <Text size="large" weight="bold">
          {title}
        </Text>
        {subtitle ? (
          <Text size="xs" dimRate="55%" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: rs(16),
    paddingTop: rvs(16),
    paddingBottom: rvs(12),
  },
  iconButton: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(12),
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: {
    flex: 1,
    marginStart: rs(12),
  },
});
