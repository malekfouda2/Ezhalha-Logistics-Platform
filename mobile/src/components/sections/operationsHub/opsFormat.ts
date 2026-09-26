import type {
  OperationQueue,
  OperationShipmentKind,
  OperationShipmentSummary,
} from "@/lib/services/adminOperations";
import type { PillTone } from "@/components/sections/operationsHub/OpsPrimitives";

type Translate = (key: string, opts?: Record<string, unknown>) => string;

export function humanize(value?: string | null): string {
  if (!value) return "—";
  const text = value.replace(/[_-]+/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function statusLabel(status: string | null | undefined, t: Translate): string {
  if (!status) return "—";
  return t(`adminOperations.status.${status}`, { defaultValue: humanize(status) });
}

export function issueLabel(issueType: string, t: Translate): string {
  return t(`adminOperations.issues.${issueType}`, { defaultValue: humanize(issueType) });
}

export function statusTone(status: string | null | undefined): PillTone {
  switch (status) {
    case "delivered":
      return "green";
    case "carrier_error":
    case "cancelled":
      return "red";
    case "on_hold":
    case "awaiting_review":
    case "dg_review":
    case "payment_pending":
    case "awaiting_payment":
      return "amber";
    case "customs_clearance":
      return "purple";
    case "returned":
      return "gray";
    case "booked":
    case "dg_booking":
    case "dg_awaiting_carrier":
    case "created":
      return "blue";
    default:
      return "orange";
  }
}

export function hoursSince(date: string | null | undefined): number {
  if (!date) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 3_600_000));
}

export function ageLabel(date: string | null | undefined, t: Translate): string {
  const hours = hoursSince(date);
  if (hours < 1) return t("adminOperations.time.justNow");
  if (hours < 48) return t("adminOperations.time.hours", { count: hours });
  return t("adminOperations.time.days", { count: Math.floor(hours / 24) });
}

export function route(shipment: Pick<OperationShipmentSummary, "sender" | "recipient">): string {
  const from = shipment.sender.city || shipment.sender.country;
  const to = shipment.recipient.city || shipment.recipient.country;
  if (!from && !to) return "";
  return `${from ?? "—"} → ${to ?? "—"}`;
}

export function kindLabel(kind: OperationShipmentKind, t: Translate): string {
  return t(`adminOperations.kind.${kind}`, { defaultValue: humanize(kind) });
}

export function openAttentionFlags(shipment: OperationShipmentSummary) {
  return shipment.attentionFlags.filter((flag) => flag.status === "OPEN");
}

// ── Queue sub-tabs ───────────────────────────────────────────────────────────
// Same client-side bucketing as the web hub (hub.tsx getExpressTab / getDangerousGoodsTab …).

export function expressTab(status: string): "received" | "transit" | "customs" | "lastmile" {
  if (["customs_clearance", "carrier_error", "on_hold", "returned"].includes(status)) return "customs";
  if (["out_for_delivery", "delivered"].includes(status)) return "lastmile";
  if (["picked_up", "in_transit"].includes(status)) return "transit";
  return "received";
}

export function dangerousGoodsTab(
  shipment: OperationShipmentSummary,
): "hold" | "review" | "carrier" | "quoted" | "booking" | "live" {
  if (shipment.shipmentKind !== "DANGEROUS_GOODS") return "hold";
  if (shipment.paymentStatus === "paid") {
    return shipment.carrierTrackingNumber && shipment.status !== "dg_booking" ? "live" : "booking";
  }
  if (shipment.status === "payment_pending") return "quoted";
  if (shipment.status === "dg_awaiting_carrier") return "carrier";
  return "review";
}

export const DDP_STAGES = ["planning", "warehouse", "billing", "shipping", "delivery"] as const;

export interface QueueTabDef {
  key: string;
  labelKey: string;
  match: (shipment: OperationShipmentSummary) => boolean;
}

const KIND_TABS: QueueTabDef[] = [
  { key: "EXPRESS", labelKey: "adminOperations.kind.EXPRESS", match: (s) => s.shipmentKind === "EXPRESS" },
  { key: "DDP", labelKey: "adminOperations.kind.DDP", match: (s) => s.shipmentKind === "DDP" },
  { key: "LOCAL", labelKey: "adminOperations.kind.LOCAL", match: (s) => s.shipmentKind === "LOCAL" },
  {
    key: "DANGEROUS_GOODS",
    labelKey: "adminOperations.kind.DANGEROUS_GOODS",
    match: (s) => s.shipmentKind === "DANGEROUS_GOODS",
  },
];

const EXPRESS_TABS: QueueTabDef[] = (["received", "transit", "customs", "lastmile"] as const).map((key) => ({
  key,
  labelKey: `adminOperations.tabs.${key}`,
  match: (s) => expressTab(s.status) === key,
}));

/** Static sub-tabs per queue. The attention queue builds its own from the issue types present. */
export function queueTabs(queue: OperationQueue): QueueTabDef[] {
  switch (queue) {
    case "express":
    case "local":
      return EXPRESS_TABS;
    case "ddp":
      return DDP_STAGES.map((key, index) => ({
        key,
        labelKey: `adminOperations.stages.${key}`,
        match: (s) => (s.ddpCurrentStage ?? 1) === index + 1,
      }));
    case "dangerous_goods":
      return (["review", "carrier", "quoted", "booking", "live", "hold"] as const).map((key) => ({
        key,
        labelKey: `adminOperations.tabs.dg.${key}`,
        match: (s) => dangerousGoodsTab(s) === key,
      }));
    case "special":
      return (["urgent", "high", "normal"] as const).map((key) => ({
        key,
        labelKey: `adminOperations.priority.${key}`,
        match: (s) => (s.specialHandlingPriority ?? s.specialHandling?.priority ?? "normal") === key,
      }));
    case "delivered":
    case "returned":
      return KIND_TABS;
    default:
      return [];
  }
}

export function attentionTabs(rows: OperationShipmentSummary[], t: Translate): (QueueTabDef & { label: string })[] {
  const types = new Map<string, number>();
  for (const row of rows) {
    const issue = openAttentionFlags(row)[0]?.issueType;
    if (issue) types.set(issue, (types.get(issue) ?? 0) + 1);
  }
  return [...types.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([issue]) => ({
      key: issue,
      labelKey: "",
      label: issueLabel(issue, t),
      match: (s) => openAttentionFlags(s)[0]?.issueType === issue,
    }));
}

// ── Queue filters ────────────────────────────────────────────────────────────
// The dropdown filters under each queue's tabs on the web hub (hub.tsx filter-bar).

export type QueueFilterKey = "method" | "origin" | "payment" | "carrier" | "type" | "stale";
export type QueueFilters = Partial<Record<QueueFilterKey, string>>;

export const QUEUE_FILTERS: Partial<Record<OperationQueue, QueueFilterKey[]>> = {
  ddp: ["method", "origin", "payment"],
  express: ["carrier", "type"],
  attention: ["method", "stale"],
  dangerous_goods: ["carrier", "origin", "payment"],
};

const STALE_HOURS = ["24", "36", "48"];

function isExport(shipment: OperationShipmentSummary): boolean {
  const country = shipment.sender.country;
  return country === "SA" || !!country?.toLowerCase().includes("saudi");
}

/** Web `getMethod`: the service type, else a fallback per kind (a key into filters.methods). */
export function shipmentMethod(shipment: OperationShipmentSummary): string {
  if (shipment.serviceType) return shipment.serviceType;
  if (shipment.shipmentKind === "DDP") return "door_to_door";
  if (shipment.shipmentKind === "DANGEROUS_GOODS") return "dangerous_goods";
  return isExport(shipment) ? "express_export" : "express_import";
}

function uniqueValues(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => !!value))].sort();
}

export function filterOptions(key: QueueFilterKey, rows: OperationShipmentSummary[]): string[] {
  switch (key) {
    case "method":
      return uniqueValues(rows.map(shipmentMethod));
    case "origin":
      return uniqueValues(rows.map((s) => s.sender.country));
    case "carrier":
      return uniqueValues(rows.map((s) => s.carrierName));
    case "payment":
      return ["paid", "unpaid"];
    case "type":
      return ["import", "export"];
    case "stale":
      return STALE_HOURS;
  }
}

export function filterOptionLabel(key: QueueFilterKey, value: string, t: Translate): string {
  switch (key) {
    case "method":
      return t(`adminOperations.filters.methods.${value}`, { defaultValue: humanize(value) });
    case "payment":
      return t(`adminOperations.filters.payment.${value}`, { defaultValue: humanize(value) });
    case "type":
      return t(`adminOperations.filters.type.${value}`);
    case "stale":
      return t("adminOperations.filters.staleHours", { hours: value });
    default:
      return value;
  }
}

function matchesFilter(key: QueueFilterKey, value: string, shipment: OperationShipmentSummary): boolean {
  switch (key) {
    case "method":
      return shipmentMethod(shipment) === value;
    case "origin":
      return shipment.sender.country === value;
    case "carrier":
      return shipment.carrierName === value;
    case "payment":
      return shipment.paymentStatus === value;
    case "type":
      return (value === "export") === isExport(shipment);
    case "stale":
      return hoursSince(shipment.updatedAt) >= Number(value);
  }
}

export function applyQueueFilters(rows: OperationShipmentSummary[], filters: QueueFilters): OperationShipmentSummary[] {
  const active = (Object.entries(filters) as [QueueFilterKey, string | undefined][]).filter(
    (entry): entry is [QueueFilterKey, string] => !!entry[1],
  );
  if (active.length === 0) return rows;
  return rows.filter((shipment) => active.every(([key, value]) => matchesFilter(key, value, shipment)));
}

export const QUEUE_ORDER: OperationQueue[] = [
  "attention",
  "special",
  "dangerous_goods",
  "express",
  "ddp",
  "local",
  "delivered",
  "returned",
];

export function isOperationQueue(value: string | undefined): value is OperationQueue {
  return !!value && (QUEUE_ORDER as string[]).includes(value);
}
