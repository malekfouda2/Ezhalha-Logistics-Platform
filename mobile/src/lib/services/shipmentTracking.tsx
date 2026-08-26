import { api } from "@/api/client";

export type TrackingStatus =
  | "booked"
  | "collected"
  | "in_transit"
  | "out_for_delivery"
  | "delivered";

export interface TrackingEvent {
  key: TrackingStatus;
  title: string;
  location?: string;
  timestamp?: string;
  expectedTimestamp?: string;
  completed: boolean;
  active: boolean;
}

export interface TrackingCoordinate {
  latitude: number;
  longitude: number;
}

export interface ShipmentTrackingResponse {
  id: string;
  trackingNumber: string;
  carrier: string;
  currentLocation: TrackingCoordinate;
  destination: TrackingCoordinate;
  origin?: TrackingCoordinate;
  events: TrackingEvent[];
}

export async function fetchShipmentTracking(
  id: string,
): Promise<ShipmentTrackingResponse> {
  const res = api.get<ShipmentTrackingResponse>(
    `/api/client/shipments/${id}/track`,
  );
  return res;
}
