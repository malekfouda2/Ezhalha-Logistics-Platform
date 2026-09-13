// app/create-shipment/dangerousGoods/_layout.tsx

import { useEffect } from "react";
import { Redirect, Stack } from "expo-router";
import { useDangerousGoodsStore } from "@/store/createDangerousGoodsStore";
import { useGuestMode } from "@/store/useGuestStore";

export default function DangerousGoodsLayout() {
  const reset = useDangerousGoodsStore((s) => s.reset);
  const { isGuest } = useGuestMode();

  // Leaving this flow entirely (back out to home, or forward past the receipt) unmounts
  // this stack — clear stale draft data, exactly as the other shipment types do.
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  // Dangerous goods needs a per-account approval and no guest can have one — send a guest
  // straight to registration, same as tapping the locked tile on the picker.
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
