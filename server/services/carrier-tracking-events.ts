import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  shipmentCarrierTrackingEvents,
  type InsertShipmentCarrierTrackingEvent,
  type ShipmentCarrierTrackingEvent,
} from "@shared/schema";
import type { TrackingEvent } from "../integrations/fedex";
import { logError } from "./logger";

/** `excluded.<column>` — the value the failed INSERT tried to write, inside ON CONFLICT DO UPDATE. */
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

/**
 * How many scans we keep per shipment when reading them back. Carriers can emit 40+ scans on a
 * multi-leg international movement; the hub shows them all, so this is a sanity ceiling, not a
 * display choice.
 */
const MAX_EVENTS_PER_SHIPMENT = 200;

/**
 * Stable identity for a carrier scan.
 *
 * None of FedEx, DHL or Aramex issue an event id, so the key is derived from the fields the
 * carrier itself sent. It deliberately includes the description: DHL emits several scans that
 * share a timestamp and typeCode but describe different legs, and keying on time+code alone
 * would silently collapse them into one.
 *
 * Timestamp is reduced to whole seconds — FedEx has been observed re-sending the same scan with
 * differing sub-second precision, which would otherwise duplicate the row on every poll.
 */
export function buildCarrierEventKey(event: TrackingEvent): string {
  const seconds = Math.floor(event.timestamp.getTime() / 1000);
  return [
    seconds,
    (event.status || "").trim().toUpperCase(),
    (event.description || "").trim().toLowerCase(),
    (event.location || "").trim().toLowerCase(),
  ].join("|");
}

function toInsertRow(
  shipmentId: string,
  carrierCode: string,
  event: TrackingEvent,
): InsertShipmentCarrierTrackingEvent | null {
  // A scan with no text is not something we can show as "the carrier's own words", and a scan
  // with no usable time cannot be placed on the timeline. Drop it rather than render a blank row.
  if (!event.description?.trim()) return null;
  if (Number.isNaN(event.timestamp?.getTime?.() ?? NaN)) return null;

  let raw: string | null = null;
  try {
    raw = event.raw === undefined ? null : JSON.stringify(event.raw);
  } catch {
    // A carrier payload with a cycle in it is not worth failing the whole sync over.
    raw = null;
  }

  return {
    shipmentId,
    carrierCode,
    eventKey: buildCarrierEventKey(event),
    eventCode: event.status?.trim() || null,
    description: event.description.trim(),
    occurredAt: event.timestamp,
    carrierLocalTime: event.localTime || null,
    carrierUtcOffset: event.utcOffset || null,
    location: event.location?.trim() || null,
    exceptionCode: event.exceptionCode || null,
    exceptionDescription: event.exceptionDescription || null,
    signedBy: event.signedBy || null,
    remarks: event.remarks || null,
    raw,
  };
}

/**
 * Persist a carrier's scan history verbatim.
 *
 * Runs on every poll, so it must be idempotent: rows are upserted on (shipmentId, eventKey).
 * Existing rows are refreshed rather than ignored, because carriers do enrich a scan after the
 * fact — DHL attaches `remarks` and a `signedBy` to an already-published delivery scan, and FedEx
 * fills in `exceptionDescription` once an agent codes the exception.
 *
 * Never throws: a tracking sync that moved the shipment's status must not be rolled back because
 * the audit history failed to write.
 */
export async function recordCarrierTrackingEvents(params: {
  shipmentId: string;
  carrierCode: string;
  events: TrackingEvent[];
}): Promise<number> {
  const rows = params.events
    .map((event) => toInsertRow(params.shipmentId, params.carrierCode, event))
    .filter((row): row is InsertShipmentCarrierTrackingEvent => row !== null);

  if (rows.length === 0) return 0;

  // The carrier can repeat an identical scan inside one response; de-duplicate before the insert
  // so Postgres does not reject the whole statement with "cannot affect row a second time".
  const deduped = new Map<string, InsertShipmentCarrierTrackingEvent>();
  for (const row of rows) {
    deduped.set(row.eventKey, row);
  }

  try {
    await db
      .insert(shipmentCarrierTrackingEvents)
      .values([...deduped.values()])
      .onConflictDoUpdate({
        target: [shipmentCarrierTrackingEvents.shipmentId, shipmentCarrierTrackingEvents.eventKey],
        set: {
          description: sqlExcluded("description"),
          eventCode: sqlExcluded("event_code"),
          occurredAt: sqlExcluded("occurred_at"),
          carrierLocalTime: sqlExcluded("carrier_local_time"),
          carrierUtcOffset: sqlExcluded("carrier_utc_offset"),
          location: sqlExcluded("location"),
          exceptionCode: sqlExcluded("exception_code"),
          exceptionDescription: sqlExcluded("exception_description"),
          signedBy: sqlExcluded("signed_by"),
          remarks: sqlExcluded("remarks"),
          raw: sqlExcluded("raw"),
        },
      });
    return deduped.size;
  } catch (error) {
    logError("Failed to persist carrier tracking events", {
      shipmentId: params.shipmentId,
      carrierCode: params.carrierCode,
      count: deduped.size,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

export async function getCarrierTrackingEvents(shipmentId: string): Promise<ShipmentCarrierTrackingEvent[]> {
  return db
    .select()
    .from(shipmentCarrierTrackingEvents)
    .where(eq(shipmentCarrierTrackingEvents.shipmentId, shipmentId))
    .orderBy(desc(shipmentCarrierTrackingEvents.occurredAt))
    .limit(MAX_EVENTS_PER_SHIPMENT);
}

export async function getCarrierTrackingEventByKey(
  shipmentId: string,
  eventKey: string,
): Promise<ShipmentCarrierTrackingEvent | undefined> {
  const [row] = await db
    .select()
    .from(shipmentCarrierTrackingEvents)
    .where(
      and(
        eq(shipmentCarrierTrackingEvents.shipmentId, shipmentId),
        eq(shipmentCarrierTrackingEvents.eventKey, eventKey),
      ),
    )
    .limit(1);
  return row;
}
