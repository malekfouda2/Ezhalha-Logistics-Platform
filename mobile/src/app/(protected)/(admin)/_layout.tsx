// app/(protected)/(admin)/_layout.tsx
import { Redirect, Stack } from "expo-router";

import { useCurrentUser } from "@/lib/hooks/useAuth";

export default function AdminLayout() {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) {
    return null;
  }

  // This shell is admin-only — anyone else (client, guest, operations) belongs
  // on the client tabs instead.
  if (!user || user.userType !== "admin") {
    return <Redirect href="/(protected)/(client)/(tabs)/" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="client" options={{ title: "Clients" }} />
      <Stack.Screen name="client/[id]" options={{ title: "Client Details" }} />
      <Stack.Screen name="client/[id]/edit" options={{ title: "Edit Client" }} />
      <Stack.Screen name="client/[id]/documents" options={{ title: "Client Documents" }} />
      <Stack.Screen name="client/account-managers" options={{ title: "Account Managers" }} />
      <Stack.Screen name="applications/index" options={{ title: "Client Applications" }} />
      <Stack.Screen name="applications/[id]" options={{ title: "Application Details" }} />
      <Stack.Screen name="performance" options={{ title: "Performance" }} />
      <Stack.Screen name="search" options={{ title: "Search" }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
      <Stack.Screen name="change-password" options={{ title: "Change Password" }} />
      <Stack.Screen name="language" options={{ title: "Change Language" }} />
    </Stack>
  );
}
