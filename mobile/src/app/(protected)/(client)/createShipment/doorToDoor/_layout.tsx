// app/create-shipment/doorToDoor/_layout.tsx

import { useEffect } from "react";
import { Redirect, Stack } from "expo-router";
import { useDoorToDoorStore } from "@/store/createDoorToDoorStore";
import { useGuestMode } from "@/store/useGuestStore";

export default function DoorToDoorLayout() {
  const reset = useDoorToDoorStore((s) => s.reset);
  const { isGuest } = useGuestMode();

  // Leaving this flow entirely (back out to home, or forward to confirmation
  // after a successful payment) unmounts this stack — clear stale draft data.
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  // No guest pricing endpoint exists for Door-to-Door Freight (unlike Express/Local) — send a
  // guest straight to registration, same as tapping the locked tile on the picker.
  if (isGuest) {
    return <Redirect href="/apply" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    />
  );
}
