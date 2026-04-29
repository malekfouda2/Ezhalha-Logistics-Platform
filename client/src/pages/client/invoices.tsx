import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ClientLayout } from "@/components/client-layout";
import { StatusBadge } from "@/components/status-badge";
import { TapCardForm } from "@/components/tap-card-form";
import { LoadingScreen } from "@/components/loading-spinner";
import { NoInvoices } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Download, Eye, FileText, CreditCard } from "lucide-react";
import { SarAmount } from "@/components/sar-symbol";
import type { Invoice, ClientAccount } from "@shared/schema";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useSearch } from "wouter";

function formatInvoiceTypeLabel(invoiceType?: string | null) {
  if (invoiceType === "EXTRA_WEIGHT") return "Extra Weight";
  if (invoiceType === "EXTRA_COST") return "Extra Cost";
  return "Shipment";
}

export default function ClientInvoices() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const { toast } = useToast();

  const { data: account } = useQuery<ClientAccount>({
    queryKey: ["/api/client/account"],
  });

  const { data: invoices, isLoading, refetch } = useQuery<Invoice[]>({
    queryKey: ["/api/client/invoices"],
  });

  useEffect(() => {
    const params = new URLSearchParams(search);
    const paymentStatus = params.get("paymentStatus");
    const message = params.get("message");

    if (!paymentStatus) {
      return;
    }

    if (paymentStatus === "success") {
      toast({
        title: "Payment completed",
        description: "Your invoice payment was completed successfully.",
      });
      refetch();
    } else if (paymentStatus === "failed") {
      toast({
        title: "Payment failed",
        description: message || "Your payment could not be completed.",
        variant: "destructive",
      });
    } else if (paymentStatus === "pending") {
      toast({
        title: "Payment pending",
        description: "Your payment is still being processed.",
      });
      refetch();
    }

    navigate("/client/invoices", { replace: true });
  }, [navigate, refetch, search, toast]);

  const createPaymentCharge = useMutation({
    mutationFn: async (payload: {
      invoiceId: string;
      tapTokenId?: string;
      saveCardForFuture?: boolean;
    }) => {
      const response = await apiRequest("POST", "/api/client/payments/create-charge", {
        invoiceId: payload.invoiceId,
        tapTokenId: payload.tapTokenId,
        saveCardForFuture: payload.saveCardForFuture,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.error) {
        toast({
          title: "Payment Error",
          description: data.error,
          variant: "destructive",
        });
        setPaymentDialogOpen(false);
        return;
      }

      if (data.transactionUrl) {
        window.location.href = data.transactionUrl;
        return;
      }

      if (String(data.paymentStatus || "").toUpperCase() === "CAPTURED") {
        toast({
          title: "Payment completed",
          description: `Invoice ${data.invoiceNumber} has been paid successfully.`,
        });
        setPaymentDialogOpen(false);
        refetch();
        return;
      }

      toast({
        title: "Payment initiated",
        description: `A payment request was created for invoice ${data.invoiceNumber}.`,
      });
      setPaymentDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Payment Failed",
        description: error.message || "Failed to create payment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handlePayNow = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setPaymentDialogOpen(true);
  };

  const filteredInvoices = invoices?.filter((invoice) => {
    const matchesSearch = invoice.invoiceNumber
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || invoice.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPending = invoices
    ?.filter((i) => i.status === "pending")
    .reduce((sum, i) => sum + Number(i.amount), 0) ?? 0;

  if (isLoading) {
    return (
      <ClientLayout clientProfile={account?.profile}>
        <LoadingScreen message="Loading invoices..." />
      </ClientLayout>
    );
  }

  return (
    <ClientLayout clientProfile={account?.profile}>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Invoices</h1>
            <p className="text-muted-foreground">
              View and download your invoices
            </p>
          </div>
          {totalPending > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
              <FileText className="h-4 w-4" />
              <span className="text-sm">
                <span className="font-semibold"><SarAmount amount={totalPending} /></span> pending
              </span>
            </div>
          )}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by invoice number..."
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
                  <TabsTrigger value="pending" data-testid="tab-pending">
                    Pending
                  </TabsTrigger>
                  <TabsTrigger value="paid" data-testid="tab-completed">
                    Paid
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardContent>
        </Card>

        {/* Invoices Table */}
        <Card>
          <CardContent className="p-0">
            {filteredInvoices && filteredInvoices.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id} data-testid={`row-invoice-${invoice.id}`}>
                      <TableCell className="font-mono font-medium">
                        <div className="space-y-1">
                          <p>{invoice.invoiceNumber}</p>
                          {invoice.description && (
                            <p className="font-normal text-xs text-muted-foreground">
                              {invoice.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {formatInvoiceTypeLabel(invoice.invoiceType)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={invoice.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(invoice.dueDate), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <SarAmount amount={invoice.amount} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {invoice.status === "pending" && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handlePayNow(invoice)}
                              data-testid={`button-pay-${invoice.id}`}
                            >
                              <CreditCard className="h-4 w-4 mr-1" />
                              Pay
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(`/api/client/invoices/${invoice.id}/pdf`, '_blank')}
                            title="View Invoice"
                            data-testid={`button-view-${invoice.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const win = window.open(`/api/client/invoices/${invoice.id}/pdf`, '_blank');
                              if (win) {
                                win.onload = () => win.print();
                              }
                            }}
                            title="Download/Print Invoice"
                            data-testid={`button-download-${invoice.id}`}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <NoInvoices />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment Confirmation Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Payment</DialogTitle>
            <DialogDescription>
              You are about to pay invoice {selectedInvoice?.invoiceNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Invoice Amount</span>
                <span className="text-2xl font-bold">
                  <SarAmount amount={selectedInvoice ? Number(selectedInvoice.amount) : 0} />
                </span>
              </div>
              <div className="flex justify-between items-center mt-2 text-sm">
                <span className="text-muted-foreground">Due Date</span>
                <span>
                  {selectedInvoice && format(new Date(selectedInvoice.dueDate), "MMM d, yyyy")}
                </span>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setPaymentDialogOpen(false)}
                disabled={createPaymentCharge.isPending}
                data-testid="button-cancel-payment"
              >
                Cancel
              </Button>
            </div>
            {selectedInvoice && (
              <TapCardForm
                amount={Number(selectedInvoice.amount)}
                currency="SAR"
                submitLabel="Pay with Tap"
                pending={createPaymentCharge.isPending}
                onSubmit={(payload) =>
                  createPaymentCharge.mutate({
                    invoiceId: selectedInvoice.id,
                    tapTokenId: payload.tapTokenId,
                    saveCardForFuture: payload.saveCardForFuture,
                  })
                }
                testId="button-confirm-payment"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </ClientLayout>
  );
}
