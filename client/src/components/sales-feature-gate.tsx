import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ClientLayout } from "@/components/client-layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, readJsonResponse } from "@/lib/queryClient";
import { Store, Clock, CheckCircle2, XCircle } from "lucide-react";

interface SalesFeatureStatus {
  enabled: boolean;
  request: { status: string; reason?: string | null; adminNotes?: string | null } | null;
}

/**
 * Gates the bundled Sales Channels feature (Orders / Sales Channels / Assignment Rules).
 * Renders `children` when enabled; otherwise a request-access screen.
 */
export function SalesFeatureGate({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const { data, isLoading } = useQuery<SalesFeatureStatus>({
    queryKey: ["/api/client/sales-features"],
  });

  const requestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/client/sales-features/request", { reason });
      return readJsonResponse(res);
    },
    onSuccess: () => {
      toast({ title: "Request submitted", description: "Our team will review it shortly." });
      queryClient.invalidateQueries({ queryKey: ["/api/client/sales-features"] });
    },
    onError: (error) => toast({ title: "Could not submit request", description: error instanceof Error ? error.message : "Try again", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <ClientLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      </ClientLayout>
    );
  }

  if (data?.enabled) {
    return <>{children}</>;
  }

  const status = data?.request?.status;

  return (
    <ClientLayout>
      <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center p-6 text-center animate-fade-up">
        <div className="relative mb-6">
          <div className="absolute inset-0 rounded-2xl bg-primary/15 blur-xl" />
          <div className="relative rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 p-5 ring-1 ring-inset ring-primary/15">
            <Store className="h-10 w-10 text-primary" />
          </div>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Sales Channels</h1>
        <p className="mt-2 max-w-md text-muted-foreground">
          Connect Shopify, Salla, Zid and more — import orders, fulfil them into shipments, and set carrier
          assignment rules. This feature is available on request.
        </p>

        {status === "pending" ? (
          <div className="mt-8 flex w-full max-w-md items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-left">
            <Clock className="h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-700 dark:text-amber-400">Request pending</p>
              <p className="text-sm text-muted-foreground">Your request is under review. We'll email you once it's approved.</p>
            </div>
          </div>
        ) : status === "rejected" ? (
          <div className="mt-8 w-full max-w-md space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-left">
              <XCircle className="h-5 w-5 shrink-0 text-red-600" />
              <div>
                <p className="font-semibold text-red-700 dark:text-red-400">Previous request declined</p>
                {data?.request?.adminNotes && <p className="text-sm text-muted-foreground">{data.request.adminNotes}</p>}
              </div>
            </div>
            <Textarea placeholder="Add a note for the team (optional)" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            <Button className="w-full" disabled={requestMutation.isPending} onClick={() => requestMutation.mutate()}>
              {requestMutation.isPending ? <LoadingSpinner size="sm" className="mr-2" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Request again
            </Button>
          </div>
        ) : (
          <div className="mt-8 w-full max-w-md space-y-4">
            <Textarea placeholder="Tell us how you'll use it (optional)" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            <Button className="w-full" disabled={requestMutation.isPending} onClick={() => requestMutation.mutate()} data-testid="button-request-sales-feature">
              {requestMutation.isPending ? <LoadingSpinner size="sm" className="mr-2" /> : <Store className="mr-2 h-4 w-4" />}
              Request access
            </Button>
            <p className="text-xs text-muted-foreground">Only your account's primary contact can submit a request.</p>
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
