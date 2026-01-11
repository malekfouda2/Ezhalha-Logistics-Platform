import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { LoadingScreen } from "@/components/loading-spinner";
import { Card, CardContent } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { Search, Shield, FileText, Users, Package, DollarSign } from "lucide-react";
import type { AuditLog } from "@shared/schema";
import { format } from "date-fns";

const actionIcons: Record<string, typeof Shield> = {
  login: Shield,
  approve_application: FileText,
  reject_application: FileText,
  create_client: Users,
  delete_client: Users,
  update_client_profile: Users,
  create_shipment: Package,
  update_pricing: DollarSign,
};

const actionColors: Record<string, string> = {
  login: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  approve_application: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  reject_application: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  create_client: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  delete_client: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  update_client_profile: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  create_shipment: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  update_pricing: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

export default function AdminAuditLogs() {
  const [searchQuery, setSearchQuery] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");

  const { data: logs, isLoading } = useQuery<AuditLog[]>({
    queryKey: ["/api/admin/audit-logs"],
  });

  const filteredLogs = logs?.filter((log) => {
    const matchesSearch =
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.entityType.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesEntity = entityFilter === "all" || log.entityType === entityFilter;
    return matchesSearch && matchesEntity;
  });

  const uniqueEntityTypes = Array.from(new Set(logs?.map((log) => log.entityType) || []));

  if (isLoading) {
    return (
      <AdminLayout>
        <LoadingScreen message="Loading audit logs..." />
      </AdminLayout>
    );
  }

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
          <Badge variant="outline" className="text-sm">
            {logs?.length || 0} total entries
          </Badge>
        </div>

        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-logs"
                />
              </div>
              <Tabs value={entityFilter} onValueChange={setEntityFilter}>
                <TabsList>
                  <TabsTrigger value="all" data-testid="tab-all">
                    All
                  </TabsTrigger>
                  {uniqueEntityTypes.map((type) => (
                    <TabsTrigger key={type} value={type} data-testid={`tab-${type}`}>
                      {type.replace("_", " ")}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {filteredLogs && filteredLogs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => {
                    const Icon = actionIcons[log.action] || Shield;
                    const colorClass = actionColors[log.action] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
                    
                    return (
                      <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {format(new Date(log.createdAt), "MMM d, yyyy HH:mm")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge className={`${colorClass} flex items-center gap-1`}>
                              <Icon className="h-3 w-3" />
                              {log.action.replace(/_/g, " ")}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">
                            {log.entityType.replace(/_/g, " ")}
                          </span>
                          {log.entityId && (
                            <span className="text-xs text-muted-foreground ml-2 font-mono">
                              {log.entityId.substring(0, 8)}...
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-md truncate text-sm">
                          {log.details || "-"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono">
                          {log.ipAddress || "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Shield className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No Audit Logs</h3>
                <p className="text-muted-foreground mt-1">
                  No activity has been logged yet.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
