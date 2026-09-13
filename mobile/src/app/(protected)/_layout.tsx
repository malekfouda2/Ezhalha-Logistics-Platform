// app/(protected)/_layout.tsx

import { Redirect, Slot } from "expo-router";
import { useCurrentUser } from "@/lib/hooks/useAuth";
import { useGuestMode } from "@/store/useGuestStore";

export default function ProtectedLayout() {
  const { data: user, isLoading } = useCurrentUser();
  const { isGuest, hasHydrated } = useGuestMode();

  if (isLoading || !hasHydrated) {
    return null;
  }

  // Guests hold no session — let them through to the client surface below, same as a real user.
  if (!user && !isGuest) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Slot />;
}