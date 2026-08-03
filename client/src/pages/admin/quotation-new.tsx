import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/searchable-select";
import { QuotationModeContext } from "@/lib/quotation-mode";
import CreateShipment from "@/pages/client/create-shipment";
import ClientDdp from "@/pages/client/ddp";
import CreateLocalShipment from "@/pages/client/create-local-shipment";
import { ArrowLeft, Plane, DoorOpen, MapPin } from "lucide-react";

type Type = "express" | "ddp" | "local";

const TYPES: { key: Type; label: string; description: string; icon: typeof Plane; wrap: string; color: string }[] = [
  { key: "local", label: "Local Delivery", description: "Last-mile delivery within Saudi Arabia.", icon: MapPin, wrap: "bg-emerald-500/10", color: "text-emerald-500" },
  { key: "express", label: "Express Shipment", description: "International courier (import & export) via FedEx, DHL, Aramex.", icon: Plane, wrap: "bg-primary/10", color: "text-primary" },
  { key: "ddp", label: "Door To Door Freight", description: "Import with duties & taxes prepaid on fixed lane pricing.", icon: DoorOpen, wrap: "bg-blue-500/10", color: "text-blue-500" },
];

export default function QuotationNew() {
  const [, navigate] = useLocation();
  const [clientAccountId, setClientAccountId] = useState("");
  const [clientName, setClientName] = useState("");
  const [type, setType] = useState<Type | null>(null);

  const { data: clientsData } = useQuery<{ clients: Array<{ id: string; name: string; email: string }> }>({
    queryKey: ["/api/admin/clients?limit=200&status=active"],
  });
  const clients = clientsData?.clients || [];
  const clientOptions = clients.map((c) => ({ value: c.id, label: `${c.name} — ${c.email}` }));

  // Once a client + type are chosen, render the real client create-shipment flow in quotation mode.
  if (clientAccountId && type) {
    const label = type === "ddp" ? "Door To Door Freight" : type === "local" ? "Local" : "Express";
    return (
      <AdminLayout>
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center gap-3 px-6 pt-6">
            <button className="text-muted-foreground hover:text-foreground" onClick={() => setType(null)}><ArrowLeft className="h-5 w-5" /></button>
            <div className="text-sm text-muted-foreground">Quotation for <span className="font-medium text-foreground">{clientName}</span> · {label}</div>
          </div>
          <QuotationModeContext.Provider value={{ clientAccountId, clientName }}>
            {type === "ddp" ? <ClientDdp /> : type === "local" ? <CreateLocalShipment /> : <CreateShipment />}
          </QuotationModeContext.Provider>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="flex items-center gap-3">
          <button className="text-muted-foreground hover:text-foreground" onClick={() => navigate("/admin/shipments")}><ArrowLeft className="h-5 w-5" /></button>
          <div>
            <h1 className="text-2xl font-bold">New Quotation</h1>
            <p className="text-sm text-muted-foreground">Select a client, then build the shipment exactly like the client would — they're notified to review and pay.</p>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1">
              <Label>Client</Label>
              <SearchableSelect
                options={clientOptions}
                value={clientAccountId}
                onValueChange={(v) => { setClientAccountId(v); setClientName(clients.find((c) => c.id === v)?.name || ""); }}
                placeholder="Search client by name / email"
                searchPlaceholder="Search clients..."
              />
            </div>
          </CardContent>
        </Card>

        {clientAccountId && (
          <div className="grid gap-4 sm:grid-cols-3">
            {TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.key} onClick={() => setType(t.key)} className="rounded-lg border p-5 text-left transition hover:border-primary hover:shadow-sm">
                  <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-lg ${t.wrap}`}><Icon className={`h-5 w-5 ${t.color}`} /></div>
                  <div className="font-semibold">{t.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{t.description}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
