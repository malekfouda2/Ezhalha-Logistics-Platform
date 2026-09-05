import { Redirect, Stack } from "expo-router";

import { useCurrentUser } from "@/lib/hooks/useAuth";

export default function ClientLayout() {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) {
    return null;
  }

  // Not logged in → send to login
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />

      <Stack.Screen
        name="shipments/[id]"
        options={{
          headerShown: false,
          title: "Shipment Details",
        }}
      />

      <Stack.Screen
        name="shipments/[id]/tracking"
        options={{
          headerShown: false,
          title: "Tracking",
        }}
      />

      <Stack.Screen
        name="shipments/[id]/quotation"
        options={{
          headerShown: false,
          title: "Quotation",
        }}
      />

      <Stack.Screen
        name="notifications"
        options={{
          headerShown: false,
          title: "Notifications",
        }}
      />

      <Stack.Screen
        name="credit-billing"
        options={{
          headerShown: false,
          title: "Credit / Billing",
        }}
      />

      <Stack.Screen
        name="credit-billing/[id]"
        options={{
          headerShown: false,
          title: "Credit Invoice Details",
        }}
      />

      <Stack.Screen
        name="payments"
        options={{
          headerShown: false,
          title: "Payments",
        }}
      />

      <Stack.Screen
        name="saved-cards"
        options={{
          headerShown: false,
          title: "Saved Cards",
        }}
      />

      <Stack.Screen
        name="profile-information"
        options={{
          headerShown: false,
          title: "Profile Information",
        }}
      />

      <Stack.Screen
        name="default-shipping-address"
        options={{
          headerShown: false,
          title: "Default Shipping Address",
        }}
      />

      <Stack.Screen
        name="billing-currency"
        options={{
          headerShown: false,
          title: "Billing Currency",
        }}
      />

      <Stack.Screen
        name="change-password"
        options={{
          headerShown: false,
          title: "Change Password",
        }}
      />

      <Stack.Screen
        name="language"
        options={{
          headerShown: false,
          title: "Change Language",
        }}
      />

      <Stack.Screen
        name="signed-in-devices"
        options={{
          headerShown: false,
          title: "Signed-in Devices",
        }}
      />

      <Stack.Screen
        name="team-members"
        options={{
          headerShown: false,
          title: "Team Members",
        }}
      />

      <Stack.Screen
        name="team-members/[id]"
        options={{
          headerShown: false,
          title: "Edit Permissions",
        }}
      />

      <Stack.Screen
        name="quick-quote"
        options={{
          headerShown: false,
          title: "Quick Quote",
        }}
      />

      <Stack.Screen
        name="sales-channels"
        options={{
          headerShown: false,
          title: "Sales Channels",
        }}
      />

      <Stack.Screen
        name="sales-channels/[id]"
        options={{
          headerShown: false,
          title: "Sales Channel Details",
        }}
      />

      <Stack.Screen
        name="sales-channels/orders"
        options={{
          headerShown: false,
          title: "Orders",
        }}
      />

      <Stack.Screen
        name="sales-channels/orders/[id]"
        options={{
          headerShown: false,
          title: "Fulfill Order",
        }}
      />

      <Stack.Screen
        name="sales-channels/assignment-rules"
        options={{
          headerShown: false,
          title: "Assignment Rules",
        }}
      />
    </Stack>
  );
}
