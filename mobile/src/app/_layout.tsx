import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";

import { onSessionExpired } from "@/api/client";
import { authKeys } from "@/lib/hooks/useAuth";
import { queryClient } from "@/lib/queryClient";
import { useLanguageStore } from "@/store/useLanguageStore";
import AppLayout from "@/components/layout/AppLayout";
import toastConfig from "@/components/ui/AppToast";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const init = useLanguageStore((state) => state.init);
  const isReady = useLanguageStore((state) => state.isReady);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync();
    }
  }, [isReady]);

  useEffect(() => {
    // Tokens are already gone by the time this fires (endSession() clears them
    // before notifying) — dropping the cached user here is what actually flips
    // ProtectedLayout's redirect, since authKeys.me() has staleTime: Infinity
    // and would otherwise never re-check.
    return onSessionExpired(() => {
      queryClient.setQueryData(authKeys.me(), null);
    });
  }, []);

  if (!isReady) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AppLayout>
          <Stack screenOptions={{ headerShown: false }} />
        </AppLayout>
      </SafeAreaProvider>
     <Toast config={toastConfig} />
    </QueryClientProvider>
  );
}
