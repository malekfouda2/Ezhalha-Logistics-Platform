// components/layout/AdminEmptyState.tsx
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

interface AdminEmptyStateProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description?: string;
}

export function AdminEmptyState({ icon, title, description }: AdminEmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Feather name={icon} size={rs(26)} color={Colors.textSecondary} />
      </View>
      <Text size="medium" weight="bold" style={styles.title}>
        {title}
      </Text>
      {description && (
        <Text size="small" dimRate="55%" style={styles.description}>
          {description}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: rvs(320),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: rs(32),
  },
  iconCircle: {
    width: rs(56),
    height: rs(56),
    borderRadius: rs(18),
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: rvs(14),
  },
  title: {
    textAlign: "center",
  },
  description: {
    marginTop: rvs(6),
    textAlign: "center",
  },
});
