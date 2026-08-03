import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ClientLayout } from "@/components/client-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/loading-spinner";
import { SarAmount } from "@/components/sar-symbol";
import { TapCardForm } from "@/components/tap-card-form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, readJsonResponse } from "@/lib/queryClient";
import type { ClientAccount } from "@shared/schema";
import { ArrowLeft, ArrowRight, Check, Clock, Truck, FileText } from "lucide-react";

interface OrderRow {
  id: string;
  externalOrderNumber: string | null;
  externalOrderId: string;
  status: string;
  customer: string | null;
  shipTo: string | null;
  packageWeightKg: string | null;
  packagePieces: number;
  orderTotal: string | null;
  currency: string;
  shipmentId: string | null;
}
interface OrderRate {
  carrierCode: string;
  carrierName: string;
  serviceName: string;
  totalAmountSar: number;
  currency: string;
}
interface FulfillResult {
  shipmentId: string;
  trackingNumber: string;
  amount: number;
  currency: string;
  carrierCode: string;
  carrierName: string;
}

const STEP_LABELS = ["Review order", "Select carrier", "Payment", "Done"];

function parseJson<T>(v: string | null): T | Record<string, never> {
  if (!v) return {}; try { return JSON.parse(v); } catch { return {}; }
}

export default function OrderFulfill() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/client/orders/:id/fulfill");
  const orderId = params?.id;

  const { data: account } = useQuery<ClientAccount>({ queryKey: ["/api/client/account"] });
  const { data: creditAccess } = useQuery<{ creditEnabled: boolean }>({ queryKey: ["/api/client/credit-access"] });
  const { data: order, isLoading } = useQuery<OrderRow>({
    queryKey: ["/api/client/orders", orderId],
    enabled: Boolean(orderId),
    queryFn: async () => readJsonResponse<OrderRow>(await apiRequest("GET", `/api/client/orders/${orderId}`)),
  });

  const [step, setStep] = useState(1);
  const [weight, setWeight] = useState("");
  const [selectedCarrier, setSelectedCarrier] = useState<string | null>(null);
  const [result, setResult] = useState<FulfillResult | null>(null);
  const [confirmed, setConfirmed] = useState<{ trackingNumber: string; carrierName: string } | null>(null);

  const effectiveWeight = weight ? Number(weight) : order?.packageWeightKg ? Number(order.packageWeightKg) : 0;

  const { data: rateData, isLoading: ratesLoading } = useQuery<{ weightKg: number; rates: OrderRate[] }>({
    queryKey: ["/api/client/orders", orderId, "rates", effectiveWeight],
    enabled: step >= 2 && Boolean(orderId) && effectiveWeight > 0,
    queryFn: async () =>
      readJsonResponse<{ weightKg: number; rates: OrderRate[] }>(
        await apiRequest("GET", `/api/client/orders/${orderId}/rates?weightKg=${effectiveWeight}`),
      ),
  });

  const fulfillMutation = useMutation({
    mutationFn: async () => {
      const body: { carrierCode: string; weightKg?: number } = { carrierCode: selectedCarrier! };
      if (weight) body.weightKg = Number(weight);
      return readJsonResponse<FulfillResult>(await apiRequest("POST", `/api/client/orders/${orderId}/fulfill`, body));
    },
    onSuccess: (data) => { setResult(data); setStep(3); },
    onError: (e: Error) => toast({ title: "Could not create shipment", description: e.message, variant: "destructive" }),
  });

  const payMutation = useMutation({
    mutationFn: async (payload: { shipmentId: string; tapTokenId?: string; saveCardForFuture?: boolean }) =>
      readJsonResponse<{ transactionUrl?: string; paymentStatus?: string; paymentId?: string; shipmentId: string }>(
        await apiRequest("POST", "/api/client/shipments/pay", payload),
      ),
    onSuccess: (data) => {
      if (data.transactionUrl) { window.location.href = data.transactionUrl; return; }
      if (["CAPTURED", "AUTHORIZED"].includes(String(data.paymentStatus || "").toUpperCase())) {
        confirmMutation.mutate({ shipmentId: data.shipmentId, paymentIntentId: data.paymentId });
        return;
      }
      toast({ title: "Payment initiated", description: "Your payment is being processed." });
    },
    onError: (e: Error) => toast({ title: "Payment failed", description: e.message, variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: async (p: { shipmentId: string; paymentIntentId?: string }) =>
      readJsonResponse<{ shipment?: { trackingNumber?: string; carrierName?: string } }>(
        await apiRequest("POST", "/api/client/shipments/confirm", p),
      ),
    onSuccess: (data) => finish(data.shipment?.trackingNumber, data.shipment?.carrierName),
    onError: (e: Error) => toast({ title: "Failed to confirm", description: e.message, variant: "destructive" }),
  });

  const payLaterMutation = useMutation({
    mutationFn: async (shipmentId: string) =>
      readJsonResponse<{ shipment?: { trackingNumber?: string; carrierName?: string } }>(
        await apiRequest("POST", `/api/client/shipments/${shipmentId}/pay-later`),
      ),
    onSuccess: (data) => {
      finish(data.shipment?.trackingNumber, data.shipment?.carrierName);
      toast({ title: "Credit invoice created", description: "Fulfilled with Pay Later. Invoice due in 30 days." });
    },
    onError: (e: Error) => toast({ title: "Pay Later failed", description: e.message, variant: "destructive" }),
  });

  const finish = (trackingNumber?: string, carrierName?: string) => {
    setConfirmed({ trackingNumber: trackingNumber || result?.trackingNumber || "", carrierName: carrierName || result?.carrierName || "" });
    setStep(4);
    ["/api/client/orders", "/api/client/shipments", "/api/client/shipments/recent", "/api/client/stats", "/api/client/invoices"].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k] }),
    );
  };

  if (isLoading || !order) {
    return <ClientLayout clientProfile={account?.profile}><div className="flex justify-center py-24"><LoadingSpinner /></div></ClientLayout>;
  }

  const customer = parseJson<{ name?: string; phone?: string }>(order.customer);
  const shipTo = parseJson<{ address?: string; city?: string; region?: string }>(order.shipTo);
  const orderLabel = `#${order.externalOrderNumber || order.externalOrderId}`;

  return (
    <ClientLayout clientProfile={account?.profile}>
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">
        <Button variant="ghost" size="sm" onClick={() => navigate("/client/orders")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Orders
        </Button>

        {/* stepper */}
        <div className="flex items-center justify-center">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            return (
              <div key={label} className="flex items-center">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${n <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {n < step ? <Check className="h-4 w-4" /> : n}
                </div>
                {i < STEP_LABELS.length - 1 && <div className={`h-1 w-10 mx-1.5 rounded ${n < step ? "bg-primary" : "bg-muted"}`} />}
              </div>
            );
          })}
        </div>
        <p className="text-center text-sm text-muted-foreground -mt-2">{STEP_LABELS[step - 1]}</p>

        {/* Step 1 — review */}
        {step === 1 && (
          <>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> Review order {orderLabel}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Ship from (your pickup)</div>
                    <b>{account?.shippingContactName || account?.name}</b>
                    <div className="text-xs text-muted-foreground">{account?.shippingCity || "—"} · {account?.shippingContactPhone || account?.phone || ""}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Ship to (customer)</div>
                    <b>{customer.name || "—"}</b>
                    <div className="text-xs text-muted-foreground">{[shipTo.address, shipTo.city].filter(Boolean).join(", ")} · {customer.phone || ""}</div>
                  </div>
                </div>
                <div className="rounded-lg bg-muted p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Pieces</span><b>{order.packagePieces}</b></div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Weight (kg)</span>
                    <Input type="number" min="0.1" step="0.1" className="w-28 h-8 text-right"
                      value={weight} placeholder={order.packageWeightKg ? String(Number(order.packageWeightKg)) : "enter"}
                      onChange={(e) => setWeight(e.target.value)} data-testid="input-fulfill-weight" />
                  </div>
                  {order.orderTotal && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Order value (info only)</span><b><SarAmount amount={Number(order.orderTotal)} /></b></div>
                  )}
                </div>
                {shipTo.city && (
                  <p className="text-xs rounded-lg bg-amber-500/10 text-amber-600 p-3">
                    Customer address auto-mapped to KSA city <b>{shipTo.city}</b>. It was normalized on import.
                  </p>
                )}
              </CardContent>
            </Card>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => navigate("/client/orders")}>Cancel</Button>
              <Button disabled={!(effectiveWeight > 0)} onClick={() => setStep(2)}>
                Next: Select carrier <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </>
        )}

        {/* Step 2 — select carrier */}
        {step === 2 && (
          <>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base">
                <Truck className="h-4 w-4" /> Select carrier · {shipTo.city || "KSA"} · {effectiveWeight} kg
              </CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {ratesLoading ? (
                  <div className="flex justify-center py-6"><LoadingSpinner /></div>
                ) : !rateData?.rates.length ? (
                  <p className="text-sm text-muted-foreground">No local carriers available for this weight.</p>
                ) : (
                  rateData.rates.map((rate) => (
                    <button key={rate.carrierCode} type="button" onClick={() => setSelectedCarrier(rate.carrierCode)}
                      className={`w-full flex items-center gap-3 rounded-lg border p-3.5 text-left transition-colors ${selectedCarrier === rate.carrierCode ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                      data-testid={`rate-${rate.carrierCode}`}>
                      <input type="radio" readOnly checked={selectedCarrier === rate.carrierCode} />
                      <div className="flex-1">
                        <b>{rate.carrierName}</b>
                        <div className="text-xs text-muted-foreground">{rate.serviceName} · tracked</div>
                      </div>
                      <SarAmount amount={rate.totalAmountSar} className="font-bold text-base" />
                    </button>
                  ))
                )}
              </CardContent>
            </Card>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4 mr-1.5" /> Back</Button>
              <Button disabled={!selectedCarrier || fulfillMutation.isPending} onClick={() => fulfillMutation.mutate()}>
                {fulfillMutation.isPending ? <><LoadingSpinner size="sm" className="mr-2" /> Preparing…</> : <>Next: Payment <ArrowRight className="h-4 w-4 ml-1.5" /></>}
              </Button>
            </div>
          </>
        )}

        {/* Step 3 — payment */}
        {step === 3 && result && (
          <>
            <Card>
              <CardHeader><CardTitle className="text-base">Payment · {result.carrierName}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-muted p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span>Tracking</span><span className="font-mono">{result.trackingNumber}</span></div>
                  <div className="flex justify-between font-bold text-base"><span>Total (incl. VAT)</span><span><SarAmount amount={result.amount} /></span></div>
                </div>
                <TapCardForm
                  amount={result.amount}
                  currency={result.currency}
                  shipmentId={result.shipmentId}
                  submitLabel="Pay Now"
                  pending={payMutation.isPending || confirmMutation.isPending}
                  onSubmit={(p: any) => payMutation.mutate({ shipmentId: result.shipmentId, tapTokenId: p.tapTokenId, saveCardForFuture: p.saveCardForFuture })}
                  testId="button-fulfill-pay-now"
                />
                {creditAccess?.creditEnabled && (
                  <>
                    <div className="relative flex items-center py-1"><div className="flex-grow border-t" /><span className="px-3 text-xs text-muted-foreground uppercase">or</span><div className="flex-grow border-t" /></div>
                    <Button variant="outline" className="w-full" disabled={payLaterMutation.isPending || payMutation.isPending}
                      onClick={() => payLaterMutation.mutate(result.shipmentId)} data-testid="button-fulfill-pay-later">
                      {payLaterMutation.isPending ? <><LoadingSpinner size="sm" className="mr-2" /> Creating credit invoice…</> : <><Clock className="mr-2 h-4 w-4" /> Pay Later (Credit)</>}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground text-center">
              Shipment already created as payment-pending — complete payment to book it, or find it later under Shipments.
            </p>
          </>
        )}

        {/* Step 4 — done */}
        {step === 4 && confirmed && (
          <Card>
            <CardContent className="py-10 text-center space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600"><Check className="h-8 w-8" /></div>
              <h2 className="text-xl font-bold">Order {orderLabel} fulfilled</h2>
              <p className="text-muted-foreground text-sm">
                Shipment booked{confirmed.carrierName ? <> with <b>{confirmed.carrierName}</b></> : null}. Tracking <b>{confirmed.trackingNumber}</b>.
                Operations will dispatch it.
              </p>
              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={() => navigate("/client/orders")}>Back to Orders</Button>
                <Button onClick={() => navigate("/client/shipments")}>View shipments</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ClientLayout>
  );
}
