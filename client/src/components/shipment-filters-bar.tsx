import { Filter, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRY_CODE_OPTIONS } from "@shared/countries";
import {
  countActiveShipmentFilters,
  DEFAULT_SHIPMENT_FILTERS,
  FULFILLMENT_TYPE_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  SHIPMENT_FILTER_ALL,
  type ShipmentFilters,
} from "@shared/shipment-filters";

const COUNTRY_NAME_BY_CODE = new Map(COUNTRY_CODE_OPTIONS.map((c) => [c.code, c.name]));

export interface ShipmentFilterFacets {
  carrierCodes: string[];
  originCountries: string[];
  destinationCountries: string[];
}

function countryLabel(code: string): string {
  return COUNTRY_NAME_BY_CODE.get(code) ?? code;
}

/**
 * The filter bar shared by the client and admin shipment lists.
 *
 * Dropdown options come from `facets` — the values that actually occur in the caller's data —
 * rather than from a static list. Offering seventy countries when the business ships from seven
 * makes the filter slower to use than scanning the table.
 *
 * `expanded` is controlled by the caller so the row of dropdowns can stay out of the way until
 * asked for; search and status remain visible at all times because they are the common case.
 */
export function ShipmentFiltersBar({
  filters,
  onChange,
  facets,
  statusOptions,
  expanded,
  onExpandedChange,
  showStatusSelect = true,
  showPaymentMethod = true,
  resultCount,
  searchPlaceholder = "Search by shipment ID, recipient, city, or sender...",
}: {
  filters: ShipmentFilters;
  onChange: (next: ShipmentFilters) => void;
  facets: ShipmentFilterFacets;
  statusOptions: { value: string; label: string }[];
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  /** The client portal drives status from its lifecycle tabs, so it hides this select. */
  showStatusSelect?: boolean;
  /** Clients see their own payment method on every row, so it is optional. */
  showPaymentMethod?: boolean;
  resultCount?: number;
  searchPlaceholder?: string;
}) {
  const activeCount = countActiveShipmentFilters(filters);
  const set = <K extends keyof ShipmentFilters>(key: K, value: ShipmentFilters[K]) =>
    onChange({ ...filters, [key]: value });

  const selects: { key: keyof ShipmentFilters; label: string; options: { value: string; label: string }[]; allLabel: string }[] = [
    {
      key: "carrierCode",
      label: "Carrier",
      allLabel: "Any carrier",
      options: facets.carrierCodes.map((code) => ({ value: code, label: code })),
    },
    { key: "fulfillmentType", label: "Type", allLabel: "Any type", options: FULFILLMENT_TYPE_OPTIONS },
    { key: "paymentStatus", label: "Payment", allLabel: "Any payment status", options: PAYMENT_STATUS_OPTIONS },
    ...(showPaymentMethod
      ? [{ key: "paymentMethod" as const, label: "Method", allLabel: "Any method", options: PAYMENT_METHOD_OPTIONS }]
      : []),
    {
      key: "originCountry",
      label: "Origin",
      allLabel: "Any origin",
      options: facets.originCountries.map((code) => ({ value: code, label: countryLabel(code) })),
    },
    {
      key: "destinationCountry",
      label: "Destination",
      allLabel: "Any destination",
      options: facets.destinationCountries.map((code) => ({ value: code, label: countryLabel(code) })),
    },
  ];

  return (
    <div className="space-y-3" data-testid="shipment-filters">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
            data-testid="input-search-shipments"
          />
        </div>

        {showStatusSelect && (
          <Select value={filters.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger className="sm:w-[190px]" data-testid="select-filter-status">
              <SelectValue placeholder="Any status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SHIPMENT_FILTER_ALL}>Any status</SelectItem>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          variant={expanded ? "secondary" : "outline"}
          onClick={() => onExpandedChange(!expanded)}
          data-testid="button-toggle-filters"
          className="shrink-0"
        >
          <Filter className="mr-2 h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-2 px-1.5" data-testid="badge-active-filter-count">
              {activeCount}
            </Badge>
          )}
        </Button>
      </div>

      {expanded && (
        <div className="rounded-lg border border-border bg-muted/30 p-4" data-testid="panel-filters">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {selects.map(({ key, label, options, allLabel }) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <Select
                  value={filters[key] as string}
                  onValueChange={(v) => set(key, v as ShipmentFilters[typeof key])}
                >
                  <SelectTrigger data-testid={`select-filter-${key}`}>
                    <SelectValue placeholder={allLabel} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SHIPMENT_FILTER_ALL}>{allLabel}</SelectItem>
                    {options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="filter-date-from">
                Created from
              </Label>
              <Input
                id="filter-date-from"
                type="date"
                value={filters.dateFrom}
                max={filters.dateTo || undefined}
                onChange={(e) => set("dateFrom", e.target.value)}
                data-testid="input-filter-date-from"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="filter-date-to">
                Created to
              </Label>
              <Input
                id="filter-date-to"
                type="date"
                value={filters.dateTo}
                min={filters.dateFrom || undefined}
                onChange={(e) => set("dateTo", e.target.value)}
                data-testid="input-filter-date-to"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground" data-testid="text-filter-summary">
              {activeCount === 0
                ? "No filters applied."
                : `${activeCount} filter${activeCount === 1 ? "" : "s"} applied${
                    resultCount === undefined ? "" : ` · ${resultCount} match${resultCount === 1 ? "" : "es"}`
                  }.`}
            </p>
            <Button
              variant="ghost"
              size="sm"
              disabled={activeCount === 0}
              onClick={() => onChange({ ...DEFAULT_SHIPMENT_FILTERS })}
              data-testid="button-clear-filters"
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Clear all
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
