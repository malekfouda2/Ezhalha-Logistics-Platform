import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

type StatusColor = "gray" | "purple" | "cyan" | "amber" | "blue" | "green" | "red" | "orange";

// Full class strings per color (Tailwind needs literal classes, no interpolation).
const colorStyles: Record<StatusColor, { pill: string; dot: string }> = {
  gray: { pill: "bg-gray-500/10 text-gray-600 ring-gray-500/20 dark:text-gray-300", dot: "bg-gray-500" },
  purple: { pill: "bg-purple-500/10 text-purple-700 ring-purple-500/20 dark:text-purple-300", dot: "bg-purple-500" },
  cyan: { pill: "bg-cyan-500/10 text-cyan-700 ring-cyan-500/20 dark:text-cyan-300", dot: "bg-cyan-500" },
  amber: { pill: "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300", dot: "bg-amber-500" },
  blue: { pill: "bg-blue-500/10 text-blue-700 ring-blue-500/20 dark:text-blue-300", dot: "bg-blue-500" },
  green: { pill: "bg-green-500/10 text-green-700 ring-green-500/20 dark:text-green-300", dot: "bg-green-500" },
  red: { pill: "bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-300", dot: "bg-red-500" },
  orange: { pill: "bg-orange-500/10 text-orange-700 ring-orange-500/20 dark:text-orange-300", dot: "bg-orange-500" },
};

const statusColors: Record<string, StatusColor> = {
  draft: "gray",
  payment_pending: "purple",
  created: "cyan",
  processing: "amber",
  picked_up: "blue",
  in_transit: "blue",
  customs_clearance: "amber",
  out_for_delivery: "blue",
  on_hold: "orange",
  returned: "orange",
  delivered: "green",
  cancelled: "red",
  carrier_error: "orange",
  pending: "amber",
  approved: "green",
  rejected: "red",
  completed: "green",
  failed: "red",
  active: "green",
  inactive: "gray",
  paid: "green",
  unpaid: "amber",
  refunded: "blue",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  payment_pending: "Awaiting Payment",
  created: "Booked",
  processing: "Processing",
  picked_up: "Picked Up",
  in_transit: "In Transit",
  customs_clearance: "Customs Clearance",
  out_for_delivery: "Out for Delivery",
  on_hold: "On Hold",
  returned: "Returned to Shipper",
  delivered: "Delivered",
  cancelled: "Cancelled",
  carrier_error: "Carrier Error",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
  failed: "Failed",
  active: "Active",
  inactive: "Inactive",
  paid: "Paid",
  unpaid: "Unpaid",
  refunded: "Refunded",
};

// Statuses whose dot pulses to signal ongoing activity.
const liveStatuses = new Set(["processing", "picked_up", "in_transit", "out_for_delivery", "payment_pending", "pending"]);

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const color = statusColors[status] || "amber";
  const { pill, dot } = colorStyles[color];
  const label = statusLabels[status] || status;
  const isLive = liveStatuses.has(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        pill,
        className,
      )}
      data-testid={`badge-status-${status}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {isLive && (
          <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", dot)} />
        )}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", dot)} />
      </span>
      {label}
    </span>
  );
}
