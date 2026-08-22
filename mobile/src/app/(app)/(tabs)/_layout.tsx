import { Tabs, router } from "expo-router";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { rs, rvs } from "@/utils/responsive";
import { Colors } from "@/constants/colors";

function AddButton() {
  return (
    <View style={styles.fab}>
      <Ionicons name="add" size={28} color="#fff" />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.secondary,
        tabBarStyle: {
          height: 88,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="shipments"
        options={{
          title: "Shipments",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cube-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="add"
        options={{
          title: "",
          tabBarIcon: () => <AddButton />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push("/(app)/add-shipment");
          },
        }}
      />

      <Tabs.Screen
        name="invoices"
        options={{
          title: "Invoices",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="document-text-outline"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  fab: {
    width: rs(56),
    height: rvs(56),
    borderRadius: rs(16),
    backgroundColor: Colors.primaryDark,
    justifyContent: "center",
    alignItems: "center",
    marginTop: rvs(-20),

    shadowColor: Colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: rs(8),
    shadowOffset: {
      width: 0,
      height: rvs(4),
    },

    elevation: 5,
  },
});