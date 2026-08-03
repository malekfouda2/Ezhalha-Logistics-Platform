import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/searchable-select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { COUNTRY_CODE_OPTIONS, COUNTRY_CODE_SELECT_OPTIONS } from "@/lib/countries";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertCircle, Pencil, Plus, Trash2, X } from "lucide-react";

type Lane = {
  id: string;
  originCountryCode: string;
  originCity?: string | null;
  destinationCountryCode: string;
  destinationCity?: string | null;
  airBaseRatePerKg?: string | null;
  seaBaseRatePerCbm?: string | null;
  domesticRatePerKg?: string | null;
  airSupplierCostPerKg?: string | null;
  seaSupplierCostPerCbm?: string | null;
  domesticSupplierCostPerKg?: string | null;
  minimumBillableKg: string;
  kgRoundingIncrement: string;
  minimumBillableCbm: string;
  cbmRoundingIncrement: string;
  minimumShipmentCharge: string;
  volumetricDivisor: number;
  airTransitDaysMin?: number | null;
  airTransitDaysMax?: number | null;
  seaTransitDaysMin?: number | null;
  seaTransitDaysMax?: number | null;
  airEnabled?: boolean;
  isActive: boolean;
};

const blankLane = {
  originCountryCode: "",
  destinationCountryCode: "",
  airBaseRatePerKg: "",
  seaBaseRatePerCbm: "",
  domesticRatePerKg: "",
  airSupplierCostPerKg: "",
  seaSupplierCostPerCbm: "",
  domesticSupplierCostPerKg: "",
  minimumBillableKg: "0",
  kgRoundingIncrement: "0.5",
  minimumBillableCbm: "0",
  cbmRoundingIncrement: "0.1",
  minimumShipmentCharge: "0",
  volumetricDivisor: 6000,
  airTransitDaysMin: "",
  airTransitDaysMax: "",
  seaTransitDaysMin: "",
  seaTransitDaysMax: "",
  airEnabled: true,
  isActive: true,
};

const countryName = (countryCode: string) =>
  COUNTRY_CODE_OPTIONS.find((country) => country.code === countryCode)?.name || countryCode;

export function DdpLanesTab() {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Record<string, any>>(blankLane);
  const [editingLaneId, setEditingLaneId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const { data: lanes = [] } = useQuery<Lane[]>({ queryKey: ["/api/admin/ddp-pricing"] });
  const save = useMutation({
    mutationFn: async (lane: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/admin/ddp-pricing", lane);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ddp-pricing"] });
      setDraft(blankLane);
      setFormError("");
      toast({ title: "Door To Door Freight lane added" });
    },
    onError: (error: Error) => {
      setFormError(error.message);
      toast({ title: "Could not add Door To Door Freight lane", description: error.message, variant: "destructive" });
    },
  });
  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<Lane> }) => {
      const res = await apiRequest("PATCH", `/api/admin/ddp-pricing/${id}`, values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ddp-pricing"] });
      setEditingLaneId(null);
      setDraft(blankLane);
      setFormError("");
      toast({ title: "Door To Door Freight lane updated" });
    },
    onError: (error: Error) => {
      setFormError(error.message);
      toast({ title: "Could not update Door To Door Freight lane", description: error.message, variant: "destructive" });
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/ddp-pricing/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/ddp-pricing"] }),
    onError: (error: Error) => toast({ title: "Could not delete Door To Door Freight lane", description: error.message, variant: "destructive" }),
  });

  const field = (key: string, label: string, type = "text") => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type={type} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
    </div>
  );
  const countryField = (key: "originCountryCode" | "destinationCountryCode", label: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <SearchableSelect
        value={draft[key]}
        onValueChange={(value) => setDraft({ ...draft, [key]: value })}
        options={COUNTRY_CODE_SELECT_OPTIONS}
        placeholder="Select country"
        searchPlaceholder="Search countries..."
        data-testid={`select-${key}`}
      />
    </div>
  );
  const editLane = (lane: Lane) => {
    setEditingLaneId(lane.id);
    setDraft({
      ...blankLane,
      ...lane,
      airBaseRatePerKg: lane.airBaseRatePerKg || "",
      seaBaseRatePerCbm: lane.seaBaseRatePerCbm || "",
      domesticRatePerKg: lane.domesticRatePerKg || "",
      airSupplierCostPerKg: lane.airSupplierCostPerKg || "",
      seaSupplierCostPerCbm: lane.seaSupplierCostPerCbm || "",
      domesticSupplierCostPerKg: lane.domesticSupplierCostPerKg || "",
      airTransitDaysMin: lane.airTransitDaysMin ?? "",
      airTransitDaysMax: lane.airTransitDaysMax ?? "",
      seaTransitDaysMin: lane.seaTransitDaysMin ?? "",
      seaTransitDaysMax: lane.seaTransitDaysMax ?? "",
      airEnabled: lane.airEnabled ?? true,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const resetDraft = () => {
    setEditingLaneId(null);
    setDraft(blankLane);
    setFormError("");
  };
  const submitDraft = () => {
    setFormError("");
    if (String(draft.originCountryCode).trim().length !== 2 || String(draft.destinationCountryCode).trim().length !== 2) {
      setFormError("Select both the origin and destination countries.");
      return;
    }
    const draftAirRate = draft.airEnabled ? Number(draft.airBaseRatePerKg) : 0;
    if (draftAirRate <= 0 && Number(draft.seaBaseRatePerCbm) <= 0 && Number(draft.domesticRatePerKg) <= 0) {
      setFormError("Configure at least one positive air, sea, or domestic Door To Door Freight transport rate.");
      return;
    }
    if (draft.airEnabled && draft.airTransitDaysMin !== "" && draft.airTransitDaysMax !== "" && Number(draft.airTransitDaysMin) > Number(draft.airTransitDaysMax)) {
      setFormError("Air transit minimum days cannot exceed maximum days.");
      return;
    }
    if (draft.seaTransitDaysMin !== "" && draft.seaTransitDaysMax !== "" && Number(draft.seaTransitDaysMin) > Number(draft.seaTransitDaysMax)) {
      setFormError("Sea transit minimum days cannot exceed maximum days.");
      return;
    }
    if (editingLaneId) {
      update.mutate({ id: editingLaneId, values: draft });
    } else {
      save.mutate(draft);
    }
  };

  return (
    <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Base transport rates per Door To Door Freight lane. The Door To Door Freight markup % is set per client profile on the
          Client Markup tab; the lane holds the air/sea/domestic sell rates plus the optional
          supplier cost per unit used for true-margin tracking (margin = sell + markup − cost).
        </p>
        <Card>
          <CardHeader><CardTitle>{editingLaneId ? "Edit Lane" : "Add Lane"}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">Air delivery available</p>
                <p className="text-sm text-muted-foreground">Turn off for lanes with no air option — air rate, cost and transit fields are hidden and air quotes are rejected.</p>
              </div>
              <Switch
                checked={!!draft.airEnabled}
                onCheckedChange={(airEnabled) => setDraft({ ...draft, airEnabled })}
                data-testid="switch-air-enabled"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              {countryField("originCountryCode", "Origin country *")}
              {countryField("destinationCountryCode", "Destination country *")}
              {draft.airEnabled && field("airBaseRatePerKg", "Air base rate / KG", "number")}
              {draft.airEnabled && field("airSupplierCostPerKg", "Air supplier cost / KG", "number")}
              {field("seaBaseRatePerCbm", "Sea base rate / CBM", "number")}
              {field("seaSupplierCostPerCbm", "Sea supplier cost / CBM", "number")}
              {field("domesticRatePerKg", "Domestic rate / KG", "number")}
              {field("domesticSupplierCostPerKg", "Domestic supplier cost / KG", "number")}
              {field("minimumBillableKg", "Minimum billable KG", "number")}
              {field("kgRoundingIncrement", "KG rounding increment", "number")}
              {field("minimumBillableCbm", "Minimum billable CBM", "number")}
              {field("cbmRoundingIncrement", "CBM rounding increment", "number")}
              {field("minimumShipmentCharge", "Minimum shipment charge", "number")}
              {draft.airEnabled && field("volumetricDivisor", "Air dimensional divisor", "number")}
              {draft.airEnabled && field("airTransitDaysMin", "Air transit min days", "number")}
              {draft.airEnabled && field("airTransitDaysMax", "Air transit max days", "number")}
              {field("seaTransitDaysMin", "Sea transit min days", "number")}
              {field("seaTransitDaysMax", "Sea transit max days", "number")}
            </div>
            {formError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                onClick={submitDraft}
                disabled={save.isPending || update.isPending}
              >
                {editingLaneId ? <Pencil className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                {editingLaneId ? "Save Lane" : "Add Door To Door Freight Lane"}
              </Button>
              {editingLaneId && <Button variant="outline" onClick={resetDraft}><X className="mr-2 h-4 w-4" />Cancel</Button>}
            </div>
          </CardContent>
        </Card>
        <div className="grid gap-4">
          {lanes.map((lane) => (
            <Card key={lane.id}>
              <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
                <div className="flex-1">
                  <p className="font-semibold">{countryName(lane.originCountryCode)} to {countryName(lane.destinationCountryCode)}</p>
                  <p className="text-sm text-muted-foreground">Air: {lane.airEnabled === false ? "Unavailable" : `${lane.airBaseRatePerKg || "Not set"} SAR/KG`} · Sea: {lane.seaBaseRatePerCbm || "Not set"} SAR/CBM · Domestic: {lane.domesticRatePerKg || "Not set"} SAR/KG · Minimum charge: {lane.minimumShipmentCharge} SAR</p>
                  <p className="text-xs text-muted-foreground">Supplier cost — Air: {lane.airSupplierCostPerKg || "Not set"} SAR/KG · Sea: {lane.seaSupplierCostPerCbm || "Not set"} SAR/CBM · Domestic: {lane.domesticSupplierCostPerKg || "Not set"} SAR/KG</p>
                  <p className="text-xs text-muted-foreground">Minimums: {lane.minimumBillableKg} KG / {lane.minimumBillableCbm} CBM · Rounding: {lane.kgRoundingIncrement} KG / {lane.cbmRoundingIncrement} CBM</p>
                </div>
                <div className="flex items-center gap-3">
                  <Label>Active</Label>
                  <Switch checked={lane.isActive} onCheckedChange={(isActive) => update.mutate({ id: lane.id, values: { isActive } })} />
                  <Button variant="outline" size="icon" onClick={() => editLane(lane)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" onClick={() => remove.mutate(lane.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {lanes.length === 0 && <p className="text-sm text-muted-foreground">No Door To Door Freight lanes configured yet.</p>}
        </div>
    </div>
  );
}

export default function AdminDdpPricing() {
  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl p-6">
        <DdpLanesTab />
      </div>
    </AdminLayout>
  );
}
