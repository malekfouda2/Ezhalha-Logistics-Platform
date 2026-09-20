import { Redirect } from "expo-router";

import { useCurrentUser } from "@/lib/hooks/useAuth";
import { useGuestMode } from "@/store/useGuestStore";
import { getHomeRouteForUserType } from "@/utils/postLoginRoute";

export default function Index() {
  const { data: user, isLoading } = useCurrentUser();
  const { isGuest, hasHydrated } = useGuestMode();

  if (isLoading || !hasHydrated) {
    return null;
  }

  if (user) {
    return <Redirect href={getHomeRouteForUserType(user.userType) as any} />;
  }

  // A guest holds no session at all — send them straight into the client surface, same as a
  // real login would.
  if (isGuest) {
    return <Redirect href="/(protected)/(client)/(tabs)/" />;
  }

  return <Redirect href="/(auth)/login" />;
}