import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClientLayout } from "@/components/client-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/phone-input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/loading-spinner";
import { SarAmount } from "@/components/sar-symbol";
import { TapCardForm } from "@/components/tap-card-form";
import { CarrierLogo } from "@/components/carrier-logo";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { humanizeError } from "@/lib/friendly-error";
import { useQuotationMode } from "@/lib/quotation-mode";
import { ArrowLeft, ArrowRight, Check, Clock, MapPin, Package, Truck } from "lucide-react";
import type { ClientAccount } from "@shared/schema";

type LocalAddress = {
  name: string;
  phone: string;
  email?: string;
  city: string;
  district?: string;
  addressLine1: string;
  shortAddress?: string;
};

type LocalQuote = {
  quoteId: string;
  carrierCode: string;
  carrierName: string;
  serviceName: string;
  finalPrice: number;
  currency: string;
  transitDays: number;
  chargeableWeight: number;
};

type LocalCheckout = {
  shipmentId: string;
  trackingNumber: string;
  amount: number;
  currency: string;
  carrierCode: string;
  carrierName: string;
  serviceName: string;
  pieces: number;
  weight: number;
};

const emptyAddress: LocalAddress = { name: "", phone: "", email: "", city: "", district: "", addressLine1: "", shortAddress: "" };

const STEP_LABELS = ["Sender", "Recipient", "Package", "Rate", "Payment", "Done"];

// Module-level so its identity stays stable across renders (an inline component would remount
// the whole form on every keystroke and drop input focus).
function QuoteShell({ quoteMode, profile, children }: { quoteMode: boolean; profile?: string | null; children: React.ReactNode }) {
  return quoteMode ? <>{children}</> : <ClientLayout clientProfile={profile ?? undefined}>{children}</ClientLayout>;
}

export default function CreateLocalShipment() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const returnToParam = new URLSearchParams(searchString).get("returnTo");
  const backHref = returnToParam && returnToParam.startsWith("/client/") ? returnToParam : "/client/shipments";
  const backLabel = backHref.includes("/quick-quote") ? "Back to Quick Quote" : "Back to Shipments";
  const { toast } = useToast();
  const quotation = useQuotationMode();
  const quoteMode = Boolean(quotation);
  const [adminRateOptions, setAdminRateOptions] = useState<Record<string, { carrierCode?: string; serviceName: string }>>({});
  const [quotationSent, setQuotationSent] = useState<{ trackingNumber: string } | null>(null);
  const [step, setStep] = useState(1);
  const [shipper, setShipper] = useState<LocalAddress>({ ...emptyAddress });
  const [recipient, setRecipient] = useState<LocalAddress>({ ...emptyAddress });
  const [pieces, setPieces] = useState("1");
  const [weight, setWeight] = useState("");
  const [quotes, setQuotes] = useState<LocalQuote[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<LocalCheckout | null>(null);
  const [confirmed, setConfirmed] = useState<{ trackingNumber: string; carrierName: string } | null>(null);

  const { data: account } = useQuery<ClientAccount>({ queryKey: [quoteMode ? `/api/admin/quotations/client/${quotation!.clientAccountId}` : "/api/client/account"] });
  const { data: creditAccess } = useQuery<{ creditEnabled: boolean }>({ queryKey: ["/api/client/credit-access"], enabled: !quoteMode });

  // Prefill the sender from the account's default shipping contact once.
  useEffect(() => {
    if (!account) return;
    setShipper((prev) => {
      if (prev.name || prev.addressLine1) return prev;
      return {
        name: account.shippingContactName || account.name || "",
        phone: account.shippingContactPhone || account.phone || "",
        email: account.email || "",
        city: account.shippingCity || "",
        district: (account as any).shippingStateOrProvince || "",
        addressLine1: account.shippingAddressLine1 || "",
        shortAddress: account.shippingShortAddress || "",
      };
    });
  }, [account]);

  // Build an admin-quotation address (adds SA + placeholders the domestic form doesn't collect).
  const quoteAddress = (a: LocalAddress) => ({ name: a.name, phone: a.phone, email: a.email || "", addressLine1: a.addressLine1, city: a.city, stateOrProvince: a.district || "", postalCode: "", countryCode: "SA", shortAddress: a.shortAddress || "" });

  const ratesMutation = useMutation({
    mutationFn: async () => {
      if (quoteMode) {
        const res = await apiRequest("POST", "/api/admin/quotations/rates", {
          clientAccountId: quotation!.clientAccountId, type: "local",
          shipper: quoteAddress(shipper), recipient: quoteAddress(recipient),
          packages: [{ weight: Number(weight) || 0, length: 0, width: 0, height: 0 }],
          weightUnit: "KG", dimensionUnit: "CM",
        });
        const body = await res.json() as { options: Array<{ carrierCode?: string; carrierName?: string; serviceName: string; clientTotal: number }> };
        const map: Record<string, { carrierCode?: string; serviceName: string }> = {};
        const quotes: LocalQuote[] = body.options.map((o, i) => {
          const quoteId = `q${i}`;
          map[quoteId] = { carrierCode: o.carrierCode, serviceName: o.serviceName };
          return { quoteId, carrierCode: o.carrierCode || "", carrierName: o.carrierName || o.serviceName, serviceName: o.serviceName, finalPrice: o.clientTotal, currency: "SAR", transitDays: 2, chargeableWeight: Number(weight) || 0 };
        });
        setAdminRateOptions(map);
        return { quotes };
      }
      const res = await apiRequest("POST", "/api/client/local/rates", {
        shipper,
        recipient,
        pieces: Number(pieces) || 1,
        weight: Number(weight),
        weightUnit: "KG",
        currency: "SAR",
      });
      return res.json() as Promise<{ quotes: LocalQuote[] }>;
    },
    onSuccess: (data) => {
      setQuotes(data.quotes || []);
      setSelectedQuoteId(data.quotes?.[0]?.quoteId || null);
      setStep(4);
    },
    onError: (error: Error) => toast({ title: "No rates", description: humanizeError(error), variant: "destructive" }),
  });

  const checkoutMutation = useMutation({
    mutationFn: async (quoteId: string) => {
      if (quoteMode) {
        const opt = adminRateOptions[quoteId];
        const res = await apiRequest("POST", "/api/admin/quotations", {
          clientAccountId: quotation!.clientAccountId, type: "local",
          shipper: quoteAddress(shipper), recipient: quoteAddress(recipient),
          packages: [{ weight: Number(weight) || 0, length: 0, width: 0, height: 0 }],
          weightUnit: "KG", dimensionUnit: "CM",
          carrierCode: opt?.carrierCode, serviceName: opt?.serviceName,
          sendNotification: true,
        });
        return res.json() as Promise<LocalCheckout>;
      }
      const res = await apiRequest("POST", "/api/client/local/checkout", { quoteId });
      return res.json() as Promise<LocalCheckout>;
    },
    onSuccess: (data) => {
      if (quoteMode) { setQuotationSent({ trackingNumber: (data as any).trackingNumber || "" }); setStep(6); return; }
      setCheckout(data);
      setStep(5);
    },
    onError: (error: Error) => toast({ title: "Checkout failed", description: humanizeError(error), variant: "destructive" }),
  });

  const payMutation = useMutation({
    mutationFn: async (payload: { shipmentId: string; tapTokenId?: string; saveCardForFuture?: boolean }) => {
      const res = await apiRequest("POST", "/api/client/shipments/pay", payload);
      return res.json() as Promise<{ transactionUrl?: string; paymentStatus?: string; paymentId?: string; shipmentId: string }>;
    },
    onSuccess: (data) => {
      if (data.transactionUrl) {
        window.location.href = data.transactionUrl;
        return;
      }
      if (["CAPTURED", "AUTHORIZED"].includes(String(data.paymentStatus || "").toUpperCase())) {
        confirmMutation.mutate({ shipmentId: data.shipmentId, paymentIntentId: data.paymentId });
        return;
      }
      toast({ title: "Payment initiated", description: "Your payment is being processed." });
    },
    onError: (error: Error) => toast({ title: "Payment failed", description: humanizeError(error), variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: async (params: { shipmentId: string; paymentIntentId?: string }) => {
      const res = await apiRequest("POST", "/api/client/shipments/confirm", params);
      return res.json() as Promise<{ shipment?: { trackingNumber?: string; carrierName?: string } }>;
    },
    onSuccess: (data) => {
      finishConfirmed(data.shipment?.trackingNumber, data.shipment?.carrierName);
    },
    onError: (error: Error) => toast({ title: "Failed to confirm", description: humanizeError(error), variant: "destructive" }),
  });

  const payLaterMutation = useMutation({
    mutationFn: async (shipmentId: string) => {
      const res = await apiRequest("POST", `/api/client/shipments/${shipmentId}/pay-later`);
      return res.json() as Promise<{ shipment?: { trackingNumber?: string; carrierName?: string } }>;
    },
    onSuccess: (data) => {
      finishConfirmed(data.shipment?.trackingNumber, data.shipment?.carrierName);
      toast({ title: "Credit invoice created", description: "Shipment created with Pay Later. Invoice due in 30 days." });
    },
    onError: (error: Error) => toast({ title: "Pay Later failed", description: humanizeError(error), variant: "destructive" }),
  });

  const finishConfirmed = (trackingNumber?: string, carrierName?: string) => {
    setConfirmed({ trackingNumber: trackingNumber || checkout?.trackingNumber || "", carrierName: carrierName || checkout?.carrierName || "" });
    setStep(6);
    ["/api/client/shipments", "/api/client/shipments/recent", "/api/client/stats", "/api/client/invoices", "/api/client/payments"].forEach((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    );
  };

  const addressValid = (a: LocalAddress) => a.name.trim() && a.phone.trim() && a.city.trim() && a.addressLine1.trim() && (a.shortAddress || "").trim();

  // Prevent duplicate shipments on back → forward: reuse existing quotes / checkout when the
  // inputs are unchanged instead of re-fetching (new quote id) or re-creating the shipment.
  const lastRatesSignatureRef = useRef<string | null>(null);
  const lastCheckoutSignatureRef = useRef<string | null>(null);
  const localRatesSignature = () => JSON.stringify({ shipper, recipient, pieces, weight });
  const submitLocalRates = () => {
    if (ratesMutation.isPending) return;
    if (quotes.length && localRatesSignature() === lastRatesSignatureRef.current) { setStep(4); return; }
    lastRatesSignatureRef.current = localRatesSignature();
    ratesMutation.mutate();
  };
  const submitLocalCheckout = () => {
    if (!selectedQuoteId || checkoutMutation.isPending) return;
    const signature = JSON.stringify({ selectedQuoteId, shipper, recipient, pieces, weight });
    if (signature === lastCheckoutSignatureRef.current && (checkout || quotationSent)) {
      setStep(quoteMode ? 6 : 5);
      return;
    }
    lastCheckoutSignatureRef.current = signature;
    checkoutMutation.mutate(selectedQuoteId);
  };

  const addressForm = (value: LocalAddress, set: (a: LocalAddress) => void) => (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1"><Label>Full name *</Label><Input value={value.name} onChange={(e) => set({ ...value, name: e.target.value })} /></div>
        <div className="space-y-1"><Label>Phone *</Label><PhoneInput value={value.phone} onChange={(v) => set({ ...value, phone: v })} defaultCountry="SA" /></div>
      </div>
      <div className="space-y-1"><Label>Address line *</Label><Input value={value.addressLine1} onChange={(e) => set({ ...value, addressLine1: e.target.value })} placeholder="Street, building" /></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1"><Label>City *</Label><Input value={value.city} onChange={(e) => set({ ...value, city: e.target.value })} placeholder="Riyadh" /></div>
        <div className="space-y-1"><Label>District</Label><Input value={value.district} onChange={(e) => set({ ...value, district: e.target.value })} placeholder="Olaya" /></div>
      </div>
      <div className="space-y-1">
        <Label>National Address *</Label>
        <Input value={value.shortAddress || ""} onChange={(e) => set({ ...value, shortAddress: e.target.value })} placeholder="e.g. RCTB4359" />
        <p className="text-xs text-muted-foreground">Saudi National Address short code</p>
      </div>
    </div>
  );

  return (
    <QuoteShell quoteMode={quoteMode} profile={account?.profile}>
      <div className="mx-auto max-w-3xl space-y-5 p-6">
        {!quoteMode && (
          <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> {backLabel}
          </Link>
        )}

        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><MapPin className="h-6 w-6 text-primary" /> Local Shipment</h1>
          <p className="text-muted-foreground text-sm mt-1">Domestic KSA delivery. Just sender, recipient, packages and weight — no customs, invoices or item lists.</p>
        </div>

        {/* stepper */}
        <div className="flex items-center justify-between">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            return (
              <div key={label} className="flex items-center flex-1 last:flex-none">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${n <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {n < step ? <Check className="h-4 w-4" /> : n}
                </div>
                {i < STEP_LABELS.length - 1 && <div className={`h-1 flex-1 mx-2 rounded ${n < step ? "bg-primary" : "bg-muted"}`} />}
              </div>
            );
          })}
        </div>

        {step === 1 && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4" /> Sender Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {addressForm(shipper, setShipper)}
              <div className="flex justify-end">
                <Button disabled={!addressValid(shipper)} onClick={() => setStep(2)}>Next: Recipient <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4" /> Recipient Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {addressForm(recipient, setRecipient)}
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
                <Button disabled={!addressValid(recipient)} onClick={() => setStep(3)}>Next: Package <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4" /> Package Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground rounded-lg bg-muted px-4 py-3">Local shipments need only packages & total weight — no item list, commercial invoice or HS codes.</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1"><Label>Number of packages *</Label><Input type="number" min="1" value={pieces} onChange={(e) => setPieces(e.target.value)} /></div>
                <div className="space-y-1"><Label>Total weight (kg) *</Label><Input type="number" min="0" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="2.4" /></div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
                <Button disabled={!(Number(weight) > 0 && Number(pieces) >= 1) || ratesMutation.isPending} onClick={submitLocalRates}>
                  {ratesMutation.isPending ? <><LoadingSpinner size="sm" className="mr-2" /> Getting rates...</> : <>Next: Select Rate <ArrowRight className="ml-2 h-4 w-4" /></>}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 4 && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4" /> Select Rate · {shipper.city} → {recipient.city} · {weight} kg</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {quotes.map((q) => (
                <div
                  key={q.quoteId}
                  onClick={() => setSelectedQuoteId(q.quoteId)}
                  className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer hover-elevate ${selectedQuoteId === q.quoteId ? "border-primary bg-primary/5" : "border-border"}`}
                  data-testid={`rate-${q.carrierCode}`}
                >
                  <input type="radio" checked={selectedQuoteId === q.quoteId} onChange={() => setSelectedQuoteId(q.quoteId)} />
                  <CarrierLogo carrierCode={q.carrierCode} carrierName={q.carrierName} className="h-7 w-auto max-w-[110px] object-contain" />
                  <div className="flex-1">
                    <p className="font-semibold">{q.carrierName}</p>
                    <p className="text-xs text-muted-foreground">{q.serviceName} · ~{q.transitDays} days</p>
                  </div>
                  <div className="font-bold text-lg"><SarAmount amount={q.finalPrice} /></div>
                </div>
              ))}
              {quotes.length === 0 && <p className="text-sm text-muted-foreground">No rates available.</p>}
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(3)}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
                <Button disabled={!selectedQuoteId || checkoutMutation.isPending} onClick={submitLocalCheckout}>
                  {checkoutMutation.isPending ? <><LoadingSpinner size="sm" className="mr-2" /> {quoteMode ? "Sending…" : "Preparing..."}</> : <>{quoteMode ? "Send quotation to client" : "Next: Payment"} <ArrowRight className="ml-2 h-4 w-4" /></>}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 5 && checkout && (
          <Card>
            <CardHeader><CardTitle className="text-base">Payment · {checkout.carrierName}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span>Tracking</span><span className="font-mono">{checkout.trackingNumber}</span></div>
                <div className="flex justify-between"><span>Packages · Weight</span><span>{checkout.pieces} · {checkout.weight} kg</span></div>
                <div className="flex justify-between font-bold text-base"><span>Total (incl. VAT)</span><span><SarAmount amount={checkout.amount} /></span></div>
              </div>

              <TapCardForm
                amount={checkout.amount}
                currency={checkout.currency}
                shipmentId={checkout.shipmentId}
                submitLabel="Pay Now"
                pending={payMutation.isPending || confirmMutation.isPending}
                onSubmit={(payload: any) => payMutation.mutate({ shipmentId: checkout.shipmentId, tapTokenId: payload.tapTokenId, saveCardForFuture: payload.saveCardForFuture })}
                testId="button-local-pay-now"
              />

              {creditAccess?.creditEnabled && (
                <>
                  <div className="relative flex items-center py-1"><div className="flex-grow border-t" /><span className="px-3 text-xs text-muted-foreground uppercase">or</span><div className="flex-grow border-t" /></div>
                  <Button variant="outline" className="w-full" disabled={payLaterMutation.isPending || payMutation.isPending} onClick={() => payLaterMutation.mutate(checkout.shipmentId)} data-testid="button-local-pay-later">
                    {payLaterMutation.isPending ? <><LoadingSpinner size="sm" className="mr-2" /> Creating credit invoice...</> : <><Clock className="mr-2 h-4 w-4" /> Pay Later (Credit)</>}
                  </Button>
                </>
              )}

              <div className="flex justify-start">
                <Button variant="ghost" size="sm" onClick={() => setStep(4)}><ArrowLeft className="mr-2 h-4 w-4" /> Back to rates</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 6 && quoteMode && quotationSent && (
          <Card>
            <CardContent className="py-10 text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600"><Check className="h-7 w-7" /></div>
              <h2 className="text-xl font-bold">Quotation sent to client</h2>
              <p className="text-muted-foreground text-sm">
                Quotation <b>{quotationSent.trackingNumber}</b> was created for {quotation?.clientName || "the client"} and they've been notified to review, modify and pay.
              </p>
              <Button onClick={() => navigate("/admin/shipments")}>Back to shipments</Button>
            </CardContent>
          </Card>
        )}
        {step === 6 && !quoteMode && confirmed && (
          <Card>
            <CardContent className="py-10 text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600"><Check className="h-7 w-7" /></div>
              <h2 className="text-xl font-bold">Local shipment created</h2>
              <p className="text-muted-foreground text-sm">
                Tracking <b>{confirmed.trackingNumber}</b>{confirmed.carrierName ? <> · {confirmed.carrierName}</> : null}. Operations will book and dispatch it.
              </p>
              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={() => navigate("/client/shipments")}>View shipments</Button>
                <Button onClick={() => window.location.reload()}>New local shipment</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </QuoteShell>
  );
}
