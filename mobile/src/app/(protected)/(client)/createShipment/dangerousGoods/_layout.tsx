// app/create-shipment/dangerousGoods/_layout.tsx

import { useEffect } from "react";
import { Stack } from "expo-router";
import { useDangerousGoodsStore } from "@/store/createDangerousGoodsStore";

export default function DangerousGoodsLayout() {
  const reset = useDangerousGoodsStore((s) => s.reset);

  // Leaving this flow entirely (back out to home, or forward past the receipt) unmounts
  // this stack — clear stale draft data, exactly as the other shipment types do.
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
