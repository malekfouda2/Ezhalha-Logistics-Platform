import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-10 w-10",
};

export function LoadingSpinner({ size = "md", className }: LoadingSpinnerProps) {
  return (
    <Loader2
      className={cn("animate-spin text-primary", sizeClasses[size], className)}
      data-testid="loading-spinner"
    />
  );
}

export function LoadingScreen({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 animate-fade-in">
      <div className="relative flex items-center justify-center">
        <div className="absolute h-16 w-16 rounded-full bg-primary/15 blur-xl" />
        <div className="absolute h-14 w-14 rounded-full border-2 border-primary/15" />
        <LoadingSpinner size="lg" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6 p-6 animate-fade-in">
      <div className="skeleton-shimmer h-8 w-48 rounded-md bg-muted/70" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton-shimmer h-32 rounded-xl bg-muted/70" />
        ))}
      </div>
      <div className="skeleton-shimmer h-64 rounded-xl bg-muted/70" />
    </div>
  );
}
