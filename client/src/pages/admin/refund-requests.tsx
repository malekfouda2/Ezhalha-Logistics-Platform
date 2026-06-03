import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Banknote,
  CheckCircle2,
  Clock,
  ExternalLink,
  Package,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  UserCheck,
  XCircle,
} from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { LoadingScreen } from "@/components/loading-spinner";
import { SarAmount } from "@/components/sar-symbol";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, readJsonResponse } from "@/lib/queryClient";

type RefundStatusFilter = "PENDING" | "COMPLETED" | "REJECTED" | "ALL";
type ApprovalStep = "account_manager" | "finance";

interface AdminRefundRequestSummary {
  id: string;
  shipmentId: string;
  shipmentTrackingNumber: string | null;
  carrierTrackingNumber: string | null;
  shipmentStatus: string | null;
  clientName: string;
  clientAccountNumber: string | null;
  amount: string;
  currency: string;
  status: string;
  requestedByName: string | null;
  requestedByActorType: string;
  accountManagerName: string | null;
  accountManagerApprovalStatus: string;
  financeApprovalStatus: string;
  accountManagerApprovalSatisfied: boolean;
  financeApprovalSatisfied: boolean;
  canApproveAsAccountManager: boolean;
  canApproveAsFinance: boolean;
  createdAt: string;
  completedAt?: string | null;
}

function formatLabel(value: string | null | undefined): string {
  if (!value) return "Unknown";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusBadge(status: string) {
  switch (status) {
    case "PENDING":
      return <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700 dark:text-amber-300"><Clock className="h-3 w-3" />Pending</Badge>;
    case "COMPLETED":
      return <Badge className="gap-1 bg-green-600"><CheckCircle2 className="h-3 w-3" />Completed</Badge>;
    case "REJECTED":
      return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
    default:
      return <Badge variant="outline">{formatLabel(status)}</Badge>;
  }
}

function approvalBadge(label: string, status: string) {
  if (status === "APPROVED" || status === "NOT_REQUIRED") {
    return (
      <Badge className="gap-1 bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-200">
        <CheckCircle2 className="h-3 w-3" />
        {label}: {status === "NOT_REQUIRED" ? "Not Required" : "Approved"}
      </Badge>
    );
  }

  if (status === "PENDING") {
    return (
      <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700 dark:text-amber-300">
        <Clock className="h-3 w-3" />
        {label}: Pending
      </Badge>
    );
  }

  return (
    <Badge variant="destructive" className="gap-1">
      <XCircle className="h-3 w-3" />
      {label}: {formatLabel(status)}
    </Badge>
  );
}

function RefundAmount({ amount, currency }: { amount: string; currency: string }) {
  const numericAmount = Number(amount || 0);
  if ((currency || "SAR").toUpperCase() === "SAR") {
    return <SarAmount amount={numericAmount} className="font-semibold" />;
  }

  return (
    <span className="font-semibold">
      {numericAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
    </span>
  );
}

function getPendingStep(request: AdminRefundRequestSummary): string {
  if (request.status !== "PENDING") {
    return formatLabel(request.status);
  }

  const steps = [];
  if (!request.accountManagerApprovalSatisfied) steps.push("Account Manager");
  if (!request.financeApprovalSatisfied) steps.push("Finance");
  return steps.length ? `Waiting for ${steps.join(" + ")}` : "Ready to complete";
}

export default function AdminRefundRequests() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<RefundStatusFilter>("PENDING");

  const {
    data: refundRequests,
    isLoading,
    isFetching,
  } = useQuery<AdminRefundRequestSummary[]>({
    queryKey: ["/api/admin/refund-requests", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        status: statusFilter,
        limit: "50",
      });
      const res = await fetch(`/api/admin/refund-requests?${params.toString()}`, {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to fetch refund requests");
      }

      return readJsonResponse<AdminRefundRequestSummary[]>(res);
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ requestId, step }: { requestId: string; step: ApprovalStep }) => {
      const endpoint =
        step === "account_manager"
          ? `/api/admin/refund-requests/${requestId}/approve-account-manager`
          : `/api/admin/refund-requests/${requestId}/approve-finance`;
      const res = await apiRequest("POST", endpoint);
      return readJsonResponse<AdminRefundRequestSummary>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/refund-requests"] });
      toast({
        title: "Refund approval recorded",
        description: "The refund request has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Approval failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const requests = refundRequests || [];
  const pendingCount = requests.filter((request) => request.status === "PENDING").length;
  const waitingForAccountManager = requests.filter((request) => !request.accountManagerApprovalSatisfied).length;
  const waitingForFinance = requests.filter((request) => !request.financeApprovalSatisfied).length;
  const completedCount = requests.filter((request) => request.status === "COMPLETED").length;

  if (isLoading) {
    return (
      <AdminLayout>
        <LoadingScreen message="Loading refund requests..." />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <RotateCcw className="h-6 w-6 text-primary" />
              Refund Requests
            </h1>
            <p className="text-muted-foreground">
              Review cancellation refunds and record the required Account Manager and Finance approvals.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as RefundStatusFilter)}>
              <SelectTrigger className="w-[180px]" data-testid="select-refund-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="ALL">All Requests</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/refund-requests"] })}
              disabled={isFetching}
              data-testid="button-refresh-refund-requests"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-amber-500" />
                <div>
                  <p className="text-2xl font-bold">{pendingCount}</p>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <UserCheck className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{waitingForAccountManager}</p>
                  <p className="text-sm text-muted-foreground">Need AM Approval</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-8 w-8 text-purple-500" />
                <div>
                  <p className="text-2xl font-bold">{waitingForFinance}</p>
                  <p className="text-sm text-muted-foreground">Need Finance Approval</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{completedCount}</p>
                  <p className="text-sm text-muted-foreground">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-primary" />
              Refund Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            {requests.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <RotateCcw className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No refund requests found for this filter.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Shipment</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Approvals</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((request) => (
                      <TableRow key={request.id} data-testid={`refund-request-row-${request.id}`}>
                        <TableCell className="min-w-[220px]">
                          <div className="font-medium flex items-center gap-2">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            {request.shipmentTrackingNumber || request.shipmentId}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Carrier: {request.carrierTrackingNumber || "Not available"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Shipment status: {formatLabel(request.shipmentStatus)}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[180px]">
                          <div className="font-medium">{request.clientName}</div>
                          <div className="text-sm text-muted-foreground">
                            {request.clientAccountNumber || "No account number"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <RefundAmount amount={request.amount} currency={request.currency} />
                        </TableCell>
                        <TableCell>
                          <div className="space-y-2">
                            {statusBadge(request.status)}
                            <div className="text-xs text-muted-foreground">{getPendingStep(request)}</div>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[260px]">
                          <div className="flex flex-wrap gap-2">
                            {approvalBadge("AM", request.accountManagerApprovalStatus)}
                            {approvalBadge("Finance", request.financeApprovalStatus)}
                          </div>
                          <div className="text-xs text-muted-foreground mt-2">
                            Account Manager: {request.accountManagerName || "Not assigned"}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[180px]">
                          <div className="text-sm">
                            {request.requestedByName || "Unknown"} ({formatLabel(request.requestedByActorType)})
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(request.createdAt), "MMM d, yyyy 'at' h:mm a")}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2 flex-wrap">
                            <Link href="/admin/shipments">
                              <Button variant="outline" size="sm">
                                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                Shipments
                              </Button>
                            </Link>
                            {request.canApproveAsAccountManager && (
                              <Button
                                size="sm"
                                onClick={() => approveMutation.mutate({ requestId: request.id, step: "account_manager" })}
                                disabled={approveMutation.isPending}
                                data-testid={`button-approve-refund-am-${request.id}`}
                              >
                                Approve AM
                              </Button>
                            )}
                            {request.canApproveAsFinance && (
                              <Button
                                size="sm"
                                onClick={() => approveMutation.mutate({ requestId: request.id, step: "finance" })}
                                disabled={approveMutation.isPending}
                                data-testid={`button-approve-refund-finance-${request.id}`}
                              >
                                Approve Finance
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
