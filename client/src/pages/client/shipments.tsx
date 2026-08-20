import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ClientLayout } from "@/components/client-layout";
import { CarrierTrackingLink } from "@/components/carrier-tracking-link";
import { StatusBadge } from "@/components/status-badge";
import { TapCardForm } from "@/components/tap-card-form";
import { LoadingScreen } from "@/components/loading-spinner";
import { NoShipments } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Eye, MapPin, Package, Calendar, Ban, Loader2, Tag, AlertTriangle, Download, CreditCard, Pencil, Clock } from "lucide-react";
import { EditPendingShipmentDialog } from "@/components/edit-pending-shipment-dialog";
import { SarAmount, formatCurrencyAmount } from "@/components/sar-symbol";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { humanizeError } from "@/lib/friendly-error";
import type { Shipment, ClientAccount, ShipmentItem } from "@shared/schema";
import { format } from "date-fns";

// Each filter tab covers a set of carrier-synced statuses; without this a shipment sitting at
// "picked_up" or "customs_clearance" appears only under "All".
const statusFilterGroups: Record<string, string[]> = {
  processing: ["draft", "payment_pending", "created", "processing"],
  in_transit: ["picked_up", "in_transit", "customs_clearance", "out_for_delivery"],
  attention: ["on_hold", "returned", "carrier_error"],
  delivered: ["delivered"],
};

function canCancelShipment(shipment: Shipment): boolean {
  const carrierStatus = String((shipment as any).carrierStatus || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const pickedUpOrLaterStatuses = ["picked_up", "in_transit", "out_for_delivery", "on_hold", "returned", "delivered", "cancelled"];

  return (
    ["created", "processing", "carrier_error", "payment_pending"].includes(shipment.status) &&
    !pickedUpOrLaterStatuses.includes(carrierStatus)
  );
}

function canPayShipment(shipment: Shipment): boolean {
  return (
    shipment.paymentStatus !== "paid" &&
    String((shipment as any).paymentMethod || "PAY_NOW").toUpperCase() !== "CREDIT" &&
    ["payment_pending", "carrier_error"].includes(String(shipment.status || "").toLowerCase())
  );
}

// Shipment fulfillment kind for the list "Type" column (Door To Door / Local / Express).
function formatShipmentKindLabel(shipment: Shipment): string {
  if (shipment.fulfillmentType === "ddp_manual" || (shipment as any).isDdp || shipment.carrierCode === "DDP") {
    return "Door to Door";
  }
  if (shipment.fulfillmentType === "local") return "Local";
  return "Express";
}

function formatPackageWord(count: number) {
  return `${count} package${count === 1 ? "" : "s"}`;
}

function formatChargeablePackageCounts(packages: any[]) {
  const dimensionalPackages = packages.filter((pkg) => pkg?.usesDimensionalWeight).length;
  const actualPackages = Math.max(packages.length - dimensionalPackages, 0);

  return `${formatPackageWord(actualPackages)} charged by actual weight. ${formatPackageWord(dimensionalPackages)} charged by dimensional weight.`;
}

type ShipmentCheckoutSummary = {
  shipmentId: string;
  trackingNumber: string;
  amount: number;
  originalAmount: number;
  currency: string;
  paymentStatus: string;
  canPay: boolean;
  activeOffer: null | {
    recoveryId: string;
    discountType: string | null;
    discountValue: number;
    discountAmount: number;
    originalAmount: number;
    finalAmount: number;
    expiresAt: string | null;
    channel: string | null;
  };
};

export default function ClientShipments() {
  const [location, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [editShipment, setEditShipment] = useState<Shipment | null>(null);
  const [resumedShipmentId, setResumedShipmentId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: account } = useQuery<ClientAccount>({
    queryKey: ["/api/client/account"],
  });

  // Carrier status is refreshed server-side every 10 minutes, but the app's global query defaults
  // are staleTime: Infinity with no window-focus refetch — so without these overrides this list
  // shows whatever the status was when the tab was opened, for as long as it stays open.
  const { data: shipments, isLoading } = useQuery<Shipment[]>({
    queryKey: ["/api/client/shipments"],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const { data: checkoutSummary, isLoading: isLoadingCheckoutSummary } = useQuery<ShipmentCheckoutSummary>({
    queryKey: ["/api/client/shipments", selectedShipment?.id, "checkout-summary", selectedShipment?.id === resumedShipmentId ? "resume_link" : "direct"],
    queryFn: async () => {
      const sourceQuery = selectedShipment?.id === resumedShipmentId ? "?source=resume_link" : "";
      const response = await fetch(`/api/client/shipments/${selectedShipment!.id}/checkout-summary${sourceQuery}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to load checkout summary.");
      }
      return response.json();
    },
    enabled: Boolean(selectedShipment && canPayShipment(selectedShipment)),
  });

  // Whether this client may pay on credit. The create-shipment wizard already asks; this list is
  // the only other place a pending shipment can be paid, so it has to ask too.
  const { data: creditAccess } = useQuery<{ creditEnabled: boolean; request: { status?: string } | null }>({
    queryKey: ["/api/client/credit-access"],
  });

  const payLaterMutation = useMutation({
    mutationFn: async (shipmentId: string) => {
      const res = await apiRequest("POST", `/api/client/shipments/${shipmentId}/pay-later`);
      return res.json();
    },
    onSuccess: () => {
      ["/api/client/shipments", "/api/client/shipments/recent", "/api/client/stats", "/api/client/credit-invoices"].forEach(
        (key) => queryClient.invalidateQueries({ queryKey: [key] }),
      );
      setSelectedShipment(null);
      toast({
        title: "Credit invoice created",
        description: "Your shipment is confirmed with Pay Later. The invoice is due in 30 days.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Pay Later failed", description: humanizeError(error), variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/client/shipments/${id}/cancel`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/shipments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/shipments/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/stats"] });
      setSelectedShipment(null);
      toast({
        title: "Shipment Cancelled",
        description: data?.refundRequest
          ? "Your shipment was cancelled and a refund request was submitted for approval."
          : "Your shipment has been cancelled successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const payShipmentMutation = useMutation({
    mutationFn: async (payload: { shipmentId: string; tapTokenId?: string; saveCardForFuture?: boolean; returnPath?: string }) => {
      const res = await apiRequest("POST", "/api/client/shipments/pay", payload);
      return res.json() as Promise<{
        shipmentId: string;
        trackingNumber: string;
        paymentId: string;
        transactionUrl?: string;
        amount: number;
        currency: string;
        paymentStatus: string;
      }>;
    },
    onSuccess: (data) => {
      if (data.transactionUrl) {
        window.location.href = data.transactionUrl;
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["/api/client/shipments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/shipments/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/financial-statements"] });
      setSelectedShipment(null);
      toast({
        title: "Payment Successful",
        description: "Your shipment payment was completed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Payment Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredShipments = shipments?.filter((shipment) => {
    const matchesSearch =
      shipment.trackingNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      shipment.recipientName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilterGroups[statusFilter] ?? [statusFilter]).includes(shipment.status);
    return matchesSearch && matchesStatus;
  });

  useEffect(() => {
    if (!shipments?.length) {
      return;
    }

    const resumeShipmentId = new URLSearchParams(window.location.search).get("resumeShipment");
    if (!resumeShipmentId || selectedShipment?.id === resumeShipmentId) {
      return;
    }

    const shipmentToResume = shipments.find((shipment) => shipment.id === resumeShipmentId);
    if (!shipmentToResume) {
      return;
    }

    setStatusFilter("all");
    setResumedShipmentId(resumeShipmentId);
    setSelectedShipment(shipmentToResume);
    window.history.replaceState(null, "", "/client/shipments");
  }, [location, selectedShipment?.id, shipments]);

  if (isLoading) {
    return (
      <ClientLayout clientProfile={account?.profile}>
        <LoadingScreen message="Loading shipments..." />
      </ClientLayout>
    );
  }

  return (
    <ClientLayout clientProfile={account?.profile}>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Shipments</h1>
            <p className="text-muted-foreground">
              Manage and track all your shipments
            </p>
          </div>
          <Button onClick={() => navigate("/client/shipments/new")} data-testid="button-create-shipment">
            <Plus className="mr-2 h-4 w-4" />
            Create Shipment
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by shipment ID or recipient..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
              <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                <TabsList>
                  <TabsTrigger value="all" data-testid="tab-all">
                    All
                  </TabsTrigger>
                  <TabsTrigger value="processing" data-testid="tab-processing">
                    Processing
                  </TabsTrigger>
                  <TabsTrigger value="in_transit" data-testid="tab-in-transit">
                    In Transit
                  </TabsTrigger>
                  <TabsTrigger value="attention" data-testid="tab-attention">
                    Attention
                  </TabsTrigger>
                  <TabsTrigger value="delivered" data-testid="tab-delivered">
                    Delivered
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardContent>
        </Card>

        {/* Shipments Table */}
        <Card>
          <CardContent className="p-0">
            {filteredShipments && filteredShipments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shipment ID</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Carrier</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Shipment</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>ETA</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredShipments.map((shipment) => (
                    <TableRow key={shipment.id} data-testid={`row-shipment-${shipment.id}`}>
                      <TableCell className="font-mono text-sm font-medium">
                        {shipment.trackingNumber}
                      </TableCell>
                      <TableCell>{shipment.recipientName}</TableCell>
                      <TableCell className="text-sm">
                        {shipment.recipientCity}, {shipment.recipientCountry}
                      </TableCell>
                      <TableCell className="text-sm">
                        {shipment.carrierName || shipment.carrierCode || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{formatShipmentKindLabel(shipment)}</Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={shipment.status} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={shipment.paymentStatus || "pending"} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(shipment.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {shipment.estimatedDelivery ? format(new Date(shipment.estimatedDelivery), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <SarAmount amount={Number(shipment.clientTotalAmountSar ?? shipment.finalPrice ?? 0)} />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedShipment(shipment)}
                          data-testid={`button-view-${shipment.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <NoShipments onCreateNew={() => navigate("/client/shipments/new")} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Shipment Detail Sheet */}
      <Sheet open={!!selectedShipment} onOpenChange={() => setSelectedShipment(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Shipment Details
            </SheetTitle>
          </SheetHeader>

          {selectedShipment && (
            <div className="mt-6 space-y-6">
              {/* Shipment ID & Status */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm text-muted-foreground">Shipment ID</p>
                  <p className="font-mono font-medium">{selectedShipment.trackingNumber}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={selectedShipment.status} />
                  <StatusBadge status={selectedShipment.paymentStatus || "pending"} />
                </div>
              </div>
              {selectedShipment.estimatedDelivery && (
                <div>
                  <p className="text-sm text-muted-foreground">Estimated Delivery</p>
                  <p className="font-medium">
                    {format(new Date(selectedShipment.estimatedDelivery), "EEE, MMM d, yyyy")}
                  </p>
                </div>
              )}
              {selectedShipment.carrierTrackingNumber && (
                <div>
                  <p className="text-sm text-muted-foreground">Carrier Tracking #</p>
                  <CarrierTrackingLink
                    trackingNumber={selectedShipment.carrierTrackingNumber}
                    carrierCode={selectedShipment.carrierCode}
                    carrierName={selectedShipment.carrierName}
                    className="font-medium"
                  />
                </div>
              )}
              {(selectedShipment as any).pickupConfirmationNumber && (
                <div>
                  <p className="text-sm text-muted-foreground">Pickup Confirmation #</p>
                  <p className="font-mono font-medium">{(selectedShipment as any).pickupConfirmationNumber}</p>
                </div>
              )}
              {selectedShipment.status === "payment_pending" && !selectedShipment.carrierTrackingNumber && (
                <Button
                  variant="outline"
                  className="w-full"
                  data-testid="button-modify-shipment"
                  onClick={() => setEditShipment(selectedShipment)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Modify shipment
                </Button>
              )}
              {(selectedShipment as any).carrierLabelBase64 && (
                <Button
                  variant="outline"
                  className="w-full"
                  data-testid="button-download-label"
                  onClick={() => window.open(`/api/client/shipments/${selectedShipment.id}/label.pdf`, "_blank")}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Label (PDF)
                </Button>
              )}
              {selectedShipment.itemsData && (
                <Button
                  variant="outline"
                  className="w-full"
                  data-testid="button-download-commercial-invoice"
                  onClick={() => window.open(`/api/client/shipments/${selectedShipment.id}/commercial-invoice.pdf`, "_blank")}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Commercial Invoice (PDF)
                </Button>
              )}

              {/* Origin */}
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">From</span>
                </div>
                <p className="font-medium">{selectedShipment.senderName}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedShipment.senderAddress}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedShipment.senderCity}, {selectedShipment.senderCountry}
                </p>
              </div>

              {/* Destination */}
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">To</span>
                </div>
                <p className="font-medium">{selectedShipment.recipientName}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedShipment.recipientAddress}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedShipment.recipientCity}, {selectedShipment.recipientCountry}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedShipment.recipientPhone}
                </p>
              </div>

              {/* Package Details */}
              <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">
                    {(selectedShipment.numberOfPackages || 1) === 1 ? "Package" : `${selectedShipment.numberOfPackages} Packages`}
                  </span>
                  <span className="text-xs text-muted-foreground capitalize">({selectedShipment.packageType})</span>
                </div>
                {selectedShipment.packagesData ? (
                  (() => {
                    const packages = JSON.parse(selectedShipment.packagesData);

                    return (
                      <div className="space-y-2">
                        {packages.map((pkg: any, i: number) => (
                          <div key={i} className="flex items-center justify-between gap-2 text-sm px-2 py-1.5 rounded bg-background">
                            <span className="font-medium">Pkg {i + 1}</span>
                            <span className="font-medium">
                              Billable: {Number(pkg.chargeableWeight || pkg.weight).toFixed(3)} {pkg.chargeableWeightUnit || selectedShipment.chargeableWeightUnit || selectedShipment.weightUnit || "KG"}
                            </span>
                            <span className="text-muted-foreground">
                              {pkg.usesDimensionalWeight ? "Dimensional" : "Actual"} basis
                            </span>
                            <span className="text-muted-foreground">{pkg.length} x {pkg.width} x {pkg.height} {selectedShipment.dimensionUnit || "CM"}</span>
                          </div>
                        ))}
                        {selectedShipment.chargeableWeight && (
                          <div className="flex justify-between text-sm pt-1 border-t">
                            <span className="text-muted-foreground">Billable Weight</span>
                            <span className="font-medium">
                              {Number(selectedShipment.chargeableWeight).toFixed(3)} {selectedShipment.chargeableWeightUnit || selectedShipment.weightUnit || "KG"}
                            </span>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">{formatChargeablePackageCounts(packages)}</p>
                      </div>
                    );
                  })()
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Weight</p>
                      <p className="font-medium">{Number(selectedShipment.weight).toFixed(1)} {selectedShipment.weightUnit || "KG"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Dimensions</p>
                      <p className="font-medium">{selectedShipment.length} x {selectedShipment.width} x {selectedShipment.height} {selectedShipment.dimensionUnit || "CM"}</p>
                    </div>
                  </div>
                )}
              </div>

              {selectedShipment.itemsData && (() => {
                try {
                  const items = JSON.parse(selectedShipment.itemsData) as ShipmentItem[];
                  if (items.length === 0) return null;
                  return (
                    <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Items ({items.length})</span>
                      </div>
                      <div className="space-y-2">
                        {items.map((item, i) => (
                          <div key={i} className="px-3 py-2 rounded bg-background space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{item.itemName}</span>
                              <div className="flex items-center gap-2">
                                {item.hsCode ? (
                                  <Badge variant="outline" className="text-xs">
                                    HS: {item.hsCode}
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive" className="text-xs">No HS</Badge>
                                )}
                                {item.hsCodeConfidence && (
                                  <Badge className={
                                    item.hsCodeConfidence === "HIGH" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs" :
                                    item.hsCodeConfidence === "MEDIUM" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 text-xs" :
                                    item.hsCodeConfidence === "LOW" ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 text-xs" :
                                    "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 text-xs"
                                  }>
                                    {item.hsCodeConfidence}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground flex gap-3">
                              <span>{item.category}</span>
                              <span>Origin: {item.countryOfOrigin}</span>
                              <span>Qty: {item.quantity}</span>
                              <span>{formatCurrencyAmount(item.price, item.currency)} each</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                } catch { return null; }
              })()}

              {selectedShipment.status === "carrier_error" && (
                <div className="p-4 rounded-lg border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    <span className="text-sm font-medium text-orange-800 dark:text-orange-300">Carrier Error</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    There was an issue submitting this shipment to the carrier. Please contact support or try again later.
                  </p>
                </div>
              )}

              {/* Total Cost (Client only sees final price) */}
              <div className="p-4 rounded-lg border">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Total Cost</span>
                  <span className="text-2xl font-bold">
                    <SarAmount amount={checkoutSummary?.amount ?? Number(selectedShipment.clientTotalAmountSar ?? selectedShipment.finalPrice ?? 0)} />
                  </span>
                </div>
                {checkoutSummary?.activeOffer && (
                  <div className="mt-3 space-y-1 border-t pt-3 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Original Amount</span>
                      <span><SarAmount amount={checkoutSummary.activeOffer.originalAmount} /></span>
                    </div>
                    <div className="flex justify-between text-green-500">
                      <span>Recovery Discount</span>
                      <span>-<SarAmount amount={checkoutSummary.activeOffer.discountAmount} /></span>
                    </div>
                    {checkoutSummary.activeOffer.expiresAt && (
                      <p className="text-xs text-muted-foreground">
                        Offer expires {format(new Date(checkoutSummary.activeOffer.expiresAt), "MMM d, h:mm a")}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {canPayShipment(selectedShipment) && (
                <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Complete Payment</span>
                  </div>
                  {isLoadingCheckoutSummary ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading payment amount...
                    </div>
                  ) : checkoutSummary?.canPay ? (
                    <TapCardForm
                      amount={checkoutSummary.amount}
                      currency={checkoutSummary.currency || selectedShipment.currency || "SAR"}
                      shipmentId={selectedShipment.id}
                      submitLabel="Pay Now"
                      pending={payShipmentMutation.isPending}
                      onSubmit={(payload) =>
                        payShipmentMutation.mutate({
                          shipmentId: selectedShipment.id,
                          returnPath: "/client/shipments",
                          ...payload,
                        })
                      }
                      testId="button-pay-selected-shipment"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      This shipment is not available for online payment right now.
                    </p>
                  )}

                  {checkoutSummary?.canPay && creditAccess?.creditEnabled && (
                    <>
                      <div className="relative flex items-center py-1">
                        <div className="flex-grow border-t" />
                        <span className="px-3 text-xs uppercase text-muted-foreground">or</span>
                        <div className="flex-grow border-t" />
                      </div>
                      <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
                        <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                          <Clock className="h-4 w-4" />
                          Credit / Pay Later
                        </div>
                        <p className="text-sm text-amber-600 dark:text-amber-400">
                          Confirm this shipment now and receive an invoice with 30-day payment terms.
                        </p>
                        <Button
                          variant="outline"
                          className="w-full border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300"
                          disabled={payLaterMutation.isPending || payShipmentMutation.isPending}
                          onClick={() => payLaterMutation.mutate(selectedShipment.id)}
                          data-testid="button-pay-later-selected-shipment"
                        >
                          {payLaterMutation.isPending ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating credit invoice...</>
                          ) : (
                            <>Use Credit / Pay Later</>
                          )}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Dates */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Created {format(new Date(selectedShipment.createdAt), "MMM d, yyyy 'at' h:mm a")}
              </div>

              {canCancelShipment(selectedShipment) && (
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => cancelMutation.mutate(selectedShipment.id)}
                  disabled={cancelMutation.isPending}
                  data-testid="button-cancel-shipment"
                >
                  {cancelMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Ban className="mr-2 h-4 w-4" />
                  )}
                  Cancel Shipment
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
      {editShipment && (
        <EditPendingShipmentDialog
          shipment={editShipment}
          endpoint={`/api/client/shipments/${editShipment.id}`}
          open={!!editShipment}
          onOpenChange={(v) => { if (!v) setEditShipment(null); }}
          invalidateKeys={["/api/client/shipments"]}
        />
      )}
    </ClientLayout>
  );
}
