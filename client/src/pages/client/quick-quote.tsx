import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClientLayout } from "@/components/client-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/searchable-select";
import { CarrierLogo } from "@/components/carrier-logo";
import { apiRequest } from "@/lib/queryClient";
import { COUNTRY_CODE_SELECT_OPTIONS } from "@/lib/countries";
import { AlertCircle, ArrowRight, Clock, Info, MapPin, Package, Plane, Ship, Truck, Zap } from "lucide-react";

interface ClientAccount { profile?: string }

type LocalQuote = {
  carrierCode: string;
  carrierName: string;
  baseRate: number;
  markup: number;
  vat: number;
  clientTotal: number;
  transitDays: number;
};

type ExpressQuote = {
  carrierCode: string;
  carrierName: string;
  serviceType: string;
  serviceName: string;
  clientTotal: number;
  transitDays: number | null;
};

type DdpQuote = {
  transportMethod: "air" | "sea" | "domestic";
  billingUnit: "KG" | "CBM";
  billableQuantity: number;
  ratePerUnit: number;
  baseRate: number;
  markup: number;
  vat: number;
  clientTotal: number;
  transitDays: number;
  laneId: string;
};

type QuickQuoteResponse = {
  chargeable: { totalWeightKg: number; totalCbm: number; chargeableAirKg: number; pieces: number };
  local: LocalQuote[];
  ddp: DdpQuote[];
  express: ExpressQuote[];
  available: { local: boolean; ddp: boolean; express: boolean };
  currency: string;
};

type Form = {
  fromCountry: string; fromCity: string;
  toCountry: string; toCity: string;
  weight: string; length: string; width: string; height: string; pieces: string;
};

const emptyForm: Form = {
  fromCountry: "SA", fromCity: "",
  toCountry: "SA", toCity: "",
  weight: "", length: "", width: "", height: "", pieces: "1",
};

const DDP_META: Record<DdpQuote["transportMethod"], { label: string; icon: typeof Plane; accent: string }> = {
  air: { label: "Air Freight (D2D)", icon: Plane, accent: "text-amber-500" },
  sea: { label: "Sea Freight (D2D)", icon: Ship, accent: "text-blue-500" },
  domestic: { label: "Domestic (D2D)", icon: Truck, accent: "text-emerald-500" },
};

const sar = (n: number) => `SAR ${n.toLocaleString("en", { maximumFractionDigits: 0 })}`;

export default function QuickQuote() {
  const [, navigate] = useLocation();
  const { data: account } = useQuery<ClientAccount>({ queryKey: ["/api/client/account"] });
  const [form, setForm] = useState<Form>(emptyForm);

  const set = (key: keyof Form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const quote = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/client/quick-quote", payload);
      return (await res.json()) as QuickQuoteResponse;
    },
  });

  const weightNum = Number(form.weight) || 0;
  const canQuote = Boolean(form.fromCountry && form.toCountry && weightNum > 0);

  // Client-side spec chips (mirrors the server's chargeable math for instant feedback).
  const specs = useMemo(() => {
    const pieces = Math.max(1, Number(form.pieces) || 1);
    const totalWeight = weightNum * pieces;
    const cbm = (Number(form.length) || 0) * (Number(form.width) || 0) * (Number(form.height) || 0) / 1_000_000 * pieces;
    const chargeableAir = Math.max(totalWeight, cbm * 167);
    return { pieces, totalWeight, cbm, chargeableAir };
  }, [form.pieces, form.length, form.width, form.height, weightNum]);

  // Debounced auto-quote whenever inputs change.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutate = quote.mutate;
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!canQuote) return;
    timer.current = setTimeout(() => {
      mutate({
        origin: { countryCode: form.fromCountry, city: form.fromCity || undefined },
        destination: { countryCode: form.toCountry, city: form.toCity || undefined },
        weightKg: weightNum,
        length: Number(form.length) || undefined,
        width: Number(form.width) || undefined,
        height: Number(form.height) || undefined,
        pieces: Math.max(1, Number(form.pieces) || 1),
      });
    }, 700);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, canQuote]);

  const deepLink = (path: string) => {
    const params = new URLSearchParams({
      from: form.fromCountry, to: form.toCountry,
      weight: form.weight, pieces: form.pieces,
      returnTo: "/client/quick-quote",
    });
    if (form.fromCity) params.set("fromCity", form.fromCity);
    if (form.toCity) params.set("toCity", form.toCity);
    if (form.length) params.set("l", form.length);
    if (form.width) params.set("w", form.width);
    if (form.height) params.set("h", form.height);
    navigate(`${path}?${params.toString()}`);
  };

  const data = quote.data;
  const showResults = canQuote && data;
  const noneAvailable = showResults && !data.available.local && !data.available.ddp && !data.available.express;

  const numField = (key: keyof Form, label: string, placeholder = "0") => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" min="0" step="0.1" placeholder={placeholder} value={form[key]} onChange={(e) => set(key, e.target.value)} />
    </div>
  );

  return (
    <ClientLayout clientProfile={account?.profile}>
      <div className="mx-auto max-w-4xl space-y-5 p-6">
        <div>
          <h1 className="text-2xl font-bold">Quick Quote</h1>
          <p className="text-sm text-muted-foreground">
            Get instant shipping estimates — enter origin, destination, weight and dimensions. No shipment created.
          </p>
        </div>

        {/* Inputs */}
        <Card>
          <CardContent className="space-y-6 p-6">
            {/* Route */}
            <div>
              <div className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Route</div>
              <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-end">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-xs font-semibold"><MapPin className="h-3 w-3 text-primary" /> Origin</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <SearchableSelect options={COUNTRY_CODE_SELECT_OPTIONS} value={form.fromCountry} onValueChange={(v) => set("fromCountry", v)} placeholder="Country" searchPlaceholder="Search..." />
                    <Input placeholder="City (optional)" value={form.fromCity} onChange={(e) => set("fromCity", e.target.value)} />
                  </div>
                </div>
                <div className="hidden pb-2 text-muted-foreground md:block"><ArrowRight className="h-5 w-5" /></div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-xs font-semibold"><MapPin className="h-3 w-3 text-blue-500" /> Destination</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <SearchableSelect options={COUNTRY_CODE_SELECT_OPTIONS} value={form.toCountry} onValueChange={(v) => set("toCountry", v)} placeholder="Country" searchPlaceholder="Search..." />
                    <Input placeholder="City (optional)" value={form.toCity} onChange={(e) => set("toCity", e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            {/* Specs */}
            <div>
              <div className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Shipment details</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {numField("weight", "Weight (kg)")}
                {numField("length", "Length (cm)")}
                {numField("width", "Width (cm)")}
                {numField("height", "Height (cm)")}
                {numField("pieces", "Packages", "1")}
              </div>
              {(specs.totalWeight > 0 || specs.cbm > 0) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {specs.totalWeight > 0 && <Chip label="Total weight" value={`${specs.totalWeight.toFixed(1)} kg`} />}
                  {specs.cbm > 0 && <Chip label="Volume" value={`${specs.cbm.toFixed(4)} CBM`} />}
                  {specs.chargeableAir > 0 && <Chip label="Chargeable (air)" value={`${specs.chargeableAir.toFixed(1)} kg`} />}
                  {specs.pieces > 1 && <Chip label="Packages" value={`${specs.pieces}`} />}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {!canQuote && (
          <div className="py-14 text-center text-sm text-muted-foreground">
            <Package className="mx-auto mb-3 h-10 w-10 opacity-30" />
            Enter origin, destination and weight to see rates.
          </div>
        )}

        {quote.isPending && canQuote && (
          <div className="py-10 text-center text-sm text-muted-foreground">Calculating rates…</div>
        )}

        {noneAvailable && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No instant rates for this route. Express and international shipments are priced in the full{" "}
              <button className="font-medium text-primary underline" onClick={() => navigate("/client/shipments/new")}>create-shipment</button> flow.
            </CardContent>
          </Card>
        )}

        {showResults && data.available.express && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Zap className="h-4 w-4 text-primary" /> Express (International & Domestic)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 p-0">
              {data.express.map((q, i) => (
                <div key={`${q.carrierCode}-${q.serviceType || i}`} className="flex items-center justify-between gap-3 border-t px-6 py-3 first:border-t-0">
                  <div className="flex items-center gap-3">
                    <CarrierLogo carrierCode={q.carrierCode} carrierName={q.carrierName} className="h-6 w-auto max-w-[110px] object-contain" />
                    <div>
                      <div className="text-sm font-semibold">{q.serviceName || q.carrierName}</div>
                      {q.transitDays ? (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" /> ~{q.transitDays} days</div>
                      ) : null}
                    </div>
                    {i === 0 && <Badge variant="secondary" className="text-[10px]">Best value</Badge>}
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-primary">{sar(q.clientTotal)}</div>
                    <div className="text-[11px] text-muted-foreground">incl. VAT</div>
                  </div>
                </div>
              ))}
              <div className="border-t bg-muted/40 p-3">
                <Button size="sm" className="w-full" onClick={() => deepLink("/client/create-shipment")}>
                  Continue to Express <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {showResults && data.available.local && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4 text-emerald-500" /> Local Delivery (KSA)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 p-0">
              {data.local.map((q, i) => (
                <div key={q.carrierCode} className="flex items-center justify-between gap-3 border-t px-6 py-3 first:border-t-0">
                  <div className="flex items-center gap-3">
                    <CarrierLogo carrierCode={q.carrierCode} carrierName={q.carrierName} className="h-6 w-auto max-w-[110px] object-contain" />
                    <div>
                      <div className="text-sm font-semibold">{q.carrierName}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" /> ~{q.transitDays} days</div>
                    </div>
                    {i === 0 && <Badge variant="secondary" className="text-[10px]">Best value</Badge>}
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-primary">{sar(q.clientTotal)}</div>
                    <div className="text-[11px] text-muted-foreground">incl. VAT</div>
                  </div>
                </div>
              ))}
              <div className="border-t bg-muted/40 p-3">
                <Button size="sm" className="w-full" onClick={() => deepLink("/client/local/new")}>
                  Continue to Local Delivery <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {showResults && data.available.ddp && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Plane className="h-4 w-4 text-blue-500" /> Door To Door Freight</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-6 pt-0">
              <div className="grid gap-3 sm:grid-cols-3">
                {data.ddp.map((q) => {
                  const meta = DDP_META[q.transportMethod];
                  const Icon = meta.icon;
                  return (
                    <div key={q.transportMethod} className="rounded-lg border p-4">
                      <div className="flex items-center gap-1.5 text-xs font-semibold"><Icon className={`h-3.5 w-3.5 ${meta.accent}`} /> {meta.label}</div>
                      <div className="mt-2 text-xl font-bold">{sar(q.clientTotal)}</div>
                      <div className="text-[11px] text-muted-foreground">incl. VAT · ~{q.transitDays} days</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{q.billableQuantity} {q.billingUnit} × {sar(q.ratePerUnit)}</div>
                    </div>
                  );
                })}
              </div>
              <Button size="sm" className="w-full" onClick={() => deepLink("/client/ddp")}>
                Continue to Door To Door Freight <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>
        )}

        {showResults && !noneAvailable && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            Prices are indicative estimates. Final pricing may vary based on actual dimensions, customs duties and destination surcharges.
          </div>
        )}

        {quote.isError && canQuote && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> Could not calculate a quote. Please try again.
          </div>
        )}
      </div>
    </ClientLayout>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border bg-muted px-3 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
