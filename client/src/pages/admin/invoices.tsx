import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { LoadingScreen } from "@/components/loading-spinner";
import { NoInvoices } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Search, Download, Eye, RefreshCw, Filter, X, FileText, Calendar, User, Building } from "lucide-react";
import { SarSymbol, SarAmount } from "@/components/sar-symbol";
import { useToast } from "@/hooks/use-toast";
import type { Invoice, ClientAccount } from "@shared/schema";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface PaginatedResponse {
  invoices: Invoice[];
  total: number;
  page: number;
  totalPages: number;
}

interface InvoiceWithClient extends Invoice {
  client?: ClientAccount;
}

export default function AdminInvoices() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithClient | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const buildQueryString = () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(pageSize));
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter !== "all") params.set("status", statusFilter);
    return params.toString();
  };

  const { data, isLoading, isFetching, refetch } = useQuery<PaginatedResponse>({
    queryKey: ["/api/admin/invoices", page, pageSize, debouncedSearch, statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/invoices?${buildQueryString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoices");
      return res.json();
    },
  });

  const hasActiveFilters = statusFilter !== "all" || debouncedSearch;

  const clearFilters = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setStatusFilter("all");
    setPage(1);
  };

  const handleViewInvoice = async (invoice: Invoice) => {
    setIsLoadingDetails(true);
    try {
      const res = await fetch(`/api/admin/invoices/${invoice.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoice details");
      const data = await res.json();
      setSelectedInvoice(data);
      setIsDetailsOpen(true);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load invoice details", variant: "destructive" });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleDownloadInvoice = (invoiceId: string) => {
    window.open(`/api/admin/invoices/${invoiceId}/pdf`, "_blank");
  };

  if (isLoading && !data) {
    return (
      <AdminLayout>
        <LoadingScreen message="Loading invoices..." />
      </AdminLayout>
    );
  }

  const invoices = data?.invoices || [];
  const totalPages = data?.totalPages || 1;
  const total = data?.total || 0;
  const totalAmount = invoices.reduce((sum, inv) => sum + Number(inv.amount), 0);
  const pendingAmount = invoices.filter(i => i.status === "pending").reduce((sum, inv) => sum + Number(inv.amount), 0);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Invoices</h1>
            <p className="text-muted-foreground">Manage and track all client invoices</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh">
            <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{total.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Total Invoices</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                  <SarSymbol size="sm" className="text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold"><SarAmount amount={totalAmount} /></p>
                  <p className="text-xs text-muted-foreground">Total Amount (Page)</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                  <SarSymbol size="sm" className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold"><SarAmount amount={pendingAmount} /></p>
                  <p className="text-xs text-muted-foreground">Pending (Page)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters
              </CardTitle>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                  <X className="h-4 w-4 mr-1" />
                  Clear All
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by invoice number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {invoices.length > 0 ? (
              <>
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
                    {invoices.map((invoice) => (
                      <TableRow key={invoice.id} data-testid={`row-invoice-${invoice.id}`}>
                        <TableCell className="font-mono font-medium">{invoice.invoiceNumber}</TableCell>
                        <TableCell>
                          <StatusBadge status={invoice.status} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(invoice.dueDate), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-right font-medium"><SarAmount amount={invoice.amount} /></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleViewInvoice(invoice)}
                              disabled={isLoadingDetails}
                              data-testid={`button-view-${invoice.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleDownloadInvoice(invoice.id)}
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
                <PaginationControls
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
                />
              </>
            ) : (
              <NoInvoices />
            )}
          </CardContent>
        </Card>
      </div>

      <Sheet open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Invoice Details
            </SheetTitle>
          </SheetHeader>
          {selectedInvoice && (
            <div className="mt-6 space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Invoice Number</p>
                  <p className="font-mono font-medium text-lg">{selectedInvoice.invoiceNumber}</p>
                </div>
                <StatusBadge status={selectedInvoice.status} />
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Client Information
                </h4>
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <p className="font-medium">{selectedInvoice.client?.name || "N/A"}</p>
                  {selectedInvoice.client?.companyName && (
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Building className="h-3 w-3" />
                      {selectedInvoice.client.companyName}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">{selectedInvoice.client?.email}</p>
                  <p className="text-sm text-muted-foreground">{selectedInvoice.client?.phone}</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Dates
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="text-sm font-medium">{format(new Date(selectedInvoice.createdAt), "MMM d, yyyy")}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Due Date</p>
                    <p className="text-sm font-medium">{format(new Date(selectedInvoice.dueDate), "MMM d, yyyy")}</p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <SarSymbol size="xs" />
                  Amount
                </h4>
                <div className="p-4 rounded-lg border">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Total Amount</span>
                    <span className="text-2xl font-bold"><SarAmount amount={selectedInvoice.amount} /></span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => handleDownloadInvoice(selectedInvoice.id)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}
