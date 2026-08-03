import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/searchable-select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertCircle, Pencil, Plus, Trash2, X } from "lucide-react";

type Tier = {
  id: string;
  carrierCode: string;
  minWeightKg: string;
  maxWeightKg?: string | null;
  baseRateSar?: string | null;
  markupType: "percent" | "flat";
  markupValue: string;
  minCharge?: string | null;
  clientProfile?: string | null;
  enabled: boolean;
};

const BASE_CARRIER_OPTIONS = [
  { value: "SMSA", label: "SMSA Express" },
  { value: "NAQEL", label: "Naqel Express" },
  { value: "JT", label: "J&T Express" },
  { value: "REDBOX", label: "RedBox" },
  { value: "ZAJIL", label: "Zajil Express" },
  { value: "IMILE", label: "iMile" },
];

const MARKUP_OPTIONS = [
  { value: "percent", label: "Percent (%)" },
  { value: "flat", label: "Flat (SAR)" },
];

const PROFILE_OPTIONS = [
  { value: "", label: "Any profile" },
  { value: "regular", label: "Regular" },
  { value: "mid_level", label: "Mid level" },
  { value: "vip", label: "VIP" },
];

const blankTier = {
  carrierCode: "SMSA",
  minWeightKg: "0",
  maxWeightKg: "",
  baseRateSar: "",
  markupType: "percent",
  markupValue: "0",
  minCharge: "",
  clientProfile: "",
  enabled: true,
};

type VirtualCarrierOption = { code: string; name: string };

export function LocalCarriersTab() {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Record<string, any>>(blankTier);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const { data: tiers = [] } = useQuery<Tier[]>({ queryKey: ["/api/admin/local-pricing"] });
  const { data: virtualCarriers = [] } = useQuery<VirtualCarrierOption[]>({ queryKey: ["/api/admin/virtual-carriers"] });

  // Virtual carriers (Fizzpa/Shipox couriers) are priced with their own rate card here,
  // keyed by the virtual carrier code — so they must be selectable alongside real carriers.
  const CARRIER_OPTIONS = [
    ...BASE_CARRIER_OPTIONS,
    ...virtualCarriers.map((c) => ({ value: c.code, label: `${c.name} (virtual)` })),
  ];
  const carrierName = (code: string) => CARRIER_OPTIONS.find((c) => c.value === code)?.label || code;

  const toPayload = (values: Record<string, any>) => ({
    carrierCode: values.carrierCode,
    minWeightKg: String(values.minWeightKg || "0"),
    maxWeightKg: values.maxWeightKg === "" || values.maxWeightKg == null ? null : String(values.maxWeightKg),
    baseRateSar: values.baseRateSar === "" || values.baseRateSar == null ? null : String(values.baseRateSar),
    markupType: values.markupType,
    markupValue: String(values.markupValue || "0"),
    minCharge: values.minCharge === "" || values.minCharge == null ? null : String(values.minCharge),
    clientProfile: values.clientProfile === "" ? null : values.clientProfile,
    enabled: values.enabled,
  });

  const save = useMutation({
    mutationFn: async (values: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/admin/local-pricing", toPayload(values));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/local-pricing"] });
      setDraft(blankTier);
      setFormError("");
      toast({ title: "Pricing tier added" });
    },
    onError: (error: Error) => {
      setFormError(error.message);
      toast({ title: "Could not add tier", description: error.message, variant: "destructive" });
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/admin/local-pricing/${id}`, values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/local-pricing"] });
      setEditingId(null);
      setDraft(blankTier);
      setFormError("");
      toast({ title: "Pricing tier updated" });
    },
    onError: (error: Error) => {
      setFormError(error.message);
      toast({ title: "Could not update tier", description: error.message, variant: "destructive" });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/local-pricing/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/local-pricing"] }),
    onError: (error: Error) => toast({ title: "Could not delete tier", description: error.message, variant: "destructive" }),
  });

  const field = (key: string, label: string, type = "text", placeholder = "") => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type={type} placeholder={placeholder} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
    </div>
  );

  const selectField = (key: string, label: string, options: { value: string; label: string }[]) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <SearchableSelect
        value={draft[key]}
        onValueChange={(value) => setDraft({ ...draft, [key]: value })}
        options={options}
        placeholder="Select"
        searchPlaceholder="Search..."
      />
    </div>
  );

  const editTier = (tier: Tier) => {
    setEditingId(tier.id);
    setDraft({
      ...blankTier,
      ...tier,
      maxWeightKg: tier.maxWeightKg ?? "",
      baseRateSar: tier.baseRateSar ?? "",
      minCharge: tier.minCharge ?? "",
      clientProfile: tier.clientProfile ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetDraft = () => {
    setEditingId(null);
    setDraft(blankTier);
    setFormError("");
  };

  const submitDraft = () => {
    setFormError("");
    if (!draft.carrierCode) {
      setFormError("Select a carrier.");
      return;
    }
    if (draft.maxWeightKg !== "" && Number(draft.maxWeightKg) <= Number(draft.minWeightKg)) {
      setFormError("Max weight must be greater than min weight.");
      return;
    }
    if (Number(draft.markupValue) < 0) {
      setFormError("Markup value cannot be negative.");
      return;
    }
    if (editingId) {
      update.mutate({ id: editingId, values: toPayload(draft) });
    } else {
      save.mutate(draft);
    }
  };

  const bandLabel = (tier: Tier) =>
    `${tier.minWeightKg}${tier.maxWeightKg ? `–${tier.maxWeightKg}` : "+"} kg`;

  const markupLabel = (tier: Tier) =>
    tier.markupType === "flat" ? `+${tier.markupValue} SAR` : `+${tier.markupValue}%`;

  return (
    <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Markup tiers per local carrier and weight band for domestic KSA shipments. Client price =
          carrier cost + markup, floored at min charge, then +15% VAT. A configured Cost is always the
          markup base; leave it blank to fall back to the carrier's live rate API (when wired).
        </p>
        <Card>
          <CardHeader><CardTitle>{editingId ? "Edit Tier" : "Add Tier"}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              {selectField("carrierCode", "Carrier *", CARRIER_OPTIONS)}
              {field("minWeightKg", "Min weight (kg)", "number")}
              {field("maxWeightKg", "Max weight (kg)", "number", "blank = no upper bound")}
              {selectField("clientProfile", "Client profile", PROFILE_OPTIONS)}
              {selectField("markupType", "Markup type", MARKUP_OPTIONS)}
              {field("markupValue", draft.markupType === "flat" ? "Markup (SAR)" : "Markup (%)", "number")}
              {field("minCharge", "Min charge (SAR)", "number", "optional floor")}
              {field("baseRateSar", "Cost (SAR)", "number", "carrier cost — always markup base")}
            </div>
            {formError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={submitDraft} disabled={save.isPending || update.isPending}>
                {editingId ? <Pencil className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                {editingId ? "Save Tier" : "Add Tier"}
              </Button>
              {editingId && <Button variant="outline" onClick={resetDraft}><X className="mr-2 h-4 w-4" />Cancel</Button>}
            </div>
          </CardContent>
        </Card>
        <div className="grid gap-4">
          {tiers.map((tier) => (
            <Card key={tier.id}>
              <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
                <div className="flex-1">
                  <p className="font-semibold">{carrierName(tier.carrierCode)} · {bandLabel(tier)}</p>
                  <p className="text-sm text-muted-foreground">
                    Markup {markupLabel(tier)}
                    {tier.minCharge ? ` · min ${tier.minCharge} SAR` : ""}
                    {tier.baseRateSar ? ` · cost ${tier.baseRateSar} SAR` : " · cost from live rate"}
                    {tier.clientProfile ? ` · ${tier.clientProfile}` : " · any profile"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Label>Enabled</Label>
                  <Switch checked={tier.enabled} onCheckedChange={(enabled) => update.mutate({ id: tier.id, values: { enabled } })} />
                  <Button variant="outline" size="icon" onClick={() => editTier(tier)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" onClick={() => remove.mutate(tier.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {tiers.length === 0 && <p className="text-sm text-muted-foreground">No local pricing tiers configured yet.</p>}
        </div>
    </div>
  );
}

export default function AdminLocalPricing() {
  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl p-6">
        <LocalCarriersTab />
      </div>
    </AdminLayout>
  );
}
