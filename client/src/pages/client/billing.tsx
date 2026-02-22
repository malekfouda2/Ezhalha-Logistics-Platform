import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientLayout } from "@/components/client-layout";
import { LoadingScreen } from "@/components/loading-spinner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, AlertTriangle, CheckCircle2, XCircle, FileText } from "lucide-react";
import { SarAmount } from "@/components/sar-symbol";
import { format } from "date-fns";

interface CreditInvoice {
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
  createdAt: string;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "PENDING":
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800" data-testid={`badge-status-${status}`}><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
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

export default function ClientBilling() {
  const [statusFilter, setStatusFilter] = useState("all");

  const { data, isLoading } = useQuery<{ invoices: CreditInvoice[]; total: number }>({
    queryKey: ["/api/client/credit-invoices"],
  });

  const invoices = data?.invoices || [];

  const filteredInvoices = invoices.filter((inv) => {
    if (statusFilter === "all") return true;
    return inv.status === statusFilter;
  });

  const totalOutstanding = invoices
    .filter((inv) => inv.status === "PENDING" || inv.status === "OVERDUE")
    .reduce((sum, inv) => sum + Number(inv.amount), 0);

  const overdueCount = invoices.filter((inv) => inv.status === "OVERDUE").length;

  if (isLoading) return <LoadingScreen />;

  return (
    <ClientLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Credit / Billing</h1>
          <p className="text-muted-foreground">Manage your credit invoices and payment terms</p>
        </div>

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
              <div className="text-2xl font-bold mt-1" data-testid="text-total-invoices">{invoices.length}</div>
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
                <TabsTrigger value="PENDING" data-testid="tab-pending">Pending</TabsTrigger>
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
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((inv) => {
                      const isOverdue = inv.status === "OVERDUE";
                      return (
                        <TableRow key={inv.id} className={isOverdue ? "bg-red-50/50 dark:bg-red-950/10" : ""} data-testid={`row-invoice-${inv.id}`}>
                          <TableCell className="font-mono text-sm" data-testid={`text-invoice-number-${inv.id}`}>{inv.invoiceNumber}</TableCell>
                          <TableCell className="font-medium" data-testid={`text-amount-${inv.id}`}>
                            <SarAmount amount={Number(inv.amount)} /> {inv.currency}
                          </TableCell>
                          <TableCell>{getStatusBadge(inv.status)}</TableCell>
                          <TableCell data-testid={`text-due-date-${inv.id}`}>
                            {format(new Date(inv.dueAt), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell data-testid={`text-created-${inv.id}`}>
                            {format(new Date(inv.createdAt), "MMM d, yyyy")}
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
    </ClientLayout>
  );
}
