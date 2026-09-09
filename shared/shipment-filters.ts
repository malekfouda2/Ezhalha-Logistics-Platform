/**
 * One definition of what each shipment filter means.
 *
 * The client portal filters an in-memory list and the admin portal filters in SQL over a
 * server-paginated one. Without a shared definition the two drift — "Paid" ends up meaning
 * something subtly different depending on which page you are on. The predicate here is the
 * reference; the SQL in storage.getShipmentsPaginated mirrors it clause for clause.
 */

export const SHIPMENT_FILTER_ALL = "all";

export interface ShipmentFilters {
  search: string;
  /** A concrete status, one of the grouped keys below, or "all". */
  status: string;
  carrierCode: string;
  fulfillmentType: string;
  paymentStatus: string;
  paymentMethod: string;
  originCountry: string;
  destinationCountry: string;
  /** Inclusive creation-date bounds, "YYYY-MM-DD" or "". */
  dateFrom: string;
  dateTo: string;
}

export const DEFAULT_SHIPMENT_FILTERS: ShipmentFilters = {
  search: "",
  status: SHIPMENT_FILTER_ALL,
  carrierCode: SHIPMENT_FILTER_ALL,
  fulfillmentType: SHIPMENT_FILTER_ALL,
  paymentStatus: SHIPMENT_FILTER_ALL,
  paymentMethod: SHIPMENT_FILTER_ALL,
  originCountry: SHIPMENT_FILTER_ALL,
  destinationCountry: SHIPMENT_FILTER_ALL,
  dateFrom: "",
  dateTo: "",
};

/**
 * Lifecycle groupings behind the client portal's tabs. A tab is a filter over several raw
 * statuses, so both the predicate and the SQL expand them the same way.
 */
export const SHIPMENT_STATUS_GROUPS: Record<string, string[]> = {
  processing: ["draft", "payment_pending", "created", "processing"],
  in_transit: ["picked_up", "in_transit", "customs_clearance", "out_for_delivery"],
  attention: ["on_hold", "returned", "carrier_error"],
  delivered: ["delivered"],
};

/** Every raw status a status filter value stands for. */
export function expandStatusFilter(status: string): string[] {
  return SHIPMENT_STATUS_GROUPS[status] ?? [status];
}

/** Fulfilment routes, labelled as the rest of the UI labels them. */
export const FULFILLMENT_TYPE_OPTIONS = [
  { value: "carrier", label: "Express" },
  { value: "local", label: "Local" },
  { value: "ddp_manual", label: "Door to Door" },
];

export const PAYMENT_STATUS_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "unpaid", label: "Unpaid" },
  { value: "refunded", label: "Refunded" },
];

export const PAYMENT_METHOD_OPTIONS = [
  { value: "PAY_NOW", label: "Paid by card" },
  { value: "CREDIT", label: "On credit" },
];

/** Shape a shipment must have to be filtered. Deliberately loose — both portals pass their own. */
export interface FilterableShipment {
  trackingNumber?: string | null;
  recipientName?: string | null;
  recipientCity?: string | null;
  senderName?: string | null;
  status?: string | null;
  carrierCode?: string | null;
  fulfillmentType?: string | null;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  senderCountry?: string | null;
  recipientCountry?: string | null;
  createdAt?: string | Date | null;
}

function isSet(value: string): boolean {
  return Boolean(value) && value !== SHIPMENT_FILTER_ALL;
}

/** How many filters the user has actually narrowed by — drives the "N active" badge. */
export function countActiveShipmentFilters(filters: ShipmentFilters): number {
  let n = 0;
  if (filters.search.trim()) n++;
  for (const key of [
    "status",
    "carrierCode",
    "fulfillmentType",
    "paymentStatus",
    "paymentMethod",
    "originCountry",
    "destinationCountry",
  ] as const) {
    if (isSet(filters[key])) n++;
  }
  if (filters.dateFrom) n++;
  if (filters.dateTo) n++;
  return n;
}

export function hasActiveShipmentFilters(filters: ShipmentFilters): boolean {
  return countActiveShipmentFilters(filters) > 0;
}

/** The creation date as a local YYYY-MM-DD, for comparing against the date inputs. */
function toDateKey(value?: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * In-memory equivalent of the SQL filter. Used by the client portal, and by the tests that keep
 * the two implementations honest.
 */
export function matchesShipmentFilters(
  shipment: FilterableShipment,
  filters: ShipmentFilters,
): boolean {
  const search = filters.search.trim().toLowerCase();
  if (search) {
    const haystack = [
      shipment.trackingNumber,
      shipment.recipientName,
      shipment.recipientCity,
      shipment.senderName,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(search)) return false;
  }

  if (isSet(filters.status) && !expandStatusFilter(filters.status).includes(shipment.status || "")) {
    return false;
  }
  if (isSet(filters.carrierCode) && (shipment.carrierCode || "") !== filters.carrierCode) {
    return false;
  }
  if (isSet(filters.fulfillmentType) && (shipment.fulfillmentType || "carrier") !== filters.fulfillmentType) {
    return false;
  }
  if (isSet(filters.paymentStatus) && (shipment.paymentStatus || "") !== filters.paymentStatus) {
    return false;
  }
  if (isSet(filters.paymentMethod) && (shipment.paymentMethod || "") !== filters.paymentMethod) {
    return false;
  }
  if (isSet(filters.originCountry) && (shipment.senderCountry || "") !== filters.originCountry) {
    return false;
  }
  if (isSet(filters.destinationCountry) && (shipment.recipientCountry || "") !== filters.destinationCountry) {
    return false;
  }

  // Both bounds are inclusive whole days, which is what a person picking dates expects.
  const createdKey = toDateKey(shipment.createdAt);
  if (filters.dateFrom && (!createdKey || createdKey < filters.dateFrom)) return false;
  if (filters.dateTo && (!createdKey || createdKey > filters.dateTo)) return false;

  return true;
}

/** Serialise to query params, omitting anything left at its default. */
export function shipmentFiltersToQueryParams(filters: ShipmentFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.search.trim()) params.search = filters.search.trim();
  if (isSet(filters.status)) params.status = filters.status;
  if (isSet(filters.carrierCode)) params.carrierCode = filters.carrierCode;
  if (isSet(filters.fulfillmentType)) params.fulfillmentType = filters.fulfillmentType;
  if (isSet(filters.paymentStatus)) params.paymentStatus = filters.paymentStatus;
  if (isSet(filters.paymentMethod)) params.paymentMethod = filters.paymentMethod;
  if (isSet(filters.originCountry)) params.originCountry = filters.originCountry;
  if (isSet(filters.destinationCountry)) params.destinationCountry = filters.destinationCountry;
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  return params;
}
