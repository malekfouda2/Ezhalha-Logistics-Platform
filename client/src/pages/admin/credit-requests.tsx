import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { LoadingScreen } from "@/components/loading-spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  ShieldX,
  Users,
  AlertTriangle,
} from "lucide-react";

function statusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
    case "approved":
      return <Badge className="gap-1 bg-green-600"><CheckCircle2 className="h-3 w-3" />Approved</Badge>;
    case "rejected":
      return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
    case "revoked":
      return <Badge variant="secondary" className="gap-1"><ShieldX className="h-3 w-3" />Revoked</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function AdminCreditRequests() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | "revoke" | null>(null);
  const [adminNotes, setAdminNotes] = useState("");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/credit-requests", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/admin/credit-requests?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({ id, action, notes }: { id: string; action: string; notes: string }) => {
      const res = await apiRequest("POST", `/api/admin/credit-requests/${id}/${action}`, { adminNotes: notes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/credit-requests"] });
      setSelectedRequest(null);
      setActionType(null);
      setAdminNotes("");
      toast({ title: "Success", description: "Credit access request updated." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to update request", variant: "destructive" });
    },
  });

  const openAction = (request: any, action: "approve" | "reject" | "revoke") => {
    setSelectedRequest(request);
    setActionType(action);
    setAdminNotes("");
  };

  const pendingCount = data?.requests?.filter((r: any) => r.status === "pending").length || 0;

  if (isLoading) return <AdminLayout><LoadingScreen message="Loading credit requests..." /></AdminLayout>;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Credit Access Requests</h1>
          <p className="text-muted-foreground">Manage client requests for credit / pay later access</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-amber-500" />
                <div>
                  <p className="text-2xl font-bold" data-testid="text-pending-count">{pendingCount}</p>
                  <p className="text-sm text-muted-foreground">Pending Requests</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold" data-testid="text-approved-count">
                    {data?.requests?.filter((r: any) => r.status === "approved").length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Approved</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold" data-testid="text-total-count">{data?.total || 0}</p>
                  <p className="text-sm text-muted-foreground">Total Requests</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Requests</CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="revoked">Revoked</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {!data?.requests?.length ? (
              <div className="text-center py-12 text-muted-foreground">
                <ShieldCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No credit access requests found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Reviewed</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.requests.map((request: any) => (
                    <TableRow key={request.id} data-testid={`row-request-${request.id}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium" data-testid={`text-client-name-${request.id}`}>{request.clientName}</p>
                          <p className="text-xs text-muted-foreground">{request.clientEmail}</p>
                          {request.companyName && (
                            <p className="text-xs text-muted-foreground">{request.companyName}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm" data-testid={`text-account-${request.id}`}>{request.accountNumber}</span>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm max-w-[200px] truncate" title={request.reason || "No reason provided"}>
                          {request.reason || "—"}
                        </p>
                      </TableCell>
                      <TableCell>{statusBadge(request.status)}</TableCell>
                      <TableCell>
                        <span className="text-sm">{format(new Date(request.createdAt), "MMM d, yyyy")}</span>
                      </TableCell>
                      <TableCell>
                        {request.reviewedAt ? (
                          <div>
                            <p className="text-sm">{format(new Date(request.reviewedAt), "MMM d, yyyy")}</p>
                            <p className="text-xs text-muted-foreground">by {request.reviewedByName}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {request.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => openAction(request, "approve")}
                                data-testid={`button-approve-${request.id}`}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => openAction(request, "reject")}
                                data-testid={`button-reject-${request.id}`}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          {request.status === "approved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openAction(request, "revoke")}
                              data-testid={`button-revoke-${request.id}`}
                            >
                              Revoke Access
                            </Button>
                          )}
                          {(request.status === "rejected" || request.status === "revoked") && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => openAction(request, "approve")}
                              data-testid={`button-reapprove-${request.id}`}
                            >
                              Re-approve
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!actionType} onOpenChange={() => { setActionType(null); setSelectedRequest(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {actionType === "approve" && <><ShieldCheck className="h-5 w-5 text-green-500" />Approve Credit Access</>}
                {actionType === "reject" && <><AlertTriangle className="h-5 w-5 text-red-500" />Reject Credit Request</>}
                {actionType === "revoke" && <><ShieldX className="h-5 w-5 text-amber-500" />Revoke Credit Access</>}
              </DialogTitle>
              <DialogDescription>
                {actionType === "approve" && `This will enable credit / pay later for ${selectedRequest?.clientName}.`}
                {actionType === "reject" && `This will deny the credit access request from ${selectedRequest?.clientName}.`}
                {actionType === "revoke" && `This will disable credit / pay later for ${selectedRequest?.clientName}. They will not be able to use Pay Later for new shipments.`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="rounded-lg bg-muted p-3 space-y-1">
                <p className="text-sm"><span className="font-medium">Client:</span> {selectedRequest?.clientName}</p>
                <p className="text-sm"><span className="font-medium">Account:</span> {selectedRequest?.accountNumber}</p>
                {selectedRequest?.reason && (
                  <p className="text-sm"><span className="font-medium">Reason:</span> {selectedRequest.reason}</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">Admin Notes (optional)</label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add a note about this decision..."
                  className="mt-1"
                  data-testid="input-admin-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setActionType(null); setSelectedRequest(null); }} data-testid="button-cancel-action">
                Cancel
              </Button>
              <Button
                variant={actionType === "reject" || actionType === "revoke" ? "destructive" : "default"}
                disabled={actionMutation.isPending}
                onClick={() => {
                  if (selectedRequest && actionType) {
                    actionMutation.mutate({ id: selectedRequest.id, action: actionType, notes: adminNotes });
                  }
                }}
                data-testid="button-confirm-action"
              >
                {actionMutation.isPending ? "Processing..." : actionType === "approve" ? "Approve" : actionType === "reject" ? "Reject" : "Revoke"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
