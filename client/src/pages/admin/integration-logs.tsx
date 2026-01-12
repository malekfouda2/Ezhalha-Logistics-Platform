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
import { Search, CheckCircle, XCircle, Clock } from "lucide-react";
import type { IntegrationLog } from "@shared/schema";
import { format } from "date-fns";

export default function AdminIntegrationLogs() {
  const [searchQuery, setSearchQuery] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");

  const { data: logs, isLoading } = useQuery<IntegrationLog[]>({
    queryKey: ["/api/admin/integration-logs"],
  });

  const filteredLogs = logs?.filter((log) => {
    const matchesSearch =
      log.serviceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.operation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.errorMessage?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesService = serviceFilter === "all" || log.serviceName === serviceFilter;
    return matchesSearch && matchesService;
  });

  const uniqueServices = Array.from(new Set(logs?.map((log) => log.serviceName) || []));

  if (isLoading) {
    return (
      <AdminLayout>
        <LoadingScreen message="Loading integration logs..." />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Integration Logs</h1>
            <p className="text-muted-foreground">
              Monitor API calls to external services (FedEx, Zoho, Stripe)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm">
              {logs?.length || 0} total entries
            </Badge>
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              {logs?.filter(l => l.success).length || 0} successful
            </Badge>
            <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
              {logs?.filter(l => !l.success).length || 0} failed
            </Badge>
          </div>
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
                  data-testid="input-search-integration-logs"
                />
              </div>
              <Tabs value={serviceFilter} onValueChange={setServiceFilter}>
                <TabsList>
                  <TabsTrigger value="all" data-testid="tab-all">
                    All
                  </TabsTrigger>
                  {uniqueServices.map((service) => (
                    <TabsTrigger key={service} value={service} data-testid={`tab-${service}`}>
                      {service}
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
                    <TableHead>Service</TableHead>
                    <TableHead>Operation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id} data-testid={`row-integration-log-${log.id}`}>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(log.createdAt), "MMM d, yyyy HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.serviceName}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{log.operation}</TableCell>
                      <TableCell>
                        {log.success ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Success
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                            <XCircle className="h-3 w-3 mr-1" />
                            Failed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {log.duration ? `${log.duration}ms` : "-"}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                        {log.errorMessage || (log.statusCode ? `Status: ${log.statusCode}` : "-")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                No integration logs found
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
