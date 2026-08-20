import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";

import { queryClient } from "@/lib/queryClient";
import { useLanguageStore } from "@/store/useLanguageStore";
import AppLayout from "@/components/layout/AppLayout";

export default function RootLayout() {
  const init = useLanguageStore((state) => state.init);
  const isReady = useLanguageStore((state) => state.isReady);

  useEffect(() => {
    init();
  }, [init]);

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

      <Toast />
    </QueryClientProvider>
  );
}