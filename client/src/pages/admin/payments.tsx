import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { LoadingScreen } from "@/components/loading-spinner";
import { PaginationControls } from "@/components/pagination-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Search, CheckCircle, XCircle, Clock, RefreshCw, Filter, X } from "lucide-react";
import { SarSymbol, SarAmount } from "@/components/sar-symbol";
import type { Payment } from "@shared/schema";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const statusIcons: Record<string, typeof Clock> = {
  pending: Clock,
  completed: CheckCircle,
  failed: XCircle,
};

interface PaginatedResponse {
  payments: Payment[];
  total: number;
  page: number;
  totalPages: number;
}

export default function AdminPayments() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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
    queryKey: ["/api/admin/payments", page, pageSize, debouncedSearch, statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/payments?${buildQueryString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch payments");
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

  if (isLoading && !data) {
    return (
      <AdminLayout>
        <LoadingScreen message="Loading payments..." />
      </AdminLayout>
    );
  }

  const payments = data?.payments || [];
  const totalPages = data?.totalPages || 1;
  const total = data?.total || 0;
  const completedAmount = payments.filter(p => p.status === "completed").reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Financial Statements</h1>
            <p className="text-muted-foreground">View and manage all payment transactions</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total Collected</p>
              <p className="text-2xl font-bold text-green-600"><SarAmount amount={completedAmount} /></p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh">
              <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <SarSymbol size="sm" className="text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Payments</p>
                  <p className="text-xl font-bold">{total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Completed</p>
                  <p className="text-xl font-bold">{payments.filter(p => p.status === "completed").length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                  <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-xl font-bold">{payments.filter(p => p.status === "pending").length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Failed</p>
                  <p className="text-xl font-bold">{payments.filter(p => p.status === "failed").length}</p>
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
                  placeholder="Search payments..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-payments"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {payments.length > 0 ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice ID</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Transaction ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => {
                      const StatusIcon = statusIcons[payment.status] || Clock;
                      return (
                        <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(payment.createdAt), "MMM d, yyyy HH:mm")}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{payment.invoiceId.slice(0, 8)}...</TableCell>
                          <TableCell className="font-bold"><SarAmount amount={payment.amount} /></TableCell>
                          <TableCell>
                            <Badge variant="outline">{payment.paymentMethod}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={statusColors[payment.status] || ""}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {payment.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">
                            {payment.transactionId || payment.stripePaymentIntentId?.slice(0, 15) || "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
              <div className="p-8 text-center text-muted-foreground">No payments found</div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
