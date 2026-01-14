import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { LoadingScreen } from "@/components/loading-spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { 
  Search, 
  Shield, 
  FileText, 
  Users, 
  Package, 
  DollarSign,
  CalendarIcon,
  Filter,
  X,
  Activity,
  Clock,
  BarChart3,
  RefreshCw
} from "lucide-react";
import { PaginationControls } from "@/components/pagination-controls";
import type { AuditLog } from "@shared/schema";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";

interface PaginatedResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  totalPages: number;
}

interface StatsResponse {
  totalLogs: number;
  uniqueActions: string[];
  uniqueEntityTypes: string[];
}

const actionIcons: Record<string, typeof Shield> = {
  login: Shield,
  logout: Shield,
  approve_application: FileText,
  reject_application: FileText,
  create_client: Users,
  delete_client: Users,
  update_client_profile: Users,
  create_shipment: Package,
  cancel_shipment: Package,
  update_pricing: DollarSign,
  create_pricing_profile: DollarSign,
  delete_pricing_profile: DollarSign,
};

const actionColors: Record<string, string> = {
  login: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  logout: "bg-slate-100 text-slate-800 dark:bg-slate-900/50 dark:text-slate-200",
  approve_application: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200",
  reject_application: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
  create_client: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200",
  delete_client: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
  update_client_profile: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200",
  create_shipment: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200",
  cancel_shipment: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200",
  update_pricing: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200",
  create_pricing_profile: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  delete_pricing_profile: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
};


export default function AdminAuditLogs() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

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
    if (entityFilter !== "all") params.set("entityType", entityFilter);
    if (actionFilter !== "all") params.set("action", actionFilter);
    if (startDate) params.set("startDate", startOfDay(startDate).toISOString());
    if (endDate) params.set("endDate", endOfDay(endDate).toISOString());
    return params.toString();
  };

  const { data, isLoading, isFetching, refetch } = useQuery<PaginatedResponse>({
    queryKey: ["/api/admin/audit-logs", page, pageSize, debouncedSearch, entityFilter, actionFilter, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      const res = await fetch(`/api/admin/audit-logs?${buildQueryString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      return res.json();
    },
  });

  const { data: stats } = useQuery<StatsResponse>({
    queryKey: ["/api/admin/audit-logs/stats"],
  });

  const hasActiveFilters = entityFilter !== "all" || actionFilter !== "all" || startDate || endDate || debouncedSearch;

  const clearFilters = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setEntityFilter("all");
    setActionFilter("all");
    setStartDate(undefined);
    setEndDate(undefined);
    setPage(1);
  };

  const setQuickDateRange = (days: number) => {
    setStartDate(subDays(new Date(), days));
    setEndDate(new Date());
    setPage(1);
  };

  if (isLoading && !data) {
    return (
      <AdminLayout>
        <LoadingScreen message="Loading audit logs..." />
      </AdminLayout>
    );
  }

  const logs = data?.logs || [];
  const totalPages = data?.totalPages || 1;
  const total = data?.total || 0;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Audit Logs</h1>
            <p className="text-muted-foreground">
              Track all system activity and user actions
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Activity className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.totalLogs?.toLocaleString() || 0}</p>
                  <p className="text-xs text-muted-foreground">Total Events</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <BarChart3 className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.uniqueActions?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">Action Types</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <FileText className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.uniqueEntityTypes?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">Entity Types</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Clock className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{total.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Filtered Results</p>
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
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-logs"
                />
              </div>

              <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[180px]" data-testid="select-entity-type">
                  <SelectValue placeholder="Entity Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Entities</SelectItem>
                  {stats?.uniqueEntityTypes?.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[180px]" data-testid="select-action-type">
                  <SelectValue placeholder="Action Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {stats?.uniqueActions?.map((action) => (
                    <SelectItem key={action} value={action}>
                      {action.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal", !startDate && "text-muted-foreground")} data-testid="button-start-date">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "MMM d, yyyy") : "Start Date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={(d) => { setStartDate(d); setPage(1); }} initialFocus />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal", !endDate && "text-muted-foreground")} data-testid="button-end-date">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "MMM d, yyyy") : "End Date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={(d) => { setEndDate(d); setPage(1); }} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground self-center">Quick:</span>
              <Button variant="outline" size="sm" onClick={() => setQuickDateRange(1)} data-testid="button-last-24h">Last 24h</Button>
              <Button variant="outline" size="sm" onClick={() => setQuickDateRange(7)} data-testid="button-last-7d">Last 7 days</Button>
              <Button variant="outline" size="sm" onClick={() => setQuickDateRange(30)} data-testid="button-last-30d">Last 30 days</Button>
              <Button variant="outline" size="sm" onClick={() => setQuickDateRange(90)} data-testid="button-last-90d">Last 90 days</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {logs.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[180px]">Timestamp</TableHead>
                        <TableHead className="w-[200px]">Action</TableHead>
                        <TableHead className="w-[150px]">Entity</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead className="w-[130px]">IP Address</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => {
                        const Icon = actionIcons[log.action] || Shield;
                        const colorClass = actionColors[log.action] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";

                        return (
                          <TableRow key={log.id} data-testid={`row-log-${log.id}`} className="hover:bg-muted/50">
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap font-mono">
                              {format(new Date(log.createdAt), "MMM d, yyyy HH:mm:ss")}
                            </TableCell>
                            <TableCell>
                              <Badge className={`${colorClass} flex items-center gap-1.5 w-fit`}>
                                <Icon className="h-3 w-3" />
                                {log.action.replace(/_/g, " ")}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="text-sm font-medium capitalize">
                                  {log.entityType.replace(/_/g, " ")}
                                </span>
                                {log.entityId && (
                                  <span className="text-xs text-muted-foreground font-mono">
                                    {log.entityId.substring(0, 8)}...
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-md">
                              <p className="text-sm truncate" title={log.details || undefined}>
                                {log.details || "-"}
                              </p>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground font-mono">
                              {log.ipAddress || "-"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

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
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Shield className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No Audit Logs Found</h3>
                <p className="text-muted-foreground mt-1">
                  {hasActiveFilters ? "Try adjusting your filters" : "No activity has been logged yet"}
                </p>
                {hasActiveFilters && (
                  <Button variant="outline" className="mt-4" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
