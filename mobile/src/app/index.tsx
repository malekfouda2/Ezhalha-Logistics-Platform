import { Redirect } from "expo-router";

import { useCurrentUser } from "@/lib/hooks/useAuth";

export default function Index() {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) {
    return null;
  }

  if (user) {
    return <Redirect href="/(protected)/(client)/(tabs)/" />;
  }

  return <Redirect href="/(auth)/login" />;
}