import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { Feather } from "@expo/vector-icons";
import { Text } from "@/components/ui/Text";
import { View, StyleSheet } from "react-native";
import { SaudiRiyal } from "lucide-react-native";

type StatCardProps = {
  title: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
  subtitle?: string;
  subtitleColor?: string;
  valuePrefix?: boolean;
};

export const StatCard = ({
  title,
  value,
  icon,
  subtitle,
  subtitleColor,
  valuePrefix,
}: StatCardProps) => {
  return (
    <View style={styles.statCard}>
      <View style={styles.statHeader}>
        <Text
          size="small"
          weight="medium"
          style={styles.statTitle}
          numberOfLines={1}
        >
          {title}
        </Text>

        <View style={styles.statIconContainer}>
          <Feather name={icon} size={rs(18)} color={Colors.primary} />
        </View>
      </View>

      <View style={styles.valueRow}>
        {valuePrefix && (
          <SaudiRiyal size={rs(14)} color={Colors.primary} style={styles.currencyIcon} />
        )}

        <Text size="large" weight="bold" style={styles.statValue}>
          {value}
        </Text>
      </View>

      {subtitle && (
        <Text
          size="xs"
          weight="semibold"
          numberOfLines={1}
          style={{
            color: subtitleColor ?? Colors.secondary,
            marginTop: rvs(3),
          }}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  statCard: {
    width: "48.2%",
    minHeight: rvs(100),
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(10),
    paddingVertical: rvs(9),
    marginBottom: rvs(10),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.035,
    shadowRadius: 6,
    elevation: 1,
  },
  statHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statTitle: {
    color: "#667994",
    flex: 1,
  },
  statIconContainer: {
    width: rs(26),
    height: rs(26),
    borderRadius: rs(9),
    backgroundColor: "#FFF0E9",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: rs(4),
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: rvs(4),
  },
  statValue: {
    color: Colors.text,
  },
  currencyIcon: {
    marginRight: rs(3),
  },
});