import { Redirect, Stack } from "expo-router";

import { useCurrentUser } from "@/lib/hooks/useAuth";

export default function ClientLayout() {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) {
    return null;
  }

  // Not logged in → send to login
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      
      <Stack.Screen
        name="shipment/[id]"
        options={{
          headerShown: false,
          title: "Shipment Details",
        }}
      />

      <Stack.Screen
        name="invoice/[id]"
        options={{
          headerShown: false,
          title: "Invoice",
        }}
      />

      <Stack.Screen
        name="notifications"
        options={{
          headerShown: false,
          title: "Notifications",
        }}
      />

      <Stack.Screen
        name="edit-profile"
        options={{
          headerShown: false,
          title: "Edit Profile",
        }}
      />

      <Stack.Screen
        name="add-shipment"
        options={{
          presentation: "modal",
          headerShown: false,
          title: "New Shipment",
        }}
      />
    </Stack>
  );
}