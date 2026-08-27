// lib/hooks/useRefreshOnFocus.ts
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useGlobalRefresh() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Refetches every active query currently mounted on screen —
      // not just one screen's data. Each screen still only re-renders
      // with the queries it actually subscribes to.
      await queryClient.refetchQueries({ type: "active" });
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  return { refreshing, onRefresh };
}