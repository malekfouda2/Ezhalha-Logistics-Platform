// app/create-shipment/express/_layout.tsx

import { useEffect } from "react";
import { Stack } from "expo-router";
import { useCreateShipmentStore } from "@/store/createExpressShipmentStore";

export default function CreateShipmentLayout() {
  const reset = useCreateShipmentStore((s) => s.reset);

  // Leaving this flow entirely (back out to home, or forward to confirmation
  // after a successful payment) unmounts this stack — clear stale draft data.
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    />
  );
}