// app/create-shipment.tsx
import { useRouter } from "expo-router";
import {
  ScrollView,
  View,
  StyleSheet,
  Pressable,
  I18nManager,
} from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import {
  Feather,
  MaterialIcons,
  Fontisto,
  Ionicons,
} from "@expo/vector-icons";

type ShipmentTypeIcon =
  | {
      library: "feather";
      name: keyof typeof Feather.glyphMap;
    }
  | {
      library: "materialIcons";
      name: keyof typeof MaterialIcons.glyphMap;
    }
  | {
      library: "fontisto";
      name: keyof typeof Fontisto.glyphMap;
    }
  | {
      library: "ionicons";
      name: keyof typeof Ionicons.glyphMap;
    };
interface ShipmentType {
  id: string;
  icon: ShipmentTypeIcon;
  iconColor: string;
  iconBg: string;
  route: string;
}
const SHIPMENT_TYPES: ShipmentType[] = [
  {
    id: "express",
    icon: {
      library: "feather",
      name: "hexagon",
    },
    iconColor: Colors.primary,
    iconBg: "#FDE4D6",
    route: "/create-shipment/express",
  },
  {
    id: "freight",
    icon: {
      library: "fontisto",
      name: "world-o",
    },
    iconColor: "#3B6FE0",
    iconBg: "#DCE6FB",
    route: "/create-shipment/freight",
  },
  {
    id: "local",
    icon: {
      library: "ionicons",
      name: "location-outline",
    },
    iconColor: "#1C9E6E",
    iconBg: "#D7F0E3",
    route: "/create-shipment/local",
  },
];

export default function CreateShipmentScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const isRTL = I18nManager.isRTL;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text size="xl" weight="bold">
          {t("createShipment.heading")}
        </Text>
        <Text size="small" dimRate="70%" style={styles.subheading}>
          {t("createShipment.subheading")}
        </Text>

        {SHIPMENT_TYPES.map((item) => (
          <View key={item.id} style={styles.card}>
      <View
  style={[styles.iconWrapper, { backgroundColor: item.iconBg }]}
>
  {item.icon.library === "feather" ? (
    <Feather
      name={item.icon.name}
      size={rs(28)}
      color={item.iconColor}
    />
  ) : item.icon.library === "materialIcons" ? (
    <MaterialIcons
      name={item.icon.name}
      size={rs(28)}
      color={item.iconColor}
    />
  ) : item.icon.library === "fontisto" ? (
    <Fontisto
      name={item.icon.name}
      size={rs(28)}
      color={item.iconColor}
    />
  ) : (
    <Ionicons
      name={item.icon.name}
      size={rs(28)}
      color={item.iconColor}
    />
  )}
</View>

            <Text size="large" weight="bold">
              {t(`createShipment.${item.id}.title`)}
            </Text>

            <Text size="small" dimRate="60%" style={styles.cardDescription}>
              {t(`createShipment.${item.id}.description`)}
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.continueRow,
                pressed && { opacity: 0.6 },
              ]}
              onPress={() => router.push(item.route as any)}
            >
              <Text size="medium" weight="semibold" style={styles.continueText}>
                {t("createShipment.continue")}
              </Text>
              <Feather
                name={isRTL ? "arrow-left" : "arrow-right"}
                size={rs(18)}
                color={Colors.primary}
                style={styles.continueIcon}
              />
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: rs(24),
    paddingTop: rvs(16),
    paddingBottom: rvs(32),
  },
  subheading: {
    marginBottom: rvs(20),
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: rs(24),
    padding: rs(20),
    marginBottom: rvs(15),
  },
  iconWrapper: {
    width: rs(55),
    height: rs(55),
    borderRadius: rs(18),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: rvs(15),
  },
  cardDescription: {
    marginBottom: rvs(16),
  },
  continueRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  continueText: {
    color: Colors.primary,
  },
  continueIcon: {
    marginStart: rs(6),
  },
});
