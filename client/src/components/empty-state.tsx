import { cn } from "@/lib/utils";
import { type LucideIcon, Package, FileText, Users, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-4 py-16 text-center animate-fade-up",
        className
      )}
      data-testid="empty-state"
    >
      <div className="relative mb-5">
        <div className="absolute inset-0 rounded-2xl bg-primary/15 blur-xl" />
        <div className="relative rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 p-5 ring-1 ring-inset ring-primary/15">
          <Icon className="h-10 w-10 text-primary" />
        </div>
      </div>
      <h3 className="mb-2 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mb-6 max-w-sm text-muted-foreground">{description}</p>
      {action && (
        <Button onClick={action.onClick} data-testid="button-empty-action">
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function NoShipments({ onCreateNew }: { onCreateNew?: () => void }) {
  return (
    <EmptyState
      icon={Package}
      title="No shipments yet"
      description="Create your first shipment to get started with ezhalha logistics."
      action={onCreateNew ? { label: "Create Shipment", onClick: onCreateNew } : undefined}
    />
  );
}

export function NoInvoices() {
  return (
    <EmptyState
      icon={FileText}
      title="No invoices yet"
      description="Invoices will appear here once you have completed shipments."
    />
  );
}

export function NoClients({ onCreateNew }: { onCreateNew?: () => void }) {
  return (
    <EmptyState
      icon={Users}
      title="No clients yet"
      description="Client accounts will appear here once applications are approved."
      action={onCreateNew ? { label: "View Applications", onClick: onCreateNew } : undefined}
    />
  );
}

export function NoApplications() {
  return (
    <EmptyState
      icon={Inbox}
      title="No pending applications"
      description="New client applications will appear here for review."
    />
  );
}
