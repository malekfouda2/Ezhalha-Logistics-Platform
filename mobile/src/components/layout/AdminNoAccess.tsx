// components/layout/AdminNoAccess.tsx
//
// What a permission-gated admin screen shows instead of its content when the
// signed-in admin doesn't hold the permission it needs.
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

interface AdminNoAccessProps {
  /** The screen's own title, e.g. "Pricing" — used in "Pricing needs …". */
  screenTitle: string;
  /** The permission name the screen requires, e.g. "pricing-rules:read". */
  permission: string;
  /** The signed-in admin's role name, e.g. "Operations Manager". */
  roleName: string;
}

export function AdminNoAccess({ screenTitle, permission, roleName }: AdminNoAccessProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Feather name="lock" size={rs(44)} color={Colors.border} />

      <Text size="large" weight="bold" style={styles.title}>
        {t("admin.noAccessScreen.title")}
      </Text>

      <Text size="small" dimRate="60%" style={styles.description}>
        {t("admin.noAccessScreen.needsPrefix", { screen: screenTitle })}
        <Text size="small" weight="bold" style={styles.emphasis}>
          {permission}
        </Text>
        {t("admin.noAccessScreen.middle")}
        <Text size="small" weight="bold" style={styles.emphasis}>
          {roleName}
        </Text>
        {t("admin.noAccessScreen.suffix")}
      </Text>

      <View style={styles.pill}>
        <Text size="small" weight="semibold" style={styles.pillText}>
          {permission}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: rs(32),
    paddingBottom: rvs(80),
  },
  title: {
    marginTop: rvs(18),
    textAlign: "center",
  },
  description: {
    marginTop: rvs(10),
    textAlign: "center",
    lineHeight: rs(20),
  },
  emphasis: {
    color: Colors.text,
  },
  pill: {
    marginTop: rvs(20),
    backgroundColor: Colors.white,
    borderRadius: rs(10),
    paddingHorizontal: rs(14),
    paddingVertical: rvs(8),
  },
  pillText: {
    color: Colors.textSecondary,
  },
});
