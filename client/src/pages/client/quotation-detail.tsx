import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClientLayout } from "@/components/client-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/phone-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/searchable-select";
import { TapCardForm } from "@/components/tap-card-form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { COUNTRY_CODE_SELECT_OPTIONS } from "@/lib/countries";
import { ArrowLeft, CreditCard, Loader2, Pencil, Wallet } from "lucide-react";

interface Party {
  name: string; phone: string; email: string;
  addressLine1: string; addressLine2: string; city: string;
  stateOrProvince: string; postalCode: string; countryCode: string; shortAddress: string;
}
interface Pkg { weight: number; length: number; width: number; height: number }
interface Item { itemName: string; category?: string; countryOfOrigin?: string; hsCode?: string; price: number; quantity: number }
interface TradeDoc { fileName: string; documentType: string }
interface Quote {
  id: string; trackingNumber: string; type: "express" | "local" | "ddp"; status: string;
  paymentStatus: string; carrierName: string | null; serviceType: string | null; currency: string;
  shipper: Party; recipient: Party; packages: Pkg[]; note: string; canPay: boolean;
  items: Item[]; tradeDocuments: TradeDoc[]; supplierName: string; supplierPhone: string; specialInstructions: string;
  requiresConsent: boolean; consentAccepted: boolean;
  pricing: { baseRate: number; marginAmount: number; discountSar: number; extraChargeSar: number; vatAmountSar: number; clientTotalSar: number };
}
interface ClientAccount { profile?: string; creditEnabled?: boolean }

const sar = (n: number) => `SAR ${n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function QuotationDetail() {
  const [, params] = useRoute("/client/quotations/:id");
  const id = params?.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ shipper: Party; recipient: Party; packages: Pkg[] } | null>(null);

  const { data: account } = useQuery<ClientAccount>({ queryKey: ["/api/client/account"] });
  const { data: quote, isLoading, error } = useQuery<Quote>({
    queryKey: [`/api/client/quotations/${id}`],
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (quote && !draft) setDraft({ shipper: quote.shipper, recipient: quote.recipient, packages: quote.packages });
  }, [quote, draft]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/client/quotations/${id}`, draft);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/client/quotations/${id}`] });
      setEditing(false);
      toast({ title: "Quotation updated", description: "Your changes were saved and the price was recalculated." });
    },
    onError: (e: Error) => toast({ title: "Could not update", description: e.message, variant: "destructive" }),
  });

  const payCard = useMutation({
    mutationFn: async (payload: { tapTokenId?: string; saveCardForFuture?: boolean }) => {
      const res = await apiRequest("POST", "/api/client/shipments/pay", { shipmentId: id, returnPath: `/client/quotations/${id}`, ...payload });
      return res.json() as Promise<{ transactionUrl?: string }>;
    },
    onSuccess: (data) => {
      if (data.transactionUrl) { window.location.href = data.transactionUrl; return; }
      qc.invalidateQueries({ queryKey: [`/api/client/quotations/${id}`] });
      toast({ title: "Payment successful", description: "Your shipment payment was completed." });
      navigate("/client/shipments");
    },
    onError: (e: Error) => toast({ title: "Payment failed", description: e.message, variant: "destructive" }),
  });

  const payCredit = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/client/shipments/${id}/pay-later`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Paid with credit", description: "The shipment was charged to your credit account." });
      navigate("/client/shipments");
    },
    onError: (e: Error) => toast({ title: "Credit payment failed", description: e.message, variant: "destructive" }),
  });

  const [consent, setConsent] = useState({ customs: false, terms: false, broker: false });
  const acceptTerms = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/client/quotations/${id}/accept-terms`, {
      customsComplianceAccepted: true, termsAccepted: true, brokerAuthorizationAccepted: true,
    })).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`/api/client/quotations/${id}`] }); toast({ title: "Declaration accepted" }); },
    onError: (e: Error) => toast({ title: "Could not accept", description: e.message, variant: "destructive" }),
  });

  if (isLoading || !quote || !draft) {
    return (
      <ClientLayout clientProfile={account?.profile}>
        <div className="flex items-center justify-center p-16 text-muted-foreground">
          {error ? "Quotation not found." : <Loader2 className="h-6 w-6 animate-spin" />}
        </div>
      </ClientLayout>
    );
  }

  const p = quote.pricing;
  const paid = quote.paymentStatus === "paid";

  const partyFields = (side: "shipper" | "recipient", label: string) => {
    const party = draft[side];
    const set = (k: keyof Party, v: string) => setDraft({ ...draft, [side]: { ...party, [k]: v } });
    return (
      <div className="space-y-3">
        <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Name" value={party.name} onChange={(e) => set("name", e.target.value)} />
          <PhoneInput value={party.phone} onChange={(v) => set("phone", v)} defaultCountry={(party as any).countryCode || "SA"} />
          <Input className="col-span-2" placeholder="Address" value={party.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} />
          <Input placeholder="City" value={party.city} onChange={(e) => set("city", e.target.value)} />
          <Input placeholder="Postal code" value={party.postalCode} onChange={(e) => set("postalCode", e.target.value)} />
          <div className="col-span-2">
            <SearchableSelect options={COUNTRY_CODE_SELECT_OPTIONS} value={party.countryCode} onValueChange={(v) => set("countryCode", v)} placeholder="Country" searchPlaceholder="Search..." />
          </div>
        </div>
      </div>
    );
  };

  return (
    <ClientLayout clientProfile={account?.profile}>
      <div className="mx-auto max-w-3xl space-y-5 p-6">
        <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" onClick={() => navigate("/client/shipments")}>
          <ArrowLeft className="h-4 w-4" /> Back to shipments
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Quotation {quote.trackingNumber}</h1>
            <p className="text-sm text-muted-foreground">
              {quote.carrierName || quote.type.toUpperCase()} · {quote.shipper.city}, {quote.shipper.countryCode} → {quote.recipient.city}, {quote.recipient.countryCode}
            </p>
          </div>
          <Badge variant={paid ? "secondary" : "default"}>{paid ? "Paid" : "Awaiting payment"}</Badge>
        </div>

        {/* Shipment details */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Shipment details</CardTitle>
            {quote.canPay && !editing && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil className="mr-2 h-4 w-4" /> Modify</Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {editing ? (
              <>
                <div className="grid gap-5 sm:grid-cols-2">
                  {partyFields("shipper", "From")}
                  {partyFields("recipient", "To")}
                </div>
                <div>
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Packages</div>
                  <div className="space-y-2">
                    {draft.packages.map((pkg, i) => (
                      <div key={i} className="grid grid-cols-4 gap-2">
                        {(["weight", "length", "width", "height"] as const).map((f) => (
                          <div key={f}>
                            <Label className="text-[11px] capitalize">{f} {f === "weight" ? "(kg)" : "(cm)"}</Label>
                            <Input type="number" value={pkg[f]} onChange={(e) => {
                              const next = [...draft.packages];
                              next[i] = { ...pkg, [f]: Number(e.target.value) };
                              setDraft({ ...draft, packages: next });
                            }} />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Save & re-price</Button>
                  <Button variant="outline" onClick={() => { setDraft({ shipper: quote.shipper, recipient: quote.recipient, packages: quote.packages }); setEditing(false); }}>Cancel</Button>
                </div>
              </>
            ) : (
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">From</div>
                  <div className="mt-1">{quote.shipper.name} · {quote.shipper.phone}</div>
                  <div className="text-muted-foreground">{quote.shipper.addressLine1}, {quote.shipper.city}, {quote.shipper.countryCode}</div>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">To</div>
                  <div className="mt-1">{quote.recipient.name} · {quote.recipient.phone}</div>
                  <div className="text-muted-foreground">{quote.recipient.addressLine1}, {quote.recipient.city}, {quote.recipient.countryCode}</div>
                </div>
                <div className="sm:col-span-2 text-muted-foreground">
                  {quote.packages.length} package(s) · {quote.packages.reduce((s, x) => s + x.weight, 0)} kg total
                </div>
                {quote.note && <div className="sm:col-span-2 rounded-md bg-muted px-3 py-2 text-xs">Note: {quote.note}</div>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Items + documents (international / DDP) */}
        {(quote.items.length > 0 || quote.tradeDocuments.length > 0 || quote.supplierName) && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Customs & documents</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {quote.supplierName && <div className="text-muted-foreground">Supplier: <span className="text-foreground">{quote.supplierName}</span> · {quote.supplierPhone}</div>}
              {quote.items.length > 0 && (
                <div className="space-y-1">
                  {quote.items.map((it, i) => (
                    <div key={i} className="flex items-center justify-between border-b py-1 last:border-0">
                      <span>{it.quantity}× {it.itemName} <span className="text-muted-foreground">({it.category}, {it.countryOfOrigin})</span></span>
                      <span className="font-mono text-xs text-muted-foreground">{it.hsCode || "HS —"}</span>
                    </div>
                  ))}
                </div>
              )}
              {quote.tradeDocuments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {quote.tradeDocuments.map((d, i) => <Badge key={i} variant="outline" className="text-[10px]">{d.documentType.replace(/_/g, " ")}: {d.fileName}</Badge>)}
                </div>
              )}
              {quote.specialInstructions && <div className="rounded-md bg-muted px-3 py-2 text-xs">Instructions: {quote.specialInstructions}</div>}
            </CardContent>
          </Card>
        )}

        {/* DDP consent — required before payment */}
        {quote.canPay && quote.requiresConsent && !quote.consentAccepted && !editing && (
          <Card className="border-amber-500/40">
            <CardHeader className="pb-3"><CardTitle className="text-base">Customs declaration</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">You must accept the following before paying this Door To Door Freight shipment:</p>
              {([["customs", "I confirm the customs information is accurate and complete."], ["terms", "I accept the shipping terms and conditions."], ["broker", "I authorize Ezhalha to act as customs broker for this shipment."]] as const).map(([k, label]) => (
                <label key={k} className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={consent[k]} onChange={(e) => setConsent({ ...consent, [k]: e.target.checked })} />
                  <span>{label}</span>
                </label>
              ))}
              <Button disabled={!consent.customs || !consent.terms || !consent.broker || acceptTerms.isPending} onClick={() => acceptTerms.mutate()}>
                {acceptTerms.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Accept declaration
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Pricing */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Price</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Row label="Subtotal" value={sar(p.baseRate + p.marginAmount)} />
            {p.discountSar > 0 && <Row label="Discount" value={`− ${sar(p.discountSar)}`} />}
            {p.extraChargeSar > 0 && <Row label="Extra charge" value={sar(p.extraChargeSar)} />}
            <Row label="VAT (15%)" value={sar(p.vatAmountSar)} />
            <div className="mt-2 flex items-center justify-between border-t pt-2 text-base font-bold">
              <span>Total</span><span className="text-primary">{sar(p.clientTotalSar)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Payment */}
        {quote.canPay && !editing && (!quote.requiresConsent || quote.consentAccepted) && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4 text-primary" /> Pay</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <TapCardForm
                amount={p.clientTotalSar}
                currency={quote.currency}
                shipmentId={quote.id}
                submitLabel={`Pay ${sar(p.clientTotalSar)} by card`}
                pending={payCard.isPending}
                onSubmit={(payload) => payCard.mutate(payload)}
                testId="button-pay-quote-card"
              />
              {account?.creditEnabled && (
                <>
                  <div className="relative text-center text-xs text-muted-foreground"><span className="bg-background px-2">or</span><div className="absolute inset-x-0 top-1/2 -z-10 h-px bg-border" /></div>
                  <Button variant="outline" className="w-full" disabled={payCredit.isPending} onClick={() => payCredit.mutate()}>
                    {payCredit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet className="mr-2 h-4 w-4" />} Pay with credit
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </ClientLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
