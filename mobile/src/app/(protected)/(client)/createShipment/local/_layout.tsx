// app/create-shipment/local/_layout.tsx

import { Stack } from "expo-router";

export default function CreateLocalShipmentLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    />
  );
}
