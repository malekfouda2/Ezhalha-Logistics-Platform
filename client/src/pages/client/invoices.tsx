import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientLayout } from "@/components/client-layout";
import { StatusBadge } from "@/components/status-badge";
import { LoadingScreen } from "@/components/loading-spinner";
import { NoInvoices } from "@/components/empty-state";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Download, Eye, FileText } from "lucide-react";
import type { Invoice, ClientAccount } from "@shared/schema";
import { format } from "date-fns";

export default function ClientInvoices() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: account } = useQuery<ClientAccount>({
    queryKey: ["/api/client/account"],
  });

  const { data: invoices, isLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/client/invoices"],
  });

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
                <span className="font-semibold">${totalPending.toFixed(2)}</span> pending
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
                  <TabsTrigger value="completed" data-testid="tab-completed">
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
                        {invoice.invoiceNumber}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={invoice.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(invoice.dueDate), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ${Number(invoice.amount).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
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
    </ClientLayout>
  );
}
