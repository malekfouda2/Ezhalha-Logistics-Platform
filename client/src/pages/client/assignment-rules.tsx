import { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, readJsonResponse } from "@/lib/queryClient";
import type { ClientAccount } from "@shared/schema";
import { Plus, GripVertical, Star, Trash2 } from "lucide-react";

interface Rule {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  conditions: string | null;
  strategy: string;
  carrierCode: string | null;
}

const LOCAL_CARRIERS = ["SMSA", "Naqel", "Zajil", "SPL", "iMile"];
const selectClass = "w-full h-10 rounded-md border px-3 text-sm bg-background";

function conditionSummary(conditions: string | null): string {
  if (!conditions) return "Any order";
  try {
    const c = JSON.parse(conditions);
    const parts: string[] = [];
    if (c.weight && c.weight !== "any") parts.push(`weight ${c.weight}`);
    if (c.region && c.region !== "any") parts.push(`region ${c.region}`);
    if (c.value && c.value !== "any") parts.push(`value ${c.value}`);
    if (c.channel && c.channel !== "any") parts.push(`channel ${c.channel}`);
    return parts.length ? `If ${parts.join(" · ")}` : "Any order";
  } catch {
    return "Any order";
  }
}

export default function AssignmentRulesPage() {
  const { toast } = useToast();
  const { data: account } = useQuery<ClientAccount>({ queryKey: ["/api/client/account"] });
  const { data: rules, isLoading } = useQuery<Rule[]>({ queryKey: ["/api/client/carrier-rules"] });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", weight: "any", region: "any", value: "any", channel: "any",
    strategy: "specific_carrier", carrierCode: "SMSA",
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const conditions = { weight: form.weight, region: form.region, value: form.value, channel: form.channel };
      return readJsonResponse(await apiRequest("POST", "/api/client/carrier-rules", {
        name: form.name,
        priority: (rules?.length || 0) + 1,
        enabled: true,
        conditions: JSON.stringify(conditions),
        strategy: form.strategy,
        carrierCode: form.strategy === "specific_carrier" ? form.carrierCode : null,
      }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/carrier-rules"] });
      setOpen(false);
      setForm({ name: "", weight: "any", region: "any", value: "any", channel: "any", strategy: "specific_carrier", carrierCode: "SMSA" });
      toast({ title: "Rule added" });
    },
    onError: (e: Error) => toast({ title: "Failed to add rule", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async (rule: Rule) =>
      apiRequest("PATCH", `/api/client/carrier-rules/${rule.id}`, { enabled: !rule.enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/client/carrier-rules"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/client/carrier-rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/carrier-rules"] });
      toast({ title: "Rule removed" });
    },
  });

  return (
    <ClientLayout clientProfile={account?.profile}>
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Sales Channels / Assignment Rules</p>
            <h1 className="text-2xl font-bold">Carrier assignment rules</h1>
            <p className="text-muted-foreground text-sm max-w-2xl">
              Used only by channels set to <b>Auto</b>. Evaluated top-down; first match wins, else the default applies.
            </p>
          </div>
          <Button onClick={() => setOpen(true)} data-testid="button-add-rule"><Plus className="h-4 w-4 mr-2" /> Add rule</Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : (
          <div className="space-y-2.5">
            {(rules || []).map((rule) => (
              <div key={rule.id} className="flex items-center gap-3 rounded-xl border bg-card p-4" data-testid={`rule-${rule.id}`}>
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <b className="block truncate">{rule.name}</b>
                  <div className="text-xs text-muted-foreground truncate">{conditionSummary(rule.conditions)}</div>
                </div>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                  {rule.strategy === "specific_carrier" ? rule.carrierCode : rule.strategy === "cheapest" ? "Cheapest" : "Fastest"}
                </Badge>
                <Button variant="outline" size="sm" onClick={() => toggleMutation.mutate(rule)}
                  className={rule.enabled ? "text-green-600" : "text-muted-foreground"}>
                  {rule.enabled ? "On" : "Off"}
                </Button>
                <Button variant="ghost" size="icon" className="text-red-600" onClick={() => deleteMutation.mutate(rule.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {/* default fallback (static) */}
            <div className="flex items-center gap-3 rounded-xl border border-dashed p-4">
              <Star className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <b>Default → Cheapest</b>
                <div className="text-xs text-muted-foreground">When nothing matches · live rate compare</div>
              </div>
              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">Cheapest</Badge>
            </div>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New assignment rule</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Rule name</Label>
              <Input value={form.name} placeholder="e.g. Heavy parcels → Naqel"
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} data-testid="input-rule-name" />
            </div>
            <Label className="font-semibold">Conditions (all must match)</Label>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <Label className="text-xs">Weight</Label>
                <select className={selectClass} value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}>
                  <option value="any">Any</option><option value="≥5kg">≥ 5 kg</option><option value="<1kg">&lt; 1 kg</option><option value="1-5kg">1–5 kg</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Destination region</Label>
                <select className={selectClass} value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}>
                  <option value="any">Any</option><option value="central">Central (Riyadh)</option><option value="western">Western (Jeddah/Mecca)</option><option value="eastern">Eastern (Dammam)</option><option value="south">South (Abha/Jazan)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Order value</Label>
                <select className={selectClass} value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}>
                  <option value="any">Any</option><option value="≥500">≥ SAR 500</option><option value="<200">&lt; SAR 200</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Channel</Label>
                <select className={selectClass} value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}>
                  <option value="any">Any</option><option value="salla">Salla</option><option value="woocommerce">WooCommerce</option><option value="zid">Zid</option>
                </select>
              </div>
            </div>
            <Label className="font-semibold">Then assign</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["specific_carrier", "cheapest", "fastest"] as const).map((s) => (
                <button key={s} type="button" onClick={() => setForm((f) => ({ ...f, strategy: s }))}
                  className={`rounded-lg border p-2.5 text-sm font-medium capitalize transition-colors ${form.strategy === s ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted/50"}`}>
                  {s === "specific_carrier" ? "Specific carrier" : s}
                </button>
              ))}
            </div>
            {form.strategy === "specific_carrier" && (
              <div className="space-y-1.5">
                <Label>Carrier</Label>
                <select className={selectClass} value={form.carrierCode} onChange={(e) => setForm((f) => ({ ...f, carrierCode: e.target.value }))}>
                  {LOCAL_CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.name || createMutation.isPending} data-testid="button-save-rule">
              {createMutation.isPending ? "Saving…" : "Save rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientLayout>
  );
}
