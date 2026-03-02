import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ClientLayout } from "@/components/client-layout";
import { LoadingScreen, LoadingSpinner } from "@/components/loading-spinner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, AlertTriangle, CheckCircle2, XCircle, FileText, Package, MapPin, Truck, ShieldCheck, ShieldX, Send, Tag } from "lucide-react";
import { SarAmount } from "@/components/sar-symbol";
import { format } from "date-fns";
import type { ShipmentItem } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface CreditInvoiceShipment {
  id: string;
  trackingNumber: string;
  status: string;
  createdAt: string;
  senderName?: string;
  senderCity?: string;
  senderCountry?: string;
  recipientName?: string;
  recipientCity?: string;
  recipientCountry?: string;
  serviceType?: string;
  carrierTrackingNumber?: string;
  weight?: string;
  weightUnit?: string;
  numberOfPackages?: number;
  shipmentType?: string;
  itemsData?: string | null;
}

interface CreditInvoice {
  id: string;
  shipmentId: string;
  clientAccountId: string;
  amount: string;
  currency: string;
  status: string;
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
  remindersSent: number;
  createdAt: string;
  shipment: CreditInvoiceShipment | null;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "UNPAID":
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800" data-testid={`badge-status-${status}`}><Clock className="h-3 w-3 mr-1" />Unpaid</Badge>;
    case "OVERDUE":
      return <Badge variant="destructive" data-testid={`badge-status-${status}`}><AlertTriangle className="h-3 w-3 mr-1" />Overdue</Badge>;
    case "PAID":
      return <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-950/20 dark:text-green-400 dark:border-green-800" data-testid={`badge-status-${status}`}><CheckCircle2 className="h-3 w-3 mr-1" />Paid</Badge>;
    case "CANCELLED":
      return <Badge variant="secondary" data-testid={`badge-status-${status}`}><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>;
    default:
      return <Badge variant="outline" data-testid={`badge-status-${status}`}>{status}</Badge>;
  }
}

function getDaysUntilDue(dueAt: string): string {
  const now = new Date();
  const due = new Date(dueAt);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays > 1) return `${diffDays} days left`;
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays === 0) return "Due today";
  return `${Math.abs(diffDays)} days overdue`;
}

export default function ClientBilling() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedInvoice, setSelectedInvoice] = useState<CreditInvoice | null>(null);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [requestReason, setRequestReason] = useState("");

  const { data: invoices, isLoading } = useQuery<CreditInvoice[]>({
    queryKey: ["/api/client/credit-invoices"],
  });

  const { data: creditAccess, isLoading: creditLoading } = useQuery<{ creditEnabled: boolean; request: any }>({
    queryKey: ["/api/client/credit-access"],
  });

  const requestCreditMutation = useMutation({
    mutationFn: async (reason: string) => {
      const res = await apiRequest("POST", "/api/client/credit-access/request", { reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/credit-access"] });
      setShowRequestDialog(false);
      setRequestReason("");
      toast({ title: "Request Submitted", description: "Your credit access request has been submitted for review." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to submit request", variant: "destructive" });
    },
  });

  const allInvoices = invoices || [];

  const filteredInvoices = allInvoices.filter((inv) => {
    if (statusFilter === "all") return true;
    return inv.status === statusFilter;
  });

  const totalOutstanding = allInvoices
    .filter((inv) => inv.status === "UNPAID" || inv.status === "OVERDUE")
    .reduce((sum, inv) => sum + Number(inv.amount), 0);

  const overdueCount = allInvoices.filter((inv) => inv.status === "OVERDUE").length;

  if (isLoading || creditLoading) return <LoadingScreen />;

  return (
    <ClientLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Credit / Billing</h1>
          <p className="text-muted-foreground">Manage your credit invoices and payment terms</p>
        </div>

        {!creditAccess?.creditEnabled && (
          <Card className="border-amber-200 dark:border-amber-800">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-950/30">
                  <ShieldCheck className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 space-y-2">
                  <h3 className="font-semibold">Credit / Pay Later Access</h3>
                  {!creditAccess?.request || creditAccess.request.status === "rejected" || creditAccess.request.status === "revoked" ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Request credit access to use Pay Later when creating shipments. Once approved, you can ship now and pay within 30 days.
                      </p>
                      <Button
                        onClick={() => setShowRequestDialog(true)}
                        className="mt-2"
                        data-testid="button-request-credit"
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Request Credit Access
                      </Button>
                      {creditAccess?.request?.status === "rejected" && (
                        <p className="text-xs text-muted-foreground mt-1">Your previous request was not approved. You may submit a new request.</p>
                      )}
                      {creditAccess?.request?.status === "revoked" && (
                        <p className="text-xs text-muted-foreground mt-1">Your credit access was revoked. You may submit a new request.</p>
                      )}
                    </>
                  ) : creditAccess?.request?.status === "pending" ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />Pending Review</Badge>
                      <span className="text-sm text-muted-foreground">
                        Submitted {format(new Date(creditAccess.request.createdAt), "MMM d, yyyy")}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {creditAccess?.creditEnabled && (
          <Card className="border-green-200 dark:border-green-800">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">Credit Access Active</p>
                  <p className="text-xs text-muted-foreground">You can use Pay Later when creating shipments</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Total Outstanding</div>
              <div className="text-2xl font-bold mt-1" data-testid="text-total-outstanding">
                <SarAmount amount={totalOutstanding} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Credit Invoices</div>
              <div className="text-2xl font-bold mt-1" data-testid="text-total-invoices">{allInvoices.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                Overdue
              </div>
              <div className="text-2xl font-bold mt-1 text-destructive" data-testid="text-overdue-count">{overdueCount}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Credit Invoices
            </CardTitle>
            <CardDescription>Invoices from shipments created with Pay Later</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={statusFilter} onValueChange={setStatusFilter} className="mb-4">
              <TabsList>
                <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
                <TabsTrigger value="UNPAID" data-testid="tab-unpaid">Unpaid</TabsTrigger>
                <TabsTrigger value="OVERDUE" data-testid="tab-overdue">Overdue</TabsTrigger>
                <TabsTrigger value="PAID" data-testid="tab-paid">Paid</TabsTrigger>
              </TabsList>
            </Tabs>

            {filteredInvoices.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="mx-auto h-10 w-10 mb-3 opacity-50" />
                <p>No credit invoices found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Shipment</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Time Left</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((inv) => {
                      const isOverdue = inv.status === "OVERDUE";
                      const isActive = inv.status === "UNPAID" || inv.status === "OVERDUE";
                      return (
                        <TableRow key={inv.id} className={isOverdue ? "bg-red-50/50 dark:bg-red-950/10" : ""} data-testid={`row-invoice-${inv.id}`}>
                          <TableCell data-testid={`text-tracking-${inv.id}`}>
                            <div className="font-mono text-sm">{inv.shipment?.trackingNumber || "-"}</div>
                            {inv.shipment?.carrierTrackingNumber && (
                              <div className="text-xs text-muted-foreground">{inv.shipment.carrierTrackingNumber}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            {inv.shipment ? (
                              <div className="text-sm">
                                <span>{inv.shipment.senderCity || "-"}</span>
                                <span className="text-muted-foreground mx-1">&rarr;</span>
                                <span>{inv.shipment.recipientCity || "-"}</span>
                              </div>
                            ) : "-"}
                          </TableCell>
                          <TableCell className="font-medium" data-testid={`text-amount-${inv.id}`}>
                            <SarAmount amount={Number(inv.amount)} /> {inv.currency}
                          </TableCell>
                          <TableCell>{getStatusBadge(inv.status)}</TableCell>
                          <TableCell data-testid={`text-due-date-${inv.id}`}>
                            {format(new Date(inv.dueAt), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell>
                            {isActive && (
                              <span className={`text-sm ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                {getDaysUntilDue(inv.dueAt)}
                              </span>
                            )}
                            {inv.status === "PAID" && inv.paidAt && (
                              <span className="text-sm text-green-600">Paid {format(new Date(inv.paidAt), "MMM d")}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedInvoice(inv)} data-testid={`button-details-${inv.id}`}>
                              Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Credit Invoice Details</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                {getStatusBadge(selectedInvoice.status)}
              </div>

              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="font-medium flex items-center gap-2"><FileText className="h-4 w-4" />Invoice</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-medium"><SarAmount amount={Number(selectedInvoice.amount)} /> {selectedInvoice.currency}</span>
                  <span className="text-muted-foreground">Issued</span>
                  <span>{format(new Date(selectedInvoice.issuedAt), "MMM d, yyyy")}</span>
                  <span className="text-muted-foreground">Due Date</span>
                  <span className="font-medium">{format(new Date(selectedInvoice.dueAt), "MMM d, yyyy")}</span>
                  {selectedInvoice.paidAt && (
                    <>
                      <span className="text-muted-foreground">Paid At</span>
                      <span className="text-green-600">{format(new Date(selectedInvoice.paidAt), "MMM d, yyyy")}</span>
                    </>
                  )}
                  <span className="text-muted-foreground">Reminders Sent</span>
                  <span>{selectedInvoice.remindersSent}</span>
                </div>
              </div>

              {selectedInvoice.shipment && (
                <div className="rounded-lg border p-4 space-y-3">
                  <h4 className="font-medium flex items-center gap-2"><Package className="h-4 w-4" />Shipment</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">Tracking #</span>
                    <span className="font-mono">{selectedInvoice.shipment.trackingNumber}</span>
                    {selectedInvoice.shipment.carrierTrackingNumber && (
                      <>
                        <span className="text-muted-foreground">Carrier Tracking</span>
                        <span className="font-mono text-xs">{selectedInvoice.shipment.carrierTrackingNumber}</span>
                      </>
                    )}
                    <span className="text-muted-foreground">Type</span>
                    <span className="capitalize">{selectedInvoice.shipment.shipmentType || "-"}</span>
                    <span className="text-muted-foreground">Service</span>
                    <span>{selectedInvoice.shipment.serviceType?.replace(/_/g, " ") || "-"}</span>
                    <span className="text-muted-foreground">From</span>
                    <span>{selectedInvoice.shipment.senderName} - {selectedInvoice.shipment.senderCity}, {selectedInvoice.shipment.senderCountry}</span>
                    <span className="text-muted-foreground">To</span>
                    <span>{selectedInvoice.shipment.recipientName} - {selectedInvoice.shipment.recipientCity}, {selectedInvoice.shipment.recipientCountry}</span>
                    {selectedInvoice.shipment.weight && (
                      <>
                        <span className="text-muted-foreground">Weight</span>
                        <span>{selectedInvoice.shipment.weight} {selectedInvoice.shipment.weightUnit}</span>
                      </>
                    )}
                    {selectedInvoice.shipment.numberOfPackages && (
                      <>
                        <span className="text-muted-foreground">Packages</span>
                        <span>{selectedInvoice.shipment.numberOfPackages}</span>
                      </>
                    )}
                    <span className="text-muted-foreground">Created</span>
                    <span>{format(new Date(selectedInvoice.shipment.createdAt), "MMM d, yyyy h:mm a")}</span>
                  </div>
                </div>
              )}

              {selectedInvoice.shipment?.itemsData && (() => {
                try {
                  const items = JSON.parse(selectedInvoice.shipment.itemsData) as ShipmentItem[];
                  if (items.length === 0) return null;
                  return (
                    <div className="rounded-lg border p-4 space-y-3">
                      <h4 className="font-medium flex items-center gap-2"><Tag className="h-4 w-4" />Items ({items.length})</h4>
                      <div className="space-y-2">
                        {items.map((item, i) => (
                          <div key={i} className="px-3 py-2 rounded bg-muted/50 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{item.itemName}</span>
                              <div className="flex items-center gap-2">
                                {item.hsCode ? (
                                  <Badge variant="outline" className="text-xs">HS: {item.hsCode}</Badge>
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
                              <span>Qty: {item.quantity}</span>
                              <span><SarAmount amount={item.price} /> each</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                } catch { return null; }
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Request Credit Access
            </DialogTitle>
            <DialogDescription>
              Submit a request to enable Credit / Pay Later for your account. Once approved, you can create shipments and pay within 30 days.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">Reason (optional)</label>
              <Textarea
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                placeholder="Tell us why you'd like credit access..."
                className="mt-1"
                data-testid="input-credit-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequestDialog(false)} data-testid="button-cancel-request">
              Cancel
            </Button>
            <Button
              disabled={requestCreditMutation.isPending}
              onClick={() => requestCreditMutation.mutate(requestReason)}
              data-testid="button-submit-credit-request"
            >
              {requestCreditMutation.isPending ? (
                <><LoadingSpinner size="sm" className="mr-2" />Submitting...</>
              ) : (
                <>Submit Request</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientLayout>
  );
}
