// app/create-shipment.tsx
import { useCallback } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import {
  View,
  StyleSheet,
  Pressable,
  I18nManager,
} from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { RefreshableScreen } from "@/components/ui/RefreshableScreen";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { Feather, MaterialIcons, Fontisto, Ionicons } from "@expo/vector-icons";
import { useDangerousGoodsAccessStatus } from "@/lib/hooks/useDangerousGoodsAccessGate";

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
    route: "/createShipment/express",
  },
  {
    id: "freight",
    icon: {
      library: "fontisto",
      name: "world-o",
    },
    iconColor: "#3B6FE0",
    iconBg: "#DCE6FB",
    route: "/createShipment/doorToDoor",
  },
  {
    id: "local",
    icon: {
      library: "ionicons",
      name: "location-outline",
    },
    iconColor: "#1C9E6E",
    iconBg: "#D7F0E3",
    route: "/createShipment/local",
  },
  {
    id: "dangerousGoods",
    icon: {
      library: "ionicons",
      name: "warning-outline",
    },
    iconColor: "#B8760A",
    iconBg: "#FDF0D8",
    route: "/createShipment/dangerousGoods",
  },
];

export default function CreateShipmentScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const isRTL = I18nManager.isRTL;

  const { data: dangerousGoodsAccess, refetch: refetchDangerousGoodsAccess } =
    useDangerousGoodsAccessStatus();
  const dangerousGoodsLocked = !(dangerousGoodsAccess?.enabled ?? false);
  const dangerousGoodsPending = dangerousGoodsAccess?.request?.status === "pending";

  // Approval can land while the client is elsewhere in the app (this tab stays mounted, so
  // the query alone wouldn't refetch just from switching back to it) — re-check every time
  // this screen gains focus so a freshly-approved account doesn't still show "locked".
  useFocusEffect(
    useCallback(() => {
      refetchDangerousGoodsAccess();
    }, [refetchDangerousGoodsAccess]),
  );

  return (
    <View style={styles.screen}>
      <RefreshableScreen contentContainerStyle={styles.scrollContent}>
        <Text size="xl" weight="bold">
          {t("createShipment.heading")}
        </Text>
        <Text size="small" dimRate="70%" style={styles.subheading}>
          {t("createShipment.subheading")}
        </Text>

        {SHIPMENT_TYPES.map((item) => {
          // Dangerous goods is gated per account — the tile stays visible so a client can
          // discover and request the service, but its footer swaps to a lock state until an
          // admin approves. Tapping still navigates through either way: the wizard's own
          // index route shows the request screen when locked. Mirrors the web chooser
          // (client/src/pages/client/create-shipment-select.tsx).
          const locked = item.id === "dangerousGoods" && dangerousGoodsLocked;

          return (
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

              <Text size="medium" weight="bold">
                {t(`createShipment.${item.id}.title`)}
              </Text>

              <Text size="xs" dimRate="60%" style={styles.cardDescription}>
                {t(`createShipment.${item.id}.description`)}
              </Text>

              <Pressable
                style={({ pressed }) => [
                  styles.continueRow,
                  pressed && { opacity: 0.6 },
                ]}
                onPress={() => router.push(item.route as any)}
              >
                {locked ? (
                  <>
                    <Feather
                      name="lock"
                      size={rs(16)}
                      color={Colors.primary}
                      style={styles.lockIcon}
                    />
                    <Text size="medium" weight="semibold" style={styles.continueText}>
                      {dangerousGoodsPending
                        ? t("createShipment.dangerousGoods.tile.pending")
                        : t("createShipment.dangerousGoods.tile.requestAccess")}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text size="medium" weight="semibold" style={styles.continueText}>
                      {t("createShipment.continue")}
                    </Text>
                    <Feather
                      name={isRTL ? "arrow-left" : "arrow-right"}
                      size={rs(18)}
                      color={Colors.primary}
                      style={styles.continueIcon}
                    />
                  </>
                )}
              </Pressable>
            </View>
          );
        })}
      </RefreshableScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(8),
  },
  subheading: {
    marginBottom: rvs(10),
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: rs(24),
    padding: rs(18),
    marginBottom: rvs(15),
  },
  iconWrapper: {
    width: rs(45),
    height: rs(45),
    borderRadius: rs(15),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: rvs(10),
  },
  cardDescription: {
    marginBottom: rvs(12),
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
  lockIcon: {
    marginEnd: rs(6),
  },
});
