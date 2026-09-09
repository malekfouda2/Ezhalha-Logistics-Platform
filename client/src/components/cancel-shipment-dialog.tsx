import { useState, type ReactNode } from "react";
import { AlertTriangle, Ban, Loader2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { describeCancellationConsequences } from "@shared/cancellation";

/**
 * Confirmation gate for cancelling a shipment.
 *
 * Cancelling is irreversible and moves money: the server cancels the waybill with the carrier,
 * releases any booked courier pickup, and then either refunds the client automatically or opens a
 * refund request for approval — depending on whether the goods have already been collected. None
 * of that should happen on a single stray click, and the person clicking should be told which of
 * the two refund paths they are about to trigger.
 *
 * The booked/collected test comes from `@shared/domain`, the same helper the server uses to
 * decide, so this dialog cannot promise an automatic refund that the server then routes to manual
 * approval.
 */
export function CancelShipmentDialog({
  trackingNumber,
  carrierStatus,
  carrierName,
  hasPickupBooked,
  isPending,
  onConfirm,
  children,
}: {
  trackingNumber: string;
  /** Carrier status, used to work out whether the refund is automatic. */
  carrierStatus?: string | null;
  carrierName?: string | null;
  /** Whether a courier pickup is booked and will be released. */
  hasPickupBooked?: boolean;
  isPending?: boolean;
  onConfirm: () => void;
  /** The destructive button that opens this dialog. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { effects } = describeCancellationConsequences({ carrierStatus, carrierName, hasPickupBooked });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent data-testid="dialog-confirm-cancel-shipment">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Cancel shipment {trackingNumber}?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>This cannot be undone. A cancelled shipment cannot be reinstated — it has to be created again from scratch.</p>

              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                <p className="mb-2 font-medium text-foreground">What happens next</p>
                <ul className="list-disc space-y-1 pl-4">
                  {effects.map((effect) => (
                    <li key={effect}>{effect}</li>
                  ))}
                </ul>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} data-testid="button-keep-shipment">
            Keep shipment
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isPending}
            data-testid="button-confirm-cancel-shipment"
            onClick={(event) => {
              // Keep the dialog mounted while the request is in flight so the pending state is
              // visible; the caller closes it by unmounting or on success.
              event.preventDefault();
              onConfirm();
              setOpen(false);
            }}
          >
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
            Cancel shipment
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
