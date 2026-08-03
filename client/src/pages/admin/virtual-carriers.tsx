import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/searchable-select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { AlertCircle, ImageIcon, Pencil, Plus, Trash2, Upload, X } from "lucide-react";

export type VirtualCarrier = {
  id: string;
  code: string;
  name: string;
  provider: "fizzpa" | "shipox";
  noteTemplate: string;
  logo: string | null;
  enabled: boolean;
};

const LOGO_MAX_BYTES = 70 * 1024;

const PROVIDER_OPTIONS = [
  { value: "fizzpa", label: "Fizzpa" },
  { value: "shipox", label: "Shipox" },
];

const providerName = (value: string) =>
  PROVIDER_OPTIONS.find((p) => p.value === value)?.label || value;

const blankCarrier = {
  code: "",
  name: "",
  provider: "fizzpa",
  noteTemplate: "",
  enabled: true,
};

export function VirtualCarriersTab() {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Record<string, any>>(blankCarrier);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const { data: carriers = [] } = useQuery<VirtualCarrier[]>({ queryKey: ["/api/admin/virtual-carriers"] });

  const toPayload = (values: Record<string, any>) => ({
    code: String(values.code || "").trim(),
    name: String(values.name || "").trim(),
    provider: values.provider,
    noteTemplate: String(values.noteTemplate || "").trim(),
    enabled: values.enabled,
  });

  const save = useMutation({
    mutationFn: async (values: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/admin/virtual-carriers", toPayload(values));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/virtual-carriers"] });
      setDraft(blankCarrier);
      setFormError("");
      toast({ title: "Virtual carrier added" });
    },
    onError: (error: Error) => {
      setFormError(error.message);
      toast({ title: "Could not add carrier", description: error.message, variant: "destructive" });
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/admin/virtual-carriers/${id}`, values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/virtual-carriers"] });
      setEditingId(null);
      setDraft(blankCarrier);
      setFormError("");
      toast({ title: "Virtual carrier updated" });
    },
    onError: (error: Error) => {
      setFormError(error.message);
      toast({ title: "Could not update carrier", description: error.message, variant: "destructive" });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/virtual-carriers/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/virtual-carriers"] }),
    onError: (error: Error) => toast({ title: "Could not delete carrier", description: error.message, variant: "destructive" }),
  });

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [logoTargetId, setLogoTargetId] = useState<string | null>(null);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/virtual-carriers"] });
    // Refresh the shared carrier-logo map so the rates UI shows the new logo everywhere.
    queryClient.invalidateQueries({ queryKey: ["/api/carrier-logos"] });
  };

  const logoMutation = useMutation({
    mutationFn: async ({ id, logo }: { id: string; logo: string }) =>
      apiRequest("PUT", `/api/admin/virtual-carriers/${id}/logo`, { logo }),
    onSuccess: () => { invalidateAll(); toast({ title: "Logo updated" }); },
    onError: (error: Error) => toast({ title: "Failed to upload logo", description: error.message, variant: "destructive" }),
  });

  const removeLogoMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/virtual-carriers/${id}/logo`),
    onSuccess: () => { invalidateAll(); toast({ title: "Logo removed" }); },
    onError: (error: Error) => toast({ title: "Failed to remove logo", description: error.message, variant: "destructive" }),
  });

  const handleLogoFile = (id: string, file: File | undefined) => {
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES) {
      toast({ title: "Image too large", description: "Use a logo under 70 KB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => logoMutation.mutate({ id, logo: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const field = (key: string, label: string, placeholder = "", helpText = "") => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input placeholder={placeholder} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
    </div>
  );

  const editCarrier = (carrier: VirtualCarrier) => {
    setEditingId(carrier.id);
    setDraft({ ...blankCarrier, ...carrier });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetDraft = () => {
    setEditingId(null);
    setDraft(blankCarrier);
    setFormError("");
  };

  const submitDraft = () => {
    setFormError("");
    if (!String(draft.code || "").trim()) {
      setFormError("Enter a carrier code.");
      return;
    }
    if (!String(draft.name || "").trim()) {
      setFormError("Enter a display name.");
      return;
    }
    if (editingId) {
      update.mutate({ id: editingId, values: toPayload(draft) });
    } else {
      save.mutate(draft);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Client-facing couriers layered on the Fizzpa / Shipox aggregators, whose APIs expose no
        downstream-carrier list or selection. Each virtual carrier shows to clients as its own
        pickable carrier at shipment creation and needs its own rate card under the{" "}
        <span className="font-medium">Local Carriers</span> tab (matched by this code). When a client
        books it, the shipment is created on the provider's dashboard with a note telling their ops
        which courier to assign.
      </p>
      <Card>
        <CardHeader><CardTitle>{editingId ? "Edit Virtual Carrier" : "Add Virtual Carrier"}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {field("code", "Carrier code *", "e.g. FIZZ_XPRESS", "Client-facing code. Also the key for its Local Carriers rate card.")}
            {field("name", "Display name *", "e.g. X Express", "Shown to clients on the rates page.")}
            <div className="space-y-1">
              <Label>Provider *</Label>
              <SearchableSelect
                value={draft.provider}
                onValueChange={(value) => setDraft({ ...draft, provider: value })}
                options={PROVIDER_OPTIONS}
                placeholder="Select provider"
                searchPlaceholder="Search..."
              />
              <p className="text-xs text-muted-foreground">Backend the shipment is actually booked on.</p>
            </div>
            {field("noteTemplate", "Assignment note", "Assign to X Express", "Written onto the provider order. Use {name} for the display name. Blank = \"Assign to <name>\".")}
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
              {editingId ? "Save Carrier" : "Add Carrier"}
            </Button>
            {editingId && <Button variant="outline" onClick={resetDraft}><X className="mr-2 h-4 w-4" />Cancel</Button>}
          </div>
        </CardContent>
      </Card>
      <input
        ref={logoInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          if (logoTargetId) handleLogoFile(logoTargetId, e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="grid gap-4">
        {carriers.map((carrier) => (
          <Card key={carrier.id}>
            <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg",
                  carrier.logo ? "border bg-white" : "bg-muted text-muted-foreground",
                )}
              >
                {carrier.logo
                  ? <img src={carrier.logo} alt={carrier.name} className="h-full w-full object-contain p-1" />
                  : <ImageIcon className="h-5 w-5" />}
              </div>
              <div className="flex-1">
                <p className="font-semibold">{carrier.name} · <span className="font-mono text-sm">{carrier.code}</span></p>
                <p className="text-sm text-muted-foreground">
                  via {providerName(carrier.provider)}
                  {carrier.noteTemplate ? ` · note: "${carrier.noteTemplate}"` : ` · note: "Assign to ${carrier.name}"`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={logoMutation.isPending}
                  onClick={() => { setLogoTargetId(carrier.id); logoInputRef.current?.click(); }}
                >
                  <Upload className="mr-2 h-4 w-4" />{carrier.logo ? "Replace logo" : "Upload logo"}
                </Button>
                {carrier.logo && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={removeLogoMutation.isPending}
                    onClick={() => removeLogoMutation.mutate(carrier.id)}
                  >
                    <X className="mr-2 h-4 w-4" />Remove logo
                  </Button>
                )}
                <Label>Enabled</Label>
                <Switch checked={carrier.enabled} onCheckedChange={(enabled) => update.mutate({ id: carrier.id, values: { enabled } })} />
                <Button variant="outline" size="icon" onClick={() => editCarrier(carrier)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" onClick={() => remove.mutate(carrier.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {carriers.length === 0 && <p className="text-sm text-muted-foreground">No virtual carriers configured yet.</p>}
      </div>
    </div>
  );
}
