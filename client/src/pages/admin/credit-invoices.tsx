import { useState, useEffect } from "react";
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
import { Clock, AlertTriangle, CheckCircle2, XCircle, FileText, Filter, X, RefreshCw } from "lucide-react";
import { SarAmount } from "@/components/sar-symbol";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CreditInvoiceWithRelations {
  id: string;
  shipmentId: string;
  clientAccountId: string;
  invoiceNumber: string;
  amount: string;
  currency: string;
  status: string;
  dueAt: string;
  paidAt: string | null;
  remindersSent: number;
  lastReminderAt: string | null;
  nextReminderAt: string | null;
  createdAt: string;
  shipment: {
    id: string;
    trackingNumber: string;
    status: string;
    createdAt: string;
  } | null;
  client: {
    id: string;
    name: string;
    email: string;
    accountNumber: string;
  } | null;
}

interface PaginatedResponse {
  invoices: CreditInvoiceWithRelations[];
  total: number;
  page: number;
  totalPages: number;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "PENDING":
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
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

export default function AdminCreditInvoices() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [actionDialog, setActionDialog] = useState<{ type: "mark_paid" | "cancel"; invoice: CreditInvoiceWithRelations } | null>(null);
  const { toast } = useToast();

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
    .filter((inv) => inv.status === "PENDING" || inv.status === "OVERDUE")
    .reduce((sum, inv) => sum + Number(inv.amount), 0);
  const overdueCount = invoices.filter((inv) => inv.status === "OVERDUE").length;
  const pendingCount = invoices.filter((inv) => inv.status === "PENDING").length;

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
              <div className="text-sm text-muted-foreground">Pending</div>
              <div className="text-2xl font-bold mt-1 text-amber-600" data-testid="text-pending">{pendingCount}</div>
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
                    <SelectItem value="PENDING">Pending</SelectItem>
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
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Tracking #</TableHead>
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
                        return (
                          <TableRow key={inv.id} className={isOverdue ? "bg-red-50/50 dark:bg-red-950/10" : ""} data-testid={`row-invoice-${inv.id}`}>
                            <TableCell className="font-mono text-sm" data-testid={`text-invoice-number-${inv.id}`}>{inv.invoiceNumber}</TableCell>
                            <TableCell data-testid={`text-client-${inv.id}`}>
                              {inv.client ? (
                                <div>
                                  <div className="font-medium text-sm">{inv.client.name}</div>
                                  <div className="text-xs text-muted-foreground">{inv.client.accountNumber}</div>
                                </div>
                              ) : "-"}
                            </TableCell>
                            <TableCell className="font-mono text-sm" data-testid={`text-tracking-${inv.id}`}>
                              {inv.shipment?.trackingNumber || "-"}
                            </TableCell>
                            <TableCell className="font-medium" data-testid={`text-amount-${inv.id}`}>
                              <SarAmount amount={Number(inv.amount)} /> {inv.currency}
                            </TableCell>
                            <TableCell>{getStatusBadge(inv.status)}</TableCell>
                            <TableCell data-testid={`text-due-${inv.id}`}>
                              {format(new Date(inv.dueAt), "MMM d, yyyy")}
                            </TableCell>
                            <TableCell data-testid={`text-reminders-${inv.id}`}>{inv.remindersSent}</TableCell>
                            <TableCell>
                              {(inv.status === "PENDING" || inv.status === "OVERDUE") && (
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-green-600 border-green-300 hover:bg-green-50 dark:hover:bg-green-950/30"
                                    onClick={() => setActionDialog({ type: "mark_paid", invoice: inv })}
                                    data-testid={`button-mark-paid-${inv.id}`}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                    Paid
                                  </Button>
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
                                </div>
                              )}
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

      <Dialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.type === "mark_paid" ? "Mark Invoice as Paid" : "Cancel Invoice"}
            </DialogTitle>
            <DialogDescription>
              {actionDialog?.type === "mark_paid"
                ? `Are you sure you want to mark invoice ${actionDialog?.invoice.invoiceNumber} as paid? This will update the shipment payment status.`
                : `Are you sure you want to cancel invoice ${actionDialog?.invoice.invoiceNumber}? This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setActionDialog(null)} data-testid="button-dialog-cancel">
              Close
            </Button>
            {actionDialog?.type === "mark_paid" ? (
              <Button
                onClick={() => markPaidMutation.mutate(actionDialog.invoice.id)}
                disabled={markPaidMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
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
