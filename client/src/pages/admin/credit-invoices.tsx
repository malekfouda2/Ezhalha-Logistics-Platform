import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { LoadingScreen } from "@/components/loading-spinner";
import { PaginationControls } from "@/components/pagination-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Clock, AlertTriangle, CheckCircle2, XCircle, FileText, Filter, X, RefreshCw, Package, MapPin, User, Eye, Phone, Mail, Building, Tag } from "lucide-react";
import { SarAmount } from "@/components/sar-symbol";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAdminAccess } from "@/hooks/use-admin-access";
import type { ShipmentItem } from "@shared/schema";

interface ShipmentDetail {
  id: string;
  trackingNumber: string;
  carrierTrackingNumber: string | null;
  status: string;
  shipmentType: string;
  serviceType: string;
  carrierCode: string;
  senderName: string;
  senderCity: string;
  senderCountry: string;
  senderPhone: string;
  senderAddress: string;
  senderPostalCode: string;
  recipientName: string;
  recipientCity: string;
  recipientCountry: string;
  recipientPhone: string;
  recipientAddress: string;
  recipientPostalCode: string;
  weight: string;
  weightUnit: string;
  numberOfPackages: number;
  packageType: string;
  baseRate: string;
  marginAmount: string;
  finalPrice: string;
  currency: string;
  paymentMethod: string;
  paymentStatus: string;
  itemsData: string | null;
  createdAt: string;
}

interface ClientDetail {
  id: string;
  name: string;
  email: string;
  phone: string;
  accountNumber: string;
  accountType: string;
  companyName: string | null;
  country: string;
}

interface CreditInvoiceWithRelations {
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
  lastReminderAt: string | null;
  nextReminderAt: string | null;
  createdAt: string;
  shipment: ShipmentDetail | null;
  client: ClientDetail | null;
}

interface PaginatedResponse {
  invoices: CreditInvoiceWithRelations[];
  total: number;
  page: number;
  totalPages: number;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "UNPAID":
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800"><Clock className="h-3 w-3 mr-1" />Unpaid</Badge>;
    case "OVERDUE":
      return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Overdue</Badge>;
    case "PAID":
      return <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-950/20 dark:text-green-400 dark:border-green-800"><CheckCircle2 className="h-3 w-3 mr-1" />Paid</Badge>;
    case "CANCELLED":
      return <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getDaysInfo(dueAt: string): { text: string; isOverdue: boolean } {
  const now = new Date();
  const due = new Date(dueAt);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays > 1) return { text: `${diffDays} days left`, isOverdue: false };
  if (diffDays === 1) return { text: "Due tomorrow", isOverdue: false };
  if (diffDays === 0) return { text: "Due today", isOverdue: false };
  return { text: `${Math.abs(diffDays)} days overdue`, isOverdue: true };
}

export default function AdminCreditInvoices() {
  const adminAccess = useAdminAccess();
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [actionDialog, setActionDialog] = useState<{ type: "mark_paid" | "cancel"; invoice: CreditInvoiceWithRelations } | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<CreditInvoiceWithRelations | null>(null);
  const { toast } = useToast();

  const canUpdateCreditInvoices = adminAccess.hasPermission("credit-invoices", "update");
  const canCancelCreditInvoices = adminAccess.hasPermission("credit-invoices", "cancel");

  const buildQueryString = () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(pageSize));
    if (statusFilter !== "all") params.set("status", statusFilter);
    return params.toString();
  };

  const { data, isLoading, isFetching, refetch } = useQuery<PaginatedResponse>({
    queryKey: ["/api/admin/credit-invoices", page, pageSize, statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/credit-invoices?${buildQueryString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch credit invoices");
      return res.json();
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await apiRequest("POST", `/api/admin/credit-invoices/${invoiceId}/mark-paid`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice marked as paid" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/credit-invoices"] });
      setActionDialog(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to mark as paid", description: error.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await apiRequest("POST", `/api/admin/credit-invoices/${invoiceId}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice cancelled" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/credit-invoices"] });
      setActionDialog(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to cancel", description: error.message, variant: "destructive" });
    },
  });

  const invoices = data?.invoices || [];
  const totalOutstanding = invoices
    .filter((inv) => inv.status === "UNPAID" || inv.status === "OVERDUE")
    .reduce((sum, inv) => sum + Number(inv.amount), 0);
  const overdueCount = invoices.filter((inv) => inv.status === "OVERDUE").length;
  const unpaidCount = invoices.filter((inv) => inv.status === "UNPAID").length;

  if (isLoading) return <LoadingScreen />;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Credit Invoices</h1>
            <p className="text-muted-foreground">Manage Pay Later / Credit invoices</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh">
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Total Invoices</div>
              <div className="text-2xl font-bold mt-1" data-testid="text-total">{data?.total || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Outstanding Amount</div>
              <div className="text-2xl font-bold mt-1" data-testid="text-outstanding">
                <SarAmount amount={totalOutstanding} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Unpaid</div>
              <div className="text-2xl font-bold mt-1 text-amber-600" data-testid="text-unpaid">{unpaidCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                Overdue
              </div>
              <div className="text-2xl font-bold mt-1 text-destructive" data-testid="text-overdue">{overdueCount}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Credit Invoices
              </CardTitle>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-36" data-testid="select-status-filter">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="UNPAID">Unpaid</SelectItem>
                    <SelectItem value="OVERDUE">Overdue</SelectItem>
                    <SelectItem value="PAID">Paid</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                {statusFilter !== "all" && (
                  <Button variant="ghost" size="icon" onClick={() => { setStatusFilter("all"); setPage(1); }} data-testid="button-clear-filter">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="mx-auto h-10 w-10 mb-3 opacity-50" />
                <p>No credit invoices found</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead>Shipment</TableHead>
                        <TableHead>Route</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Reminders</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((inv) => {
                        const isOverdue = inv.status === "OVERDUE";
                        const isActive = inv.status === "UNPAID" || inv.status === "OVERDUE";
                        const daysInfo = isActive ? getDaysInfo(inv.dueAt) : null;
                        return (
                          <TableRow key={inv.id} className={isOverdue ? "bg-red-50/50 dark:bg-red-950/10" : ""} data-testid={`row-invoice-${inv.id}`}>
                            <TableCell data-testid={`text-client-${inv.id}`}>
                              {inv.client ? (
                                <div>
                                  <div className="font-medium text-sm">{inv.client.name}</div>
                                  <div className="text-xs text-muted-foreground">{inv.client.accountNumber}</div>
                                  <div className="text-xs text-muted-foreground">{inv.client.email}</div>
                                </div>
                              ) : "-"}
                            </TableCell>
                            <TableCell data-testid={`text-tracking-${inv.id}`}>
                              <div className="font-mono text-sm">{inv.shipment?.trackingNumber || "-"}</div>
                              {inv.shipment?.carrierTrackingNumber && (
                                <div className="text-xs text-muted-foreground font-mono">{inv.shipment.carrierTrackingNumber}</div>
                              )}
                              {inv.shipment?.serviceType && (
                                <div className="text-xs text-muted-foreground">{inv.shipment.serviceType.replace(/_/g, " ")}</div>
                              )}
                            </TableCell>
                            <TableCell>
                              {inv.shipment ? (
                                <div className="text-sm">
                                  <div>{inv.shipment.senderName}</div>
                                  <div className="text-xs text-muted-foreground">{inv.shipment.senderCity}, {inv.shipment.senderCountry}</div>
                                  <div className="text-muted-foreground my-0.5">&darr;</div>
                                  <div>{inv.shipment.recipientName}</div>
                                  <div className="text-xs text-muted-foreground">{inv.shipment.recipientCity}, {inv.shipment.recipientCountry}</div>
                                </div>
                              ) : "-"}
                            </TableCell>
                            <TableCell data-testid={`text-amount-${inv.id}`}>
                              <div className="font-medium"><SarAmount amount={Number(inv.amount)} /></div>
                              <div className="text-xs text-muted-foreground">{inv.currency}</div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                {getStatusBadge(inv.status)}
                                {daysInfo && (
                                  <div className={`text-xs ${daysInfo.isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                    {daysInfo.text}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell data-testid={`text-due-${inv.id}`}>
                              <div>{format(new Date(inv.dueAt), "MMM d, yyyy")}</div>
                              <div className="text-xs text-muted-foreground">Issued: {format(new Date(inv.issuedAt || inv.createdAt), "MMM d")}</div>
                            </TableCell>
                            <TableCell data-testid={`text-reminders-${inv.id}`}>
                              <div>{inv.remindersSent}</div>
                              {inv.lastReminderAt && (
                                <div className="text-xs text-muted-foreground">Last: {format(new Date(inv.lastReminderAt), "MMM d")}</div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setDetailInvoice(inv)}
                                  data-testid={`button-view-${inv.id}`}
                                >
                                  <Eye className="h-3.5 w-3.5 mr-1" />
                                  View
                                </Button>
                                {isActive && (canUpdateCreditInvoices || canCancelCreditInvoices) && (
                                  <>
                                    {canUpdateCreditInvoices && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-green-600 border-green-300"
                                        onClick={() => setActionDialog({ type: "mark_paid", invoice: inv })}
                                        data-testid={`button-mark-paid-${inv.id}`}
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                        Mark Paid
                                      </Button>
                                    )}
                                    {canCancelCreditInvoices && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-destructive"
                                        onClick={() => setActionDialog({ type: "cancel", invoice: inv })}
                                        data-testid={`button-cancel-${inv.id}`}
                                      >
                                        <XCircle className="h-3.5 w-3.5 mr-1" />
                                        Cancel
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {data && data.totalPages > 1 && (
                  <div className="mt-4">
                    <PaginationControls
                      page={page}
                      totalPages={data.totalPages}
                      total={data.total}
                      pageSize={pageSize}
                      onPageChange={setPage}
                      onPageSizeChange={() => {}}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!detailInvoice} onOpenChange={() => setDetailInvoice(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Credit Invoice Details</DialogTitle>
          </DialogHeader>
          {detailInvoice && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                {getStatusBadge(detailInvoice.status)}
              </div>

              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="font-medium flex items-center gap-2"><FileText className="h-4 w-4" />Invoice Info</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-medium"><SarAmount amount={Number(detailInvoice.amount)} /> {detailInvoice.currency}</span>
                  <span className="text-muted-foreground">Issued</span>
                  <span>{format(new Date(detailInvoice.issuedAt || detailInvoice.createdAt), "MMM d, yyyy h:mm a")}</span>
                  <span className="text-muted-foreground">Due Date</span>
                  <span className="font-medium">{format(new Date(detailInvoice.dueAt), "MMM d, yyyy")}</span>
                  {detailInvoice.paidAt && (
                    <>
                      <span className="text-muted-foreground">Paid At</span>
                      <span className="text-green-600">{format(new Date(detailInvoice.paidAt), "MMM d, yyyy h:mm a")}</span>
                    </>
                  )}
                  <span className="text-muted-foreground">Reminders Sent</span>
                  <span>{detailInvoice.remindersSent}</span>
                  {detailInvoice.lastReminderAt && (
                    <>
                      <span className="text-muted-foreground">Last Reminder</span>
                      <span>{format(new Date(detailInvoice.lastReminderAt), "MMM d, yyyy h:mm a")}</span>
                    </>
                  )}
                  {detailInvoice.nextReminderAt && (
                    <>
                      <span className="text-muted-foreground">Next Reminder</span>
                      <span>{format(new Date(detailInvoice.nextReminderAt), "MMM d, yyyy h:mm a")}</span>
                    </>
                  )}
                </div>
              </div>

              {detailInvoice.client && (
                <div className="rounded-lg border p-4 space-y-3">
                  <h4 className="font-medium flex items-center gap-2"><User className="h-4 w-4" />Client</h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">{detailInvoice.client.name}</span>
                    <span className="text-muted-foreground">Account #</span>
                    <span className="font-mono">{detailInvoice.client.accountNumber}</span>
                    <span className="text-muted-foreground">Type</span>
                    <span className="capitalize">{detailInvoice.client.accountType}</span>
                    {detailInvoice.client.companyName && (
                      <>
                        <span className="text-muted-foreground">Company</span>
                        <span>{detailInvoice.client.companyName}</span>
                      </>
                    )}
                    <span className="text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />Email</span>
                    <span>{detailInvoice.client.email}</span>
                    <span className="text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />Phone</span>
                    <span>{detailInvoice.client.phone}</span>
                    <span className="text-muted-foreground">Country</span>
                    <span>{detailInvoice.client.country}</span>
                  </div>
                </div>
              )}

              {detailInvoice.shipment && (
                <div className="rounded-lg border p-4 space-y-3">
                  <h4 className="font-medium flex items-center gap-2"><Package className="h-4 w-4" />Shipment</h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Tracking #</span>
                    <span className="font-mono">{detailInvoice.shipment.trackingNumber}</span>
                    {detailInvoice.shipment.carrierTrackingNumber && (
                      <>
                        <span className="text-muted-foreground">Carrier Tracking</span>
                        <span className="font-mono text-xs">{detailInvoice.shipment.carrierTrackingNumber}</span>
                      </>
                    )}
                    <span className="text-muted-foreground">Type</span>
                    <span className="capitalize">{detailInvoice.shipment.shipmentType}</span>
                    <span className="text-muted-foreground">Service</span>
                    <span>{detailInvoice.shipment.serviceType?.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">Carrier</span>
                    <span>{detailInvoice.shipment.carrierCode}</span>
                    <span className="text-muted-foreground">Packages</span>
                    <span>{detailInvoice.shipment.numberOfPackages} x {detailInvoice.shipment.packageType?.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">Weight</span>
                    <span>{detailInvoice.shipment.weight} {detailInvoice.shipment.weightUnit}</span>
                    <span className="text-muted-foreground">Status</span>
                    <span className="capitalize">{detailInvoice.shipment.status}</span>
                    <span className="text-muted-foreground">Payment Method</span>
                    <span>{detailInvoice.shipment.paymentMethod}</span>
                    <span className="text-muted-foreground">Payment Status</span>
                    <span className="capitalize">{detailInvoice.shipment.paymentStatus}</span>
                  </div>

                  <div className="border-t pt-3 mt-3">
                    <h5 className="text-sm font-medium flex items-center gap-1 mb-2"><MapPin className="h-3 w-3" />Pricing</h5>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <span className="text-muted-foreground">Base Rate</span>
                      <span><SarAmount amount={Number(detailInvoice.shipment.baseRate)} /></span>
                      <span className="text-muted-foreground">Margin</span>
                      <span><SarAmount amount={Number(detailInvoice.shipment.marginAmount)} /></span>
                      <span className="text-muted-foreground">Final Price</span>
                      <span className="font-medium"><SarAmount amount={Number(detailInvoice.shipment.finalPrice)} /></span>
                    </div>
                  </div>

                  <div className="border-t pt-3 mt-3 grid grid-cols-2 gap-4">
                    <div>
                      <h5 className="text-sm font-medium mb-2">Sender</h5>
                      <div className="text-sm space-y-1">
                        <div className="font-medium">{detailInvoice.shipment.senderName}</div>
                        <div className="text-muted-foreground">{detailInvoice.shipment.senderAddress}</div>
                        <div className="text-muted-foreground">{detailInvoice.shipment.senderCity}, {detailInvoice.shipment.senderPostalCode}</div>
                        <div className="text-muted-foreground">{detailInvoice.shipment.senderCountry}</div>
                        <div className="text-muted-foreground">{detailInvoice.shipment.senderPhone}</div>
                      </div>
                    </div>
                    <div>
                      <h5 className="text-sm font-medium mb-2">Recipient</h5>
                      <div className="text-sm space-y-1">
                        <div className="font-medium">{detailInvoice.shipment.recipientName}</div>
                        <div className="text-muted-foreground">{detailInvoice.shipment.recipientAddress}</div>
                        <div className="text-muted-foreground">{detailInvoice.shipment.recipientCity}, {detailInvoice.shipment.recipientPostalCode}</div>
                        <div className="text-muted-foreground">{detailInvoice.shipment.recipientCountry}</div>
                        <div className="text-muted-foreground">{detailInvoice.shipment.recipientPhone}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {detailInvoice.shipment?.itemsData && (() => {
                try {
                  const items = JSON.parse(detailInvoice.shipment.itemsData) as ShipmentItem[];
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
                              <span>Origin: {item.countryOfOrigin}</span>
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

              {(detailInvoice.status === "UNPAID" || detailInvoice.status === "OVERDUE") &&
                (canUpdateCreditInvoices || canCancelCreditInvoices) && (
                <div className="flex gap-2 pt-2">
                  {canUpdateCreditInvoices && (
                    <Button
                      className="bg-green-600 text-white flex-1"
                      onClick={() => { setDetailInvoice(null); setActionDialog({ type: "mark_paid", invoice: detailInvoice }); }}
                      data-testid="button-detail-mark-paid"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Mark as Paid
                    </Button>
                  )}
                  {canCancelCreditInvoices && (
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => { setDetailInvoice(null); setActionDialog({ type: "cancel", invoice: detailInvoice }); }}
                      data-testid="button-detail-cancel"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Cancel Invoice
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.type === "mark_paid" ? "Mark Invoice as Paid" : "Cancel Invoice"}
            </DialogTitle>
            <DialogDescription>
              {actionDialog?.type === "mark_paid"
                ? `Are you sure you want to mark the credit invoice for ${actionDialog?.invoice.client?.name || "this client"} (${actionDialog?.invoice.shipment?.trackingNumber || ""}) as paid? This will update the shipment payment status.`
                : `Are you sure you want to cancel the credit invoice for ${actionDialog?.invoice.client?.name || "this client"} (${actionDialog?.invoice.shipment?.trackingNumber || ""})? This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          {actionDialog && (
            <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Client</span>
                <span>{actionDialog.invoice.client?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium"><SarAmount amount={Number(actionDialog.invoice.amount)} /> {actionDialog.invoice.currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Due</span>
                <span>{format(new Date(actionDialog.invoice.dueAt), "MMM d, yyyy")}</span>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setActionDialog(null)} data-testid="button-dialog-cancel">
              Close
            </Button>
            {actionDialog?.type === "mark_paid" ? (
              <Button
                onClick={() => markPaidMutation.mutate(actionDialog.invoice.id)}
                disabled={markPaidMutation.isPending}
                className="bg-green-600 text-white"
                data-testid="button-confirm-mark-paid"
              >
                {markPaidMutation.isPending ? "Processing..." : "Confirm Paid"}
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => actionDialog && cancelMutation.mutate(actionDialog.invoice.id)}
                disabled={cancelMutation.isPending}
                data-testid="button-confirm-cancel"
              >
                {cancelMutation.isPending ? "Processing..." : "Cancel Invoice"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
