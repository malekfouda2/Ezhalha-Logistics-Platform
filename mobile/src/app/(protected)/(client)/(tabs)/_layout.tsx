import { Tabs } from "expo-router";
import { Pressable, View, StyleSheet } from "react-native";
import { Feather, Ionicons, Octicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

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
                <NoRippleTabButton {...props}>
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
});
