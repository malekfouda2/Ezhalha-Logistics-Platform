import { useCallback, useEffect, useState } from "react";
import { fetchShipmentTracking, ShipmentTrackingResponse } from "../services/shipmentTracking";

interface UseShipmentTrackingResult {
  data: ShipmentTrackingResponse | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const POLL_INTERVAL_MS = 30000;

export function useShipmentTracking(
  shipmentId: string | undefined
): UseShipmentTrackingResult {
  const [data, setData] = useState<ShipmentTrackingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!shipmentId) return;
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        const result = await fetchShipmentTracking(shipmentId);
        setData(result);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setLoading(false);
        // Only clear the pull-to-refresh flag for an actual user pull — not
        // the background poll below, which never sets it in the first
        // place. Otherwise a poll tick landing while this screen is
        // off-screen (pushed underneath another screen) can leave the
        // native RefreshControl stuck until a real touch resyncs it.
        if (isRefresh) setRefreshing(false);
      }
    },
    [shipmentId]
  );

  useEffect(() => {
    load();
    const interval = setInterval(() => load(false), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  return {
    data,
    loading,
    refreshing,
    error,
    refetch: () => load(true),
  };
}