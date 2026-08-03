import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ClientLayout } from "@/components/client-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, readJsonResponse } from "@/lib/queryClient";
import { platformMeta } from "@/lib/platform-meta";
import type { ClientAccount } from "@shared/schema";
import { ArrowLeft, Link2, Settings, RefreshCw } from "lucide-react";

interface SalesChannel {
  id: string;
  platform: string;
  name: string;
  storeUrl: string | null;
  status: string;
  carrierMode?: string;
  lastSyncedAt: string | null;
  syncSettings: { importPaidOnly?: string; onNewOrder?: string; pickup?: string } | null;
}

const WEBHOOK_BASE = `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/sales-channel`;

export default function SalesChannelDetail() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/client/sales-channels/:id");
  const id = params?.id;
  const { data: account } = useQuery<ClientAccount>({ queryKey: ["/api/client/account"] });

  const { data: channels, isLoading } = useQuery<SalesChannel[]>({ queryKey: ["/api/client/sales-channels"] });
  const channel = channels?.find((c) => c.id === id);
  const meta = channel ? platformMeta(channel.platform) : null;

  const [carrierMode, setCarrierMode] = useState<"manual" | "auto">("manual");
  const [sync, setSync] = useState({ importPaidOnly: "paid", onNewOrder: "review", pickup: "default" });

  useEffect(() => {
    if (!channel) return;
    setCarrierMode((channel.carrierMode as "manual" | "auto") || "manual");
    setSync({
      importPaidOnly: channel.syncSettings?.importPaidOnly || "paid",
      onNewOrder: channel.syncSettings?.onNewOrder || "review",
      pickup: channel.syncSettings?.pickup || "default",
    });
  }, [channel]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/client/sales-channels/${id}`, { carrierMode, syncSettings: sync });
      return readJsonResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/sales-channels"] });
      toast({ title: "Settings saved" });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/client/sales-channels/${id}/sync`, {});
      return readJsonResponse<{ imported: number }>(res);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/sales-channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/orders"] });
      toast({
        title: "Sync complete",
        description: data.imported > 0 ? `Pulled ${data.imported} order(s) into your inbox.` : "No new orders since last sync.",
      });
    },
    onError: (e: Error) => toast({ title: "Sync failed", description: e.message, variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/client/sales-channels/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/sales-channels"] });
      toast({ title: "Store disconnected" });
      navigate("/client/sales-channels");
    },
  });

  if (isLoading) {
    return <ClientLayout clientProfile={account?.profile}><div className="flex justify-center py-24"><LoadingSpinner /></div></ClientLayout>;
  }
  if (!channel || !meta) {
    return (
      <ClientLayout clientProfile={account?.profile}>
        <div className="p-6 max-w-4xl mx-auto">
          <Button variant="ghost" onClick={() => navigate("/client/sales-channels")}><ArrowLeft className="h-4 w-4 mr-1.5" /> Back</Button>
          <p className="text-muted-foreground mt-4">Channel not found.</p>
        </div>
      </ClientLayout>
    );
  }

  const selectClass = "w-full h-10 rounded-md border px-3 text-sm bg-background";

  return (
    <ClientLayout clientProfile={account?.profile}>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/client/sales-channels")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Sales Channels
        </Button>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-lg grid place-items-center font-extrabold text-white flex-shrink-0"
              style={{ background: meta.color, width: 42, height: 42, fontSize: 13 }}>{meta.code}</div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold truncate">{meta.label} — {channel.name}</h1>
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">Connected</Badge>
            </div>
          </div>
          <Button variant="outline" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
            Disconnect
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Settings */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2 font-semibold"><Settings className="h-4 w-4" /> Channel settings</div>

              <div className="space-y-2">
                <Label>Carrier assignment mode</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["manual", "auto"] as const).map((mode) => (
                    <button key={mode} type="button" onClick={() => setCarrierMode(mode)}
                      className={`rounded-lg border p-3 text-left transition-colors ${carrierMode === mode ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                      <div className="font-medium capitalize text-sm">{mode}</div>
                      <div className="text-xs text-muted-foreground">{mode === "manual" ? "you pick per order" : "use rules"}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Which orders to import</Label>
                <select className={selectClass} value={sync.importPaidOnly} onChange={(e) => setSync((s) => ({ ...s, importPaidOnly: e.target.value }))}>
                  <option value="paid">Paid orders only</option>
                  <option value="all">All orders</option>
                  <option value="tagged">Only tagged "ship"</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>On new order</Label>
                <select className={selectClass} value={sync.onNewOrder} onChange={(e) => setSync((s) => ({ ...s, onNewOrder: e.target.value }))}>
                  <option value="review">Add to inbox for review (recommended)</option>
                  <option value="auto">Auto-create shipment (auto mode only)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Default pickup location</Label>
                <select className={selectClass} value={sync.pickup} onChange={(e) => setSync((s) => ({ ...s, pickup: e.target.value }))}>
                  <option value="default">Account shipping address (default)</option>
                </select>
              </div>

              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Save settings"}
              </Button>
            </CardContent>
          </Card>

          {/* Connection */}
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold"><Link2 className="h-4 w-4" /> Connection</div>
                <Button size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                  {syncMutation.isPending ? "Syncing…" : "Sync now"}
                </Button>
              </div>
              <div className="flex justify-between py-1.5 text-sm border-b border-dashed gap-3">
                <span className="text-muted-foreground text-xs">Store URL</span>
                <b className="text-[11px] font-mono truncate">{channel.storeUrl || "—"}</b>
              </div>
              <div className="flex justify-between py-1.5 text-sm border-b border-dashed">
                <span className="text-muted-foreground text-xs">Sync status</span>
                <Badge variant="outline" className={channel.lastSyncedAt
                  ? "bg-green-500/10 text-green-600 border-green-500/20"
                  : "bg-muted text-muted-foreground"}>
                  {channel.lastSyncedAt ? "Active" : "Not synced yet"}
                </Badge>
              </div>
              <div className="flex justify-between py-1.5 text-sm">
                <span className="text-muted-foreground text-xs">Last sync</span>
                <b className="text-sm">{channel.lastSyncedAt ? new Date(channel.lastSyncedAt).toLocaleString() : "—"}</b>
              </div>
              <p className="text-xs rounded-lg bg-blue-500/10 text-blue-600 p-3">
                Orders are pulled automatically from your store every few minutes using the API key you
                provided — no webhook setup needed. Use <b>Sync now</b> to pull immediately.
              </p>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">Advanced: push webhook (optional, instant)</summary>
                <p className="mt-2">Point a signed WooCommerce webhook here for instant delivery in addition to polling:</p>
                <div className="text-[11px] font-mono text-muted-foreground break-all rounded-md bg-muted p-2 mt-1">
                  {WEBHOOK_BASE}/{channel.platform}?channel={channel.id}
                </div>
              </details>
            </CardContent>
          </Card>
        </div>
      </div>
    </ClientLayout>
  );
}
