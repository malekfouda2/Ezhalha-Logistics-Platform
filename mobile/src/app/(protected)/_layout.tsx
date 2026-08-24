// app/(protected)/_layout.tsx

import { Redirect, Slot } from "expo-router";
import { useCurrentUser } from "@/lib/hooks/useAuth";

export default function ProtectedLayout() {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) {
    return null;
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Slot />;
}