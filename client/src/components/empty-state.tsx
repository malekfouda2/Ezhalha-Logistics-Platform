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
        "flex flex-col items-center justify-center py-16 px-4 text-center",
        className
      )}
      data-testid="empty-state"
    >
      <div className="p-4 rounded-full bg-muted mb-4">
        <Icon className="h-10 w-10 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-sm mb-6">{description}</p>
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
