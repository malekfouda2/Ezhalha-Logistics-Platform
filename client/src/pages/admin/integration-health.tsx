import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { LoadingScreen } from "@/components/loading-spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { format } from "date-fns";
import { Activity, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

interface CarrierErrorExplanation {
  code: string | null;
  category: string;
  title: string;
  cause: string;
  action: string;
  retry: "retry" | "after_fix" | "not_retryable";
  recognised: boolean;
  raw: string;
}

interface FailureGroup {
  serviceName: string;
  operation: string;
  statusCode: number | null;
  count: number;
  firstSeen: string;
  lastSeen: string;
  explanation: CarrierErrorExplanation;
}

interface ServiceHealth {
  serviceName: string;
  total: number;
  failures: number;
  failureRate: number;
  lastFailureAt: string | null;
}

interface HealthReport {
  windowHours: number;
  generatedAt: string;
  services: ServiceHealth[];
  failureGroups: FailureGroup[];
}

const WINDOWS = [
  { value: "24", label: "Last 24 hours" },
  { value: "168", label: "Last 7 days" },
  { value: "720", label: "Last 30 days" },
  { value: "1440", label: "Last 60 days" },
];

function retryBadge(retry: CarrierErrorExplanation["retry"]) {
  if (retry === "retry") {
    return <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" />Worth retrying</Badge>;
  }
  if (retry === "after_fix") {
    return <Badge className="gap-1 bg-amber-600"><AlertTriangle className="h-3 w-3" />Fix before retrying</Badge>;
  }
  return <Badge variant="destructive" className="gap-1"><ShieldAlert className="h-3 w-3" />Retrying will not help</Badge>;
}

export default function AdminIntegrationHealth() {
  const [windowHours, setWindowHours] = useState("168");

  const { data, isLoading } = useQuery<HealthReport>({
    queryKey: ["/api/admin/integration-health", windowHours],
    queryFn: async () => {
      const res = await fetch(`/api/admin/integration-health?windowHours=${windowHours}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load integration health");
      return res.json();
    },
  });

  if (isLoading) {
    return <AdminLayout><LoadingScreen message="Checking integrations..." /></AdminLayout>;
  }

  const totalFailures = data?.services.reduce((sum, service) => sum + service.failures, 0) ?? 0;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Integration Health</h1>
            <p className="text-muted-foreground">
              Every carrier and service call that failed, grouped by what went wrong.
            </p>
          </div>
          <Select value={windowHours} onValueChange={setWindowHours}>
            <SelectTrigger className="w-[180px]" data-testid="select-window">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOWS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {data?.services.map((service) => {
            const percent = Math.round(service.failureRate * 100);
            return (
              <Card key={service.serviceName} data-testid={`card-service-${service.serviceName}`}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <span className="font-medium capitalize">{service.serviceName}</span>
                    <Activity
                      className={`h-4 w-4 ${percent >= 20 ? "text-destructive" : percent > 0 ? "text-amber-500" : "text-emerald-500"}`}
                    />
                  </div>
                  <p className="text-2xl font-bold mt-2 tabular-nums">
                    {service.failures.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    failed of {service.total.toLocaleString()} calls ({percent}%)
                  </p>
                  {service.lastFailureAt && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Last {format(new Date(service.lastFailureAt), "d MMM HH:mm")}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>What is failing</CardTitle>
          </CardHeader>
          <CardContent>
            {!data?.failureGroups.length ? (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No integration failures in this window.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service</TableHead>
                      <TableHead>Call</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead>What went wrong</TableHead>
                      <TableHead>Last seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.failureGroups.map((group, index) => (
                      <TableRow key={index} data-testid={`row-failure-${index}`}>
                        <TableCell className="capitalize font-medium">{group.serviceName}</TableCell>
                        <TableCell>
                          <code className="text-xs">{group.operation}</code>
                          {group.statusCode && (
                            <Badge variant="outline" className="ml-2">{group.statusCode}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {group.count.toLocaleString()}
                        </TableCell>
                        <TableCell className="max-w-md">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{group.explanation.title}</span>
                              {retryBadge(group.explanation.retry)}
                            </div>
                            <p className="text-xs text-muted-foreground">{group.explanation.cause}</p>
                            <p className="text-xs">{group.explanation.action}</p>
                            {group.explanation.raw && (
                              <details>
                                <summary className="text-xs text-muted-foreground cursor-pointer">
                                  {group.explanation.recognised
                                    ? "Raw response"
                                    : "Raw response (not yet translated)"}
                                </summary>
                                <pre className="text-xs mt-1 whitespace-pre-wrap break-all text-muted-foreground">
                                  {group.explanation.raw.slice(0, 600)}
                                </pre>
                              </details>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(group.lastSeen), "d MMM HH:mm")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {totalFailures > 0 && (
          <p className="text-xs text-muted-foreground">
            Successful calls are deliberately not stored in production — only failures keep their
            response body, so this page stays useful without the logs table growing without bound.
          </p>
        )}
      </div>
    </AdminLayout>
  );
}
