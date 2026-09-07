import { useState } from "react";
import { Tabs, useRouter } from "expo-router";
import { Pressable, View, StyleSheet, Modal } from "react-native";
import { Feather, Ionicons, Octicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useMyPermissions } from "@/lib/hooks/useTeam";
import { ClientPermission } from "@shared/domain";

function CreateShipmentButton() {
  return (
    <View style={styles.addButtonContainer}>
      <View style={styles.fab}>
        <Ionicons name="add" size={32} color={Colors.white} />
      </View>
    </View>
  );
}

interface CreateShipmentSheetProps {
  visible: boolean;
  onClose: () => void;
}

function CreateShipmentMenu({ visible, onClose }: CreateShipmentSheetProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const goTo = (path: string) => {
    onClose();
    router.push(path as any);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      <View style={styles.menuWrapper} pointerEvents="box-none">
        <View style={styles.menuCard}>
          <Pressable
            onPress={() => goTo("/createShipment")}
            style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
          >
            <View style={[styles.menuIcon, { backgroundColor: "#FDE4D6" }]}>
              <Feather name="hexagon" size={rs(16)} color={Colors.primary} />
            </View>
            <Text size="small" weight="bold" style={styles.menuLabel}>
              {t("tabs.createShipmentMenu.createShipment")}
            </Text>
          </Pressable>

          <View style={styles.menuDivider} />

          <Pressable
            onPress={() => goTo("/quick-quote")}
            style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
          >
            <View style={[styles.menuIcon, { backgroundColor: "#DCE6FB" }]}>
              <Ionicons name="calculator-outline" size={rs(16)} color="#3B6FE0" />
            </View>
            <Text size="small" weight="bold" style={styles.menuLabel}>
              {t("tabs.createShipmentMenu.quickQuote")}
            </Text>
          </Pressable>
        </View>

        <View style={styles.menuCaret} />
      </View>
    </Modal>
  );
}

/**
 * Tab button without Android ripple / pressed background.
 */
function NoRippleTabButton(props: any) {
  return (
    <Pressable
      {...props}
      android_ripple={{ color: "transparent" }}
      style={({ pressed }) => [
        props.style,
        {
          backgroundColor: "transparent",
          opacity: 1,
        },
      ]}
    />
  );
}

export default function ClientTabsLayout() {
  const { t } = useTranslation();
  const { data: myPerms } = useMyPermissions();
  const [showCreateSheet, setShowCreateSheet] = useState(false);

  const canViewShipments =
    !!myPerms?.isPrimaryContact ||
    !!myPerms?.permissions.includes(ClientPermission.VIEW_SHIPMENTS);
  const canCreateShipments =
    !!myPerms?.isPrimaryContact ||
    !!myPerms?.permissions.includes(ClientPermission.CREATE_SHIPMENTS);
  const canViewInvoices =
    !!myPerms?.isPrimaryContact ||
    !!myPerms?.permissions.includes(ClientPermission.VIEW_INVOICES);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,

          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: "#94A3B8",

          tabBarLabelStyle: {
            fontFamily: "Inter-SemiBold",
            fontSize: rs(11),
            marginBottom: rvs(4),
          },

          tabBarStyle: {
            height: rvs(70),
            paddingTop: rvs(6),
            paddingBottom: rvs(6),

            backgroundColor: Colors.white,

            borderTopWidth: 1,
            borderTopColor: "#ECEEF1",

            elevation: 10,

            shadowColor: "#000",
            shadowOffset: {
              width: 0,
              height: -2,
            },
            shadowOpacity: 0.05,
            shadowRadius: 8,
          },

          // Remove Android press/ripple background
          tabBarButton: (props) => <NoRippleTabButton {...props} />,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t("tabs.home"),
            tabBarIcon: ({ color, size }) => (
              <Feather name="home" size={rs(size)} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="shipments"
          options={{
            title: t("tabs.shipments"),
            tabBarIcon: ({ color, size }) => (
              <Feather name="hexagon" size={rs(size)} color={color} />
            ),
            href: canViewShipments ? undefined : null,
          }}
        />

        <Tabs.Screen
          name="createShipment"
          options={{
            title: "",
            // href can't be combined with a custom tabBarButton, so hide by
            // rendering nothing instead — no flex slot is reserved for it.
            tabBarButton: canCreateShipments
              ? (props) => (
                  <NoRippleTabButton
                    {...props}
                    onPress={() => setShowCreateSheet(true)}
                  >
                    <CreateShipmentButton />
                  </NoRippleTabButton>
                )
              : () => null,
          }}
        />

        <Tabs.Screen
          name="invoices"
          options={{
            title: t("tabs.invoices"),
            tabBarIcon: ({ color, size }) => (
              <Feather name="file-text" size={rs(size)} color={color} />
            ),
            href: canViewInvoices ? undefined : null,
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: t("tabs.profile"),
            tabBarIcon: ({ color, size }) => (
              <Octicons name="person" size={rs(size)} color={color} />
            ),
          }}
        />
      </Tabs>

      <CreateShipmentMenu
        visible={showCreateSheet}
        onClose={() => setShowCreateSheet(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  addButtonContainer: {
    width: rs(72),
    height: rvs(64),

    justifyContent: "center",
    alignItems: "center",

    marginTop: rvs(-30),
  },

  fab: {
    width: rs(48),
    height: rs(48),

    borderRadius: rs(15),

    backgroundColor: Colors.primary,

    alignItems: "center",
    justifyContent: "center",

    shadowColor: Colors.primary,
    shadowOffset: {
      width: 0,
      height: rvs(8),
    },
    shadowOpacity: 0.35,
    shadowRadius: rs(12),

    elevation: 8,
  },

  menuWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: rvs(70) + rs(58),
    alignItems: "center",
  },

  menuCard: {
    width: rs(200),
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    paddingVertical: rvs(4),

    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: rvs(4),
    },
    shadowOpacity: 0.15,
    shadowRadius: rs(12),

    elevation: 10,
  },

  menuCaret: {
    width: 0,
    height: 0,
    marginTop: -1,

    borderLeftWidth: rs(8),
    borderRightWidth: rs(8),
    borderTopWidth: rs(8),

    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: Colors.white,
  },

  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(10),
    paddingVertical: rvs(11),
    paddingHorizontal: rs(14),
  },

  menuRowPressed: {
    opacity: 0.6,
  },

  menuIcon: {
    width: rs(32),
    height: rs(32),
    borderRadius: rs(10),
    alignItems: "center",
    justifyContent: "center",
  },

  menuLabel: {
    flex: 1,
  },

  menuDivider: {
    height: 1,
    marginHorizontal: rs(14),
    backgroundColor: Colors.border,
  },
});
