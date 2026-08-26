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
        name="shipments/[id]"
        options={{
          headerShown: false,
          title: "Shipment Details",
        }}
      />

      <Stack.Screen
        name="shipments/[id]/tracking"
        options={{
          headerShown: false,
          title: "Tracking",
        }}
      />

      <Stack.Screen
        name="shipments/[id]/quotation"
        options={{
          headerShown: false,
          title: "Quotation",
        }}
      />

      <Stack.Screen
        name="notifications"
        options={{
          headerShown: false,
          title: "Notifications",
        }}
      />
    </Stack>
  );
}
