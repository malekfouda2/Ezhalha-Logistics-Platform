// app/create-shipment/doorToDoor/_layout.tsx

import { useEffect } from "react";
import { Stack } from "expo-router";
import { useDoorToDoorStore } from "@/store/createDoorToDoorStore";

export default function DoorToDoorLayout() {
  const reset = useDoorToDoorStore((s) => s.reset);

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
