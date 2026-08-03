import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ClientLayout } from "@/components/client-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/loading-spinner";
import { SarAmount } from "@/components/sar-symbol";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, readJsonResponse } from "@/lib/queryClient";
import { PLATFORMS, platformMeta } from "@/lib/platform-meta";
import type { ClientAccount } from "@shared/schema";
import { Check, Copy, Plus, Settings, ArrowLeft, ArrowRight } from "lucide-react";

interface SalesChannel {
  id: string;
  platform: string;
  name: string;
  storeUrl: string | null;
  status: string;
  carrierMode?: string;
  lastSyncedAt: string | null;
  hasCredentials: boolean;
}

interface OrderRow {
  id: string;
  salesChannelId: string;
  status: string;
}

const WEBHOOK_BASE = `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/sales-channel`;

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)} d ago`;
}

// ── Connect wizard ───────────────────────────────────────────────────────────
const WIZARD_STEPS = ["Platform", "Authorize", "Sync", "Carrier", "Done"];

function PlatformIcon({ id, size = 26 }: { id: string; size?: number }) {
  const m = platformMeta(id);
  return (
    <div
      className="rounded-md grid place-items-center font-extrabold text-white flex-shrink-0"
      style={{ background: m.color, width: size, height: size, fontSize: size * 0.38 }}
    >
      {m.code}
    </div>
  );
}

export default function SalesChannelsPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { data: account } = useQuery<ClientAccount>({ queryKey: ["/api/client/account"] });
  const { data: channels, isLoading } = useQuery<SalesChannel[]>({ queryKey: ["/api/client/sales-channels"] });
  const { data: orders } = useQuery<OrderRow[]>({
    queryKey: ["/api/client/orders", "all"],
    queryFn: async () => readJsonResponse<OrderRow[]>(await apiRequest("GET", "/api/client/orders")),
  });

  const openByChannel = (id: string) =>
    (orders || []).filter((o) => o.salesChannelId === id && ["new", "assigned"].includes(o.status)).length;

  const stats = {
    connected: channels?.length || 0,
    awaiting: (orders || []).filter((o) => o.status === "new").length,
    assigned: (orders || []).filter((o) => o.status === "assigned").length,
    shipped: (orders || []).filter((o) => ["shipped", "delivered"].includes(o.status)).length,
  };

  // Wizard state
  const [open, setOpen] = useState(false);
  const [wStep, setWStep] = useState(1);
  const [platform, setPlatform] = useState("woocommerce");
  const [form, setForm] = useState({ name: "", storeUrl: "", consumer_key: "", consumer_secret: "" });
  const [sync, setSync] = useState({ importPaidOnly: "paid", onNewOrder: "review", pickup: "default" });
  const [carrierMode, setCarrierMode] = useState<"manual" | "auto">("manual");
  const [connected, setConnected] = useState<{ channelId: string; webhookSecret: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const meta = platformMeta(platform);

  const resetWizard = () => {
    setWStep(1);
    setPlatform("woocommerce");
    setForm({ name: "", storeUrl: "", consumer_key: "", consumer_secret: "" });
    setSync({ importPaidOnly: "paid", onNewOrder: "review", pickup: "default" });
    setCarrierMode("manual");
    setConnected(null);
  };
  const closeWizard = () => {
    setOpen(false);
    setTimeout(resetWizard, 200);
  };

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/client/sales-channels", {
        platform,
        name: form.name || form.storeUrl || meta.label,
        storeUrl: form.storeUrl,
        carrierMode,
        syncSettings: sync,
        credentials: { consumer_key: form.consumer_key, consumer_secret: form.consumer_secret },
      });
      return readJsonResponse<{ id: string; webhookSecret: string }>(res);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/sales-channels"] });
      setConnected({ channelId: data.id, webhookSecret: data.webhookSecret });
      setWStep(5);
    },
    onError: (error: Error) => toast({ title: "Connection failed", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/client/sales-channels/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/sales-channels"] });
      toast({ title: "Store disconnected" });
    },
  });

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  };

  const canAdvance = () => {
    if (wStep === 1) return meta.available;
    if (wStep === 2) return meta.auth !== "keys" || (form.consumer_key && form.consumer_secret && form.storeUrl);
    return true;
  };

  const nextLabel = wStep >= 4 ? "Connect" : "Next";
  const advance = () => {
    if (wStep < 4) return setWStep(wStep + 1);
    connectMutation.mutate();
  };

  return (
    <ClientLayout clientProfile={account?.profile}>
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
        {/* Hero banner */}
        <div
          className="rounded-2xl px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-white"
          style={{ background: "linear-gradient(90deg,#fe5200,#ff7a45)" }}
        >
          <div>
            <h2 className="text-lg font-bold mb-1">Connect your store, ship in clicks</h2>
            <p className="text-sm text-white/90 max-w-xl">
              Orders from Salla, Zid, Shopify, WooCommerce &amp; Magento flow into Ezhalha. You pick
              the carrier per order, or let rules do it.
            </p>
          </div>
          <Button variant="secondary" className="bg-white text-primary hover:bg-white/90 shrink-0"
            onClick={() => setOpen(true)} data-testid="button-connect-store">
            <Plus className="h-4 w-4 mr-2" /> Connect store
          </Button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { n: stats.connected, l: "Connected channels" },
            { n: stats.awaiting, l: "Orders awaiting" },
            { n: stats.assigned, l: "Assigned" },
            { n: stats.shipped, l: "Shipped" },
          ].map((s) => (
            <Card key={s.l}><CardContent className="p-5">
              <div className="text-2xl font-extrabold tabular-nums">{s.n}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.l}</div>
            </CardContent></Card>
          ))}
        </div>

        {/* Channel cards */}
        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(channels || []).map((channel) => {
              const reauth = channel.status === "error";
              return (
                <Card key={channel.id} data-testid={`card-channel-${channel.id}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PlatformIcon id={channel.platform} />
                        <div className="min-w-0">
                          <h3 className="font-semibold leading-tight truncate">{channel.name}</h3>
                          <p className="text-xs text-muted-foreground truncate">{channel.storeUrl || platformMeta(channel.platform).label}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className={reauth
                        ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                        : "bg-green-500/10 text-green-600 border-green-500/20"}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${reauth ? "bg-amber-500" : "bg-green-500"}`} />
                        {reauth ? "Reauth needed" : "Connected"}
                      </Badge>
                    </div>

                    <div className="my-4 space-y-0">
                      {[
                        ["Carrier mode", channel.carrierMode === "auto" ? "Auto (rules)" : "Manual"],
                        ["Last sync", relativeTime(channel.lastSyncedAt)],
                        ["Open orders", String(openByChannel(channel.id))],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between py-1.5 text-sm border-b border-dashed last:border-0">
                          <span className="text-muted-foreground text-xs">{k}</span>
                          <b className="text-sm">{v}</b>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate("/client/orders")}>
                        Orders
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1"
                        onClick={() => navigate(`/client/sales-channels/${channel.id}`)}>
                        <Settings className="h-3.5 w-3.5 mr-1.5" /> Settings
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Dashed add card */}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-xl border border-dashed flex flex-col items-center justify-center text-center p-6 gap-1 hover:border-primary hover:bg-primary/5 transition-colors min-h-[180px]"
              data-testid="button-connect-store-card"
            >
              <Plus className="h-7 w-7 text-muted-foreground" />
              <span className="font-semibold">Connect a store</span>
              <span className="text-xs text-muted-foreground">Salla · Zid · WooCommerce · Shopify · Magento · Custom API</span>
            </button>
          </div>
        )}
      </div>

      {/* Connect wizard */}
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : closeWizard())}>
        <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Connect a sales channel</DialogTitle></DialogHeader>

          {/* stepper */}
          <div className="flex items-center justify-center py-1">
            {WIZARD_STEPS.map((label, i) => {
              const n = i + 1;
              return (
                <div key={label} className="flex items-center">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${n <= wStep ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {n < wStep ? <Check className="h-4 w-4" /> : n}
                  </div>
                  {i < WIZARD_STEPS.length - 1 && <div className={`h-1 w-7 mx-1 rounded ${n < wStep ? "bg-primary" : "bg-muted"}`} />}
                </div>
              );
            })}
          </div>
          <p className="text-center text-sm text-muted-foreground mb-2">{WIZARD_STEPS[wStep - 1]}</p>

          {/* Step 1 — platform grid */}
          {wStep === 1 && (
            <div className="grid grid-cols-3 gap-2.5">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={!p.available}
                  onClick={() => setPlatform(p.id)}
                  className={`rounded-xl border p-3.5 text-center transition-colors ${
                    platform === p.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  } ${!p.available ? "opacity-40 cursor-not-allowed" : ""}`}
                  data-testid={`platform-${p.id}`}
                >
                  <div className="mx-auto mb-2"><PlatformIcon id={p.id} size={34} /></div>
                  <div className="text-sm font-medium">{p.label}</div>
                  {!p.available && <div className="text-[10px] text-muted-foreground mt-0.5">Coming soon</div>}
                </button>
              ))}
            </div>
          )}

          {/* Step 2 — authorize */}
          {wStep === 2 && (
            <div className="space-y-3">
              {meta.auth === "keys" ? (
                <>
                  <div className="space-y-1.5">
                    <Label>Store name</Label>
                    <Input value={form.name} placeholder="My Shop"
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} data-testid="input-channel-name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Store URL</Label>
                    <Input value={form.storeUrl} placeholder="shop.acme.com"
                      onChange={(e) => setForm((f) => ({ ...f, storeUrl: e.target.value }))} data-testid="input-channel-url" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Consumer key</Label>
                    <Input value={form.consumer_key} placeholder="ck_xxx"
                      onChange={(e) => setForm((f) => ({ ...f, consumer_key: e.target.value }))} data-testid="input-consumer-key" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Consumer secret</Label>
                    <Input type="password" value={form.consumer_secret} placeholder="cs_xxx"
                      onChange={(e) => setForm((f) => ({ ...f, consumer_secret: e.target.value }))} data-testid="input-consumer-secret" />
                  </div>
                  <p className="text-xs rounded-lg bg-blue-500/10 text-blue-600 p-3">
                    Generate a Read/Write REST API key in WooCommerce → Settings → Advanced → REST API.
                  </p>
                </>
              ) : (
                <p className="text-sm rounded-lg bg-amber-500/10 text-amber-600 p-3">
                  {meta.label} uses a platform OAuth app that isn't live yet. WooCommerce is available today.
                </p>
              )}
            </div>
          )}

          {/* Step 3 — sync settings */}
          {wStep === 3 && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Import which orders</Label>
                <select className="w-full h-10 rounded-md border px-3 text-sm bg-background"
                  value={sync.importPaidOnly} onChange={(e) => setSync((s) => ({ ...s, importPaidOnly: e.target.value }))}>
                  <option value="paid">Paid orders only (recommended)</option>
                  <option value="all">All orders</option>
                  <option value="tagged">Only orders tagged "ship"</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>On new order</Label>
                <select className="w-full h-10 rounded-md border px-3 text-sm bg-background"
                  value={sync.onNewOrder} onChange={(e) => setSync((s) => ({ ...s, onNewOrder: e.target.value }))}>
                  <option value="review">Add to inbox for review (recommended)</option>
                  <option value="auto">Auto-create shipment (auto mode only)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Default pickup location</Label>
                <select className="w-full h-10 rounded-md border px-3 text-sm bg-background"
                  value={sync.pickup} onChange={(e) => setSync((s) => ({ ...s, pickup: e.target.value }))}>
                  <option value="default">Account shipping address (default)</option>
                </select>
              </div>
            </div>
          )}

          {/* Step 4 — carrier mode */}
          {wStep === 4 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                {(["manual", "auto"] as const).map((mode) => (
                  <button key={mode} type="button" onClick={() => setCarrierMode(mode)}
                    className={`rounded-xl border p-3.5 text-left transition-colors ${carrierMode === mode ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                    <div className="font-semibold capitalize">{mode}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {mode === "manual" ? "You pick a carrier per order (default)" : "Use assignment rules"}
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs rounded-lg bg-primary/10 text-primary p-3">
                Change this any time. Auto uses your Assignment Rules; manual lets you compare carriers per order.
                Either way you pay with Tap or credit — no COD.
              </p>
            </div>
          )}

          {/* Step 5 — connected */}
          {wStep === 5 && connected && (
            <div className="space-y-3">
              <div className="text-center py-2">
                <div className="mx-auto h-14 w-14 rounded-full bg-green-100 text-green-600 grid place-items-center mb-2">
                  <Check className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-bold">{meta.label} connected</h3>
                <p className="text-sm text-muted-foreground">Add this webhook to your store to import orders. Secret shown once.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Delivery URL</Label>
                <div className="flex gap-2">
                  <Input readOnly value={`${WEBHOOK_BASE}/${platform}?channel=${connected.channelId}`} className="font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={() => copy(`${WEBHOOK_BASE}/${platform}?channel=${connected.channelId}`, "url")}>
                    {copied === "url" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Signing secret</Label>
                <div className="flex gap-2">
                  <Input readOnly value={connected.webhookSecret} className="font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={() => copy(connected.webhookSecret, "secret")}>
                    {copied === "secret" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="sm:justify-between gap-2">
            {wStep === 5 ? (
              <Button className="w-full" onClick={closeWizard} data-testid="button-done-connect">Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => (wStep === 1 ? closeWizard() : setWStep(wStep - 1))}>
                  <ArrowLeft className="h-4 w-4 mr-1.5" /> {wStep === 1 ? "Cancel" : "Back"}
                </Button>
                <Button onClick={advance} disabled={!canAdvance() || connectMutation.isPending} data-testid="button-wizard-next">
                  {connectMutation.isPending ? "Connecting…" : (
                    <>{nextLabel} <ArrowRight className="h-4 w-4 ml-1.5" /></>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientLayout>
  );
}
