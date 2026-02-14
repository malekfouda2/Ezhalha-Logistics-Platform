import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { LoadingScreen } from "@/components/loading-spinner";
import { NoShipments } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Eye, MapPin, Package, Calendar, Ban, Loader2, RefreshCw, Filter, X } from "lucide-react";
import { SarSymbol, SarAmount } from "@/components/sar-symbol";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Shipment } from "@shared/schema";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface PaginatedResponse {
  shipments: Shipment[];
  total: number;
  page: number;
  totalPages: number;
}

export default function AdminShipments() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const { toast } = useToast();

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
    queryKey: ["/api/admin/shipments", page, pageSize, debouncedSearch, statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/shipments?${buildQueryString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch shipments");
      return res.json();
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/shipments/${id}/status`, { status });
      return res.json();
    },
    onSuccess: (_data: Shipment, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shipments"] });
      if (selectedShipment) {
        setSelectedShipment({ ...selectedShipment, status: variables.status as any });
      }
      toast({ title: "Status Updated", description: "Shipment status has been updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/shipments/${id}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shipments"] });
      if (selectedShipment) {
        setSelectedShipment({ ...selectedShipment, status: "cancelled" });
      }
      toast({ title: "Shipment Cancelled", description: "Shipment has been cancelled successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
        <LoadingScreen message="Loading shipments..." />
      </AdminLayout>
    );
  }

  const shipments = data?.shipments || [];
  const totalPages = data?.totalPages || 1;
  const total = data?.total || 0;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Shipments</h1>
            <p className="text-muted-foreground">Track and manage all shipments across clients</p>
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
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{total.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Total Shipments</p>
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
                  placeholder="Search by tracking #, name, or city..."
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
                  <SelectItem value="created">Created</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="in_transit">In Transit</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {shipments.length > 0 ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tracking #</TableHead>
                      <TableHead>Origin</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Weight</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shipments.map((shipment) => (
                      <TableRow key={shipment.id} data-testid={`row-shipment-${shipment.id}`}>
                        <TableCell className="font-mono text-sm font-medium">{shipment.trackingNumber}</TableCell>
                        <TableCell>
                          <span className="text-sm">{shipment.senderCity}, {shipment.senderCountry}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{shipment.recipientCity}, {shipment.recipientCountry}</span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={shipment.status} />
                        </TableCell>
                        <TableCell className="text-sm">{Number(shipment.weight).toFixed(1)} kg</TableCell>
                        <TableCell className="text-right font-medium"><SarAmount amount={shipment.finalPrice} /></TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => setSelectedShipment(shipment)} data-testid={`button-view-${shipment.id}`}>
                            <Eye className="h-4 w-4" />
                          </Button>
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
              <NoShipments />
            )}
          </CardContent>
        </Card>
      </div>

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
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Tracking Number</p>
                  <p className="font-mono font-medium">{selectedShipment.trackingNumber}</p>
                </div>
                <StatusBadge status={selectedShipment.status} />
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Origin</span>
                </div>
                <p className="font-medium">{selectedShipment.senderName}</p>
                <p className="text-sm text-muted-foreground">{selectedShipment.senderAddress}</p>
                <p className="text-sm text-muted-foreground">{selectedShipment.senderCity}, {selectedShipment.senderCountry}</p>
                <p className="text-sm text-muted-foreground">{selectedShipment.senderPhone}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Destination</span>
                </div>
                <p className="font-medium">{selectedShipment.recipientName}</p>
                <p className="text-sm text-muted-foreground">{selectedShipment.recipientAddress}</p>
                <p className="text-sm text-muted-foreground">{selectedShipment.recipientCity}, {selectedShipment.recipientCountry}</p>
                <p className="text-sm text-muted-foreground">{selectedShipment.recipientPhone}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Weight</p>
                  <p className="text-lg font-medium">{Number(selectedShipment.weight).toFixed(1)} kg</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Package Type</p>
                  <p className="text-lg font-medium capitalize">{selectedShipment.packageType}</p>
                </div>
              </div>
              <div className="p-4 rounded-lg border">
                <div className="flex items-center gap-2 mb-3">
                  <SarSymbol size="xs" className="text-muted-foreground" />
                  <span className="text-sm font-medium">Pricing Breakdown</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Base Rate</span>
                    <span><SarAmount amount={selectedShipment.baseRate} /></span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Margin</span>
                    <span className="text-green-600 dark:text-green-400">+<SarAmount amount={selectedShipment.margin} /></span>
                  </div>
                  <div className="border-t pt-2 flex justify-between font-medium">
                    <span>Final Price</span>
                    <span><SarAmount amount={selectedShipment.finalPrice} /></span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Created {format(new Date(selectedShipment.createdAt), "MMM d, yyyy 'at' h:mm a")}
              </div>
              {selectedShipment.status !== "cancelled" && selectedShipment.status !== "delivered" && (
                <div className="p-4 rounded-lg border space-y-4">
                  <p className="text-sm font-medium">Update Status</p>
                  <div className="flex items-center gap-3">
                    <Select
                      value={selectedShipment.status}
                      onValueChange={(status) => updateStatusMutation.mutate({ id: selectedShipment.id, status })}
                      disabled={updateStatusMutation.isPending}
                    >
                      <SelectTrigger className="flex-1" data-testid="select-status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="created">Created</SelectItem>
                        <SelectItem value="processing">Processing</SelectItem>
                        <SelectItem value="in_transit">In Transit</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                      </SelectContent>
                    </Select>
                    {updateStatusMutation.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  </div>
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => cancelMutation.mutate(selectedShipment.id)}
                    disabled={cancelMutation.isPending}
                    data-testid="button-cancel-shipment"
                  >
                    {cancelMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
                    Cancel Shipment
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}
