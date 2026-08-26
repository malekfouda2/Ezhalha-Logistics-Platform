// app/(protected)/(client)/shipments/[id]/quotation/_layout.tsx
import { Stack } from "expo-router";

export default function QuotationLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="accepted" />
    </Stack>
  );
}