import { and, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { integrationLogs } from "@shared/schema";
import { explainCarrierError, type CarrierErrorExplanation } from "@shared/carrier-errors";

/**
 * Where you find out that an integration has been failing.
 *
 * The prompt for this was 1,498 rejected FedEx tracking calls over two months that nobody
 * noticed, because each one failed quietly inside a scheduler. Per-shipment attention flags
 * cover the shipment in front of you; this covers the pattern across all of them.
 */

export interface IntegrationFailureGroup {
  serviceName: string;
  operation: string;
  statusCode: number | null;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  /** Decoded from a representative failure in the group. */
  explanation: CarrierErrorExplanation;
}

export interface IntegrationServiceHealth {
  serviceName: string;
  total: number;
  failures: number;
  failureRate: number;
  lastFailureAt: Date | null;
}

export interface IntegrationHealthReport {
  windowHours: number;
  generatedAt: Date;
  services: IntegrationServiceHealth[];
  failureGroups: IntegrationFailureGroup[];
}

/**
 * Pull the carrier's message out of a stored log row.
 *
 * Response payloads are JSON blobs whose shape differs per carrier — DHL uses `detail`, FedEx
 * an `errors` array, Zoho a bare `message`. Rather than parse each shape, take the whole blob
 * as text: the catalogue matches on patterns, so it copes with the raw JSON perfectly well and
 * we do not have to keep up with three response schemas.
 */
function messageFromLog(responsePayload: string | null, errorMessage: string | null): string {
  const payload = (responsePayload || "").trim();
  const isEmptyPayload =
    !payload || payload === "{}" || payload.includes('"logged":false');

  if (!isEmptyPayload) return payload;
  return (errorMessage || "").trim();
}

/**
 * Collapse shipment-specific identifiers out of an operation string.
 *
 * `GET /shipments/2575108620/tracking` and `?trackingNumber=DHL1785606772624` are the same
 * problem seen on two shipments. Without this the health page shows one row per shipment
 * instead of one row per problem, which is exactly the noise it exists to remove.
 *
 * Matches any 6+ character token carrying at least four digits — that covers bare waybills,
 * prefixed ones like DHL178..., and our own EZH tracking numbers, without touching real path
 * segments like `v1` or `trackingnumbers`.
 */
export function normaliseOperation(operation: string): string {
  return operation.replace(/[A-Za-z]*\d[A-Za-z0-9-]{5,}/g, (token) => {
    const digits = (token.match(/\d/g) || []).length;
    return digits >= 4 ? "{id}" : token;
  });
}

/**
 * Failure counts by service, and the distinct failures behind them.
 *
 * Grouped by (service, operation, status) rather than by exact message, because carrier
 * messages often embed a tracking number or timestamp and grouping on those would produce one
 * row per shipment instead of one row per problem.
 */
export async function getIntegrationHealth(options?: {
  windowHours?: number;
  limit?: number;
}): Promise<IntegrationHealthReport> {
  const windowHours = Math.min(Math.max(options?.windowHours ?? 168, 1), 24 * 90);
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 100);
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const serviceRows = await db
    .select({
      serviceName: integrationLogs.serviceName,
      total: sql<number>`count(*)::int`,
      failures: sql<number>`count(*) filter (where ${integrationLogs.success} = false)::int`,
      lastFailureAt: sql<Date | null>`max(${integrationLogs.createdAt}) filter (where ${integrationLogs.success} = false)`,
    })
    .from(integrationLogs)
    .where(gte(integrationLogs.createdAt, since))
    .groupBy(integrationLogs.serviceName);

  const groupRows = await db
    .select({
      serviceName: integrationLogs.serviceName,
      operation: integrationLogs.operation,
      statusCode: integrationLogs.statusCode,
      count: sql<number>`count(*)::int`,
      firstSeen: sql<Date>`min(${integrationLogs.createdAt})`,
      lastSeen: sql<Date>`max(${integrationLogs.createdAt})`,
      sampleResponse: sql<string | null>`(array_agg(${integrationLogs.responsePayload} order by ${integrationLogs.createdAt} desc))[1]`,
      sampleError: sql<string | null>`(array_agg(${integrationLogs.errorMessage} order by ${integrationLogs.createdAt} desc))[1]`,
    })
    .from(integrationLogs)
    .where(and(gte(integrationLogs.createdAt, since), sql`${integrationLogs.success} = false`))
    .groupBy(integrationLogs.serviceName, integrationLogs.operation, integrationLogs.statusCode)
    .orderBy(sql`count(*) desc`)
    // Over-fetch: SQL groups on the raw operation, which still carries per-shipment tracking
    // numbers. The merge below collapses those, so taking only `limit` raw rows here would
    // throw away rows that belong to the same real problem.
    .limit(Math.min(limit * 20, 1000));

  return {
    windowHours,
    generatedAt: new Date(),
    services: serviceRows
      .map((row) => ({
        serviceName: row.serviceName,
        total: Number(row.total) || 0,
        failures: Number(row.failures) || 0,
        failureRate: Number(row.total) > 0 ? Number(row.failures) / Number(row.total) : 0,
        lastFailureAt: row.lastFailureAt ? new Date(row.lastFailureAt) : null,
      }))
      .sort((a, b) => b.failures - a.failures),
    failureGroups: mergeFailureGroups(groupRows, limit),
  };
}

interface RawFailureRow {
  serviceName: string;
  operation: string;
  statusCode: number | null;
  count: number;
  firstSeen: Date | string;
  lastSeen: Date | string;
  sampleResponse: string | null;
  sampleError: string | null;
}

/**
 * Merge raw rows onto their normalised operation.
 *
 * The database groups on the literal operation string, so one problem affecting forty
 * shipments arrives as forty rows. This folds them back together and keeps the most recent
 * sample as the one to decode — the newest failure is the one most likely to still be true.
 */
function mergeFailureGroups(rows: RawFailureRow[], limit: number): IntegrationFailureGroup[] {
  const merged = new Map<string, {
    serviceName: string;
    operation: string;
    statusCode: number | null;
    count: number;
    firstSeen: Date;
    lastSeen: Date;
    sampleResponse: string | null;
    sampleError: string | null;
  }>();

  for (const row of rows) {
    const operation = normaliseOperation(row.operation);
    const key = `${row.serviceName}|${operation}|${row.statusCode ?? ""}`;
    const firstSeen = new Date(row.firstSeen);
    const lastSeen = new Date(row.lastSeen);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        serviceName: row.serviceName,
        operation,
        statusCode: row.statusCode ?? null,
        count: Number(row.count) || 0,
        firstSeen,
        lastSeen,
        sampleResponse: row.sampleResponse,
        sampleError: row.sampleError,
      });
      continue;
    }

    existing.count += Number(row.count) || 0;
    if (firstSeen < existing.firstSeen) existing.firstSeen = firstSeen;
    if (lastSeen > existing.lastSeen) {
      existing.lastSeen = lastSeen;
      existing.sampleResponse = row.sampleResponse;
      existing.sampleError = row.sampleError;
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((group) => ({
      serviceName: group.serviceName,
      operation: group.operation,
      statusCode: group.statusCode,
      count: group.count,
      firstSeen: group.firstSeen,
      lastSeen: group.lastSeen,
      explanation: explainCarrierError({
        message: messageFromLog(group.sampleResponse, group.sampleError),
        carrierCode: group.serviceName,
        statusCode: group.statusCode,
      }),
    }));
}
