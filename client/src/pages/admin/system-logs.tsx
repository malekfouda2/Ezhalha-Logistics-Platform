import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Search,
  RefreshCw,
  Filter,
  X,
  Bug,
  AlertTriangle,
  AlertOctagon,
  Info,
  CheckCircle,
  Clock,
} from "lucide-react";
import type { SystemLog } from "@shared/schema";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useAdminAccess } from "@/hooks/use-admin-access";

interface PaginatedResponse {
  logs: SystemLog[];
  total: number;
  page: number;
  totalPages: number;
}

interface LogStats {
  total: number;
  errors: number;
  warnings: number;
  unresolved: number;
}

export default function AdminSystemLogs() {
  const { toast } = useToast();
  const adminAccess = useAdminAccess();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [resolvedFilter, setResolvedFilter] = useState("false");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);

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
    if (levelFilter !== "all") params.set("level", levelFilter);
    if (sourceFilter !== "all") params.set("source", sourceFilter);
    if (resolvedFilter !== "all") params.set("resolved", resolvedFilter);
    return params.toString();
  };

  const { data, isLoading, isFetching, refetch } = useQuery<PaginatedResponse>({
    queryKey: ["/api/admin/system-logs", page, pageSize, debouncedSearch, levelFilter, sourceFilter, resolvedFilter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/system-logs?${buildQueryString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
  });

  const { data: stats } = useQuery<LogStats>({
    queryKey: ["/api/admin/system-logs/stats"],
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/admin/system-logs/${id}/resolve`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Log marked as resolved" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/system-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/system-logs/stats"] });
      setSelectedLog(null);
    },
    onError: () => {
      toast({ title: "Failed to resolve log", variant: "destructive" });
    },
  });

  const canResolveLogs = adminAccess.hasPermission("system-logs", "resolve");

  const hasActiveFilters = levelFilter !== "all" || sourceFilter !== "all" || resolvedFilter !== "false" || debouncedSearch;

  const clearFilters = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setLevelFilter("all");
    setSourceFilter("all");
    setResolvedFilter("false");
    setPage(1);
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case "error":
        return (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" data-testid="badge-level-error">
            <AlertOctagon className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
      case "warn":
        return (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" data-testid="badge-level-warn">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Warning
          </Badge>
        );
      case "info":
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" data-testid="badge-level-info">
            <Info className="h-3 w-3 mr-1" />
            Info
          </Badge>
        );
      default:
        return <Badge variant="outline">{level}</Badge>;
    }
  };

  const getSourceBadge = (source: string | null) => {
    if (!source) return <span className="text-muted-foreground">-</span>;
    const colors: Record<string, string> = {
      fedex: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      zoho: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      tap: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
      moyasar: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      stripe: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
      email: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
      carrier: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      database: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
      auth: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      system: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    };
    return (
      <Badge variant="outline" className={colors[source] || ""}>
        {source.charAt(0).toUpperCase() + source.slice(1)}
      </Badge>
    );
  };

  if (isLoading && !data) {
    return (
      <AdminLayout>
        <LoadingScreen message="Loading system logs..." />
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
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-system-logs">
              <Bug className="h-6 w-6" />
              Bugs & Error Logs
            </h1>
            <p className="text-muted-foreground">
              Monitor system errors, warnings, and issues
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh">
            <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Bug className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-total">{stats?.total?.toLocaleString() || 0}</p>
                  <p className="text-xs text-muted-foreground">Total Logs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                  <AlertOctagon className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="stat-errors">{stats?.errors?.toLocaleString() || 0}</p>
                  <p className="text-xs text-muted-foreground">Errors</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="stat-warnings">{stats?.warnings?.toLocaleString() || 0}</p>
                  <p className="text-xs text-muted-foreground">Warnings</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                  <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400" data-testid="stat-unresolved">{stats?.unresolved?.toLocaleString() || 0}</p>
                  <p className="text-xs text-muted-foreground">Unresolved</p>
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
                  placeholder="Search errors, messages, endpoints..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-system-logs"
                />
              </div>
              <Select value={levelFilter} onValueChange={(v) => { setLevelFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[140px]" data-testid="select-level-filter">
                  <SelectValue placeholder="Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="error">Errors</SelectItem>
                  <SelectItem value="warn">Warnings</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[140px]" data-testid="select-source-filter">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="fedex">FedEx</SelectItem>
                  <SelectItem value="zoho">Zoho</SelectItem>
                  <SelectItem value="tap">Tap</SelectItem>
                  <SelectItem value="moyasar">Moyasar</SelectItem>
                  <SelectItem value="stripe">Stripe</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="carrier">Carrier</SelectItem>
                  <SelectItem value="database">Database</SelectItem>
                  <SelectItem value="auth">Auth</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
              <Select value={resolvedFilter} onValueChange={(v) => { setResolvedFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[140px]" data-testid="select-resolved-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="false">Unresolved</SelectItem>
                  <SelectItem value="true">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {logs.length > 0 ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow
                        key={log.id}
                        className="cursor-pointer"
                        onClick={() => setSelectedLog(log)}
                        data-testid={`row-system-log-${log.id}`}
                      >
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(log.createdAt), "MMM d, HH:mm:ss")}
                        </TableCell>
                        <TableCell>{getLevelBadge(log.level)}</TableCell>
                        <TableCell>{getSourceBadge(log.source)}</TableCell>
                        <TableCell className="max-w-xs truncate text-sm">
                          {log.message}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                          {log.endpoint || "-"}
                        </TableCell>
                        <TableCell>
                          {log.resolvedAt ? (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Resolved
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-orange-600 border-orange-300 dark:text-orange-400 dark:border-orange-700">
                              <Clock className="h-3 w-3 mr-1" />
                              Open
                            </Badge>
                          )}
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
              <div className="p-8 text-center text-muted-foreground" data-testid="empty-system-logs">
                <CheckCircle className="h-10 w-10 mx-auto mb-3 text-green-500" />
                <p className="font-medium">No issues found</p>
                <p className="text-sm mt-1">All systems are running smoothly</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Sheet open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto" data-testid="sheet-log-detail">
          {selectedLog && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {getLevelBadge(selectedLog.level)}
                  Log Detail
                </SheetTitle>
                <SheetDescription>
                  {format(new Date(selectedLog.createdAt), "MMMM d, yyyy 'at' HH:mm:ss")}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 py-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Message</label>
                  <p className="mt-1 text-sm font-medium" data-testid="detail-message">{selectedLog.message}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Source</label>
                    <div className="mt-1">{getSourceBadge(selectedLog.source)}</div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Error Code</label>
                    <p className="mt-1 text-sm">{selectedLog.errorCode || "-"}</p>
                  </div>
                </div>

                {selectedLog.endpoint && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Endpoint</label>
                    <p className="mt-1 text-sm font-mono bg-muted p-2 rounded">{selectedLog.endpoint}</p>
                  </div>
                )}

                {selectedLog.stack && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Stack Trace</label>
                    <pre className="mt-1 text-xs font-mono bg-muted p-3 rounded overflow-x-auto max-h-60 whitespace-pre-wrap" data-testid="detail-stack">
                      {selectedLog.stack}
                    </pre>
                  </div>
                )}

                {selectedLog.metadata && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Metadata</label>
                    <pre className="mt-1 text-xs font-mono bg-muted p-3 rounded overflow-x-auto max-h-40 whitespace-pre-wrap" data-testid="detail-metadata">
                      {(() => {
                        try {
                          return JSON.stringify(JSON.parse(selectedLog.metadata), null, 2);
                        } catch {
                          return selectedLog.metadata;
                        }
                      })()}
                    </pre>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {selectedLog.userId && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">User ID</label>
                      <p className="mt-1 text-xs font-mono">{selectedLog.userId}</p>
                    </div>
                  )}
                  {selectedLog.ipAddress && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">IP Address</label>
                      <p className="mt-1 text-xs font-mono">{selectedLog.ipAddress}</p>
                    </div>
                  )}
                </div>

                <div className="border-t pt-4">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Resolution Status</label>
                  {selectedLog.resolvedAt ? (
                    <div className="mt-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium text-green-800 dark:text-green-300">Resolved</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(selectedLog.resolvedAt), "MMM d, yyyy 'at' HH:mm")}
                      </p>
                    </div>
                  ) : canResolveLogs ? (
                    <div className="mt-2">
                      <Button
                        onClick={() => resolveMutation.mutate(selectedLog.id)}
                        disabled={resolveMutation.isPending}
                        size="sm"
                        data-testid="button-resolve-log"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        {resolveMutation.isPending ? "Resolving..." : "Mark as Resolved"}
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-muted-foreground">
                      Read-only access. Resolving logs requires `system-logs:resolve`.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}
