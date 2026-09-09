import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserPlus, Lock } from "lucide-react";

/**
 * The one wall in guest mode.
 *
 * Guests walk the entire product and see a real live rate; this is the single point where they
 * are asked for an account, and it sits exactly where the money is. Modelled on
 * `SalesFeatureGate` — the portal chrome stays, and only the transacting panel is replaced.
 */
export function GuestCheckoutGate({
  title = "Create an account to finalize this shipment",
  description = "Your shipment details are saved. Register and you'll pick up right where you left off.",
  quote,
  onRegister,
}: {
  title?: string;
  description?: string;
  quote?: { carrierName: string; serviceName: string; totalSar: number; currency: string } | null;
  onRegister?: () => void;
}) {
  const [, navigate] = useLocation();

  const handleRegister = () => {
    if (onRegister) {
      onRegister();
      return;
    }
    navigate("/apply?resume=1");
  };

  return (
    <Card className="border-primary/30" data-testid="guest-checkout-gate">
      <CardContent className="flex flex-col items-center gap-5 p-8 text-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-2xl bg-primary/15 blur-xl" />
          <div className="relative rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 p-4 ring-1 ring-inset ring-primary/15">
            <Lock className="h-7 w-7 text-primary" />
          </div>
        </div>

        <div className="space-y-1">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>
        </div>

        {quote && (
          <div className="w-full max-w-sm rounded-lg border bg-muted/40 p-4 text-left">
            <div className="flex items-baseline justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{quote.carrierName}</p>
                <p className="truncate text-xs text-muted-foreground">{quote.serviceName}</p>
              </div>
              <p className="shrink-0 text-lg font-semibold tabular-nums">
                {quote.currency} {quote.totalSar.toFixed(2)}
              </p>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Indicative price, quoted at our standard individual rate. We'll confirm the exact
              total against your account before you pay.
            </p>
          </div>
        )}

        <Button size="lg" onClick={handleRegister} data-testid="button-guest-register">
          <UserPlus className="mr-2 h-4 w-4" />
          Create an account
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Stands in for a page that only means something once you have an account.
 *
 * Settings and Team are the two: both are about administering an account, so for a guest they
 * would otherwise render editable forms over placeholder data — a fabricated "Member Since"
 * of today, an account status of Active, and Save buttons that can only 401. Showing the real
 * page there would be a small lie, so the page says what it is for instead.
 *
 * Deliberately keeps the full portal chrome, exactly like `SalesFeatureGate`.
 */
export function GuestPagePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const [, navigate] = useLocation();
  return (
    <div
      className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center p-6 text-center"
      data-testid="guest-page-placeholder"
    >
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-2xl bg-primary/15 blur-xl" />
        <div className="relative rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 p-5 ring-1 ring-inset ring-primary/15">
          <Lock className="h-8 w-8 text-primary" />
        </div>
      </div>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <Button className="mt-6" onClick={() => navigate("/apply?resume=1")}>
        <UserPlus className="mr-2 h-4 w-4" />
        Create an account
      </Button>
    </div>
  );
}
