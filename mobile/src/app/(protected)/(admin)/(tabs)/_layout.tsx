// app/(protected)/(admin)/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

/** Tab button without Android ripple / pressed background — matches the client tab bar. */
function NoRippleTabButton(props: any) {
  return (
    <Pressable
      {...props}
      android_ripple={{ color: "transparent" }}
      style={({ pressed }) => [props.style, { backgroundColor: "transparent", opacity: 1 }]}
    />
  );
}

export default function AdminTabsLayout() {
  const { t } = useTranslation();

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
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
        },

        tabBarButton: (props) => <NoRippleTabButton {...props} />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("admin.tabs.home"),
          tabBarIcon: ({ color, size }) => <Feather name="home" size={rs(size)} color={color} />,
        }}
      />

      <Tabs.Screen
        name="ops"
        options={{
          title: t("admin.tabs.ops"),
          tabBarIcon: ({ color, size }) => <Feather name="truck" size={rs(size)} color={color} />,
        }}
      />

      <Tabs.Screen
        name="shipments"
        options={{
          title: t("admin.tabs.shipments"),
          tabBarIcon: ({ color, size }) => <Feather name="hexagon" size={rs(size)} color={color} />,
        }}
      />

      <Tabs.Screen
        name="finance"
        options={{
          title: t("admin.tabs.finance"),
          tabBarIcon: ({ color, size }) => <Feather name="trending-up" size={rs(size)} color={color} />,
        }}
      />

      <Tabs.Screen
        name="more"
        options={{
          title: t("admin.tabs.more"),
          tabBarIcon: ({ color, size }) => <Feather name="menu" size={rs(size)} color={color} />,
        }}
      />
    </Tabs>
  );
}
