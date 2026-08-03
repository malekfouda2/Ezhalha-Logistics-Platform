import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number | ReactNode;
  icon: LucideIcon;
  trend?: {
    value: number;
    label: string;
  };
  className?: string;
}

export function StatCard({ title, value, icon: Icon, trend, className }: StatCardProps) {
  const isPositiveTrend = trend && trend.value >= 0;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-card-border bg-card p-6",
        "shadow-sm transition-all duration-300 ease-out",
        "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30",
        className,
      )}
      data-testid={`stat-card-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {/* Top-lit gradient wash + accent bar for depth */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/5 blur-2xl transition-opacity duration-300 group-hover:opacity-80 opacity-0" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          <p
            className="mt-2.5 truncate text-[1.75rem] font-bold leading-none tracking-tight tabular-nums"
            data-testid={`stat-${title.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {value}
          </p>
          {trend && (
            <div className="mt-3 flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold",
                  isPositiveTrend
                    ? "bg-green-500/12 text-green-600 dark:text-green-400"
                    : "bg-red-500/12 text-red-600 dark:text-red-400",
                )}
              >
                {isPositiveTrend ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" />
                )}
                {isPositiveTrend ? "+" : ""}
                {trend.value}%
              </span>
              <span className="truncate text-xs text-muted-foreground">{trend.label}</span>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 p-3 ring-1 ring-inset ring-primary/15 transition-transform duration-300 group-hover:scale-105">
          <Icon className="h-6 w-6 text-primary" />
        </div>
      </div>
    </div>
  );
}
