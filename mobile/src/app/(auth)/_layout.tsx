import { Redirect, Stack } from "expo-router";

import { useCurrentUser } from "@/lib/hooks/useAuth";

export default function AuthLayout() {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) {
    return null;
  }

  // Already logged in → don't allow access to auth screens
  if (user) {
    return <Redirect href="/(protected)/(client)/(tabs)/" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="otp-request" />
      <Stack.Screen name="otp-verify" />
      <Stack.Screen name="apply" />
    </Stack>
  );
}
