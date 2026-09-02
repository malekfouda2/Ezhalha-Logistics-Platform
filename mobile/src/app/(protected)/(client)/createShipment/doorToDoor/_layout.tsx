// app/create-shipment/doorToDoor/_layout.tsx

import { Stack } from "expo-router";

export default function DoorToDoorLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    />
  );
}
