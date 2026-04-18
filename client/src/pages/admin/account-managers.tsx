import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AdminLayout } from "@/components/admin-layout";
import { LoadingScreen } from "@/components/loading-spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, readJsonResponse } from "@/lib/queryClient";
import { FileClock, Users } from "lucide-react";

interface AssignedClientSummary {
  id: string;
  accountNumber: string;
  name: string;
  profile: string;
  isActive: boolean;
}

interface AccountManagerSummary {
  id: string;
  username: string;
  email: string;
  isActive: boolean;
  isAccountManager: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  assignedClients: AssignedClientSummary[];
}

interface ClientListResponse {
  clients: AssignedClientSummary[];
}

interface ChangeRequestSummary {
  id: string;
  accountManagerUserId: string;
  clientAccountId: string;
  requestType: string;
  status: string;
  requestedChanges: Record<string, unknown>;
  adminNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  accountManager: {
    id: string;
    username: string;
    email: string;
  } | null;
  client: {
    id: string;
    accountNumber: string;
    name: string;
    profile: string;
    isActive: boolean;
  } | null;
  reviewedBy: {
    id: string;
    username: string;
    email: string;
  } | null;
}

function humanizeFieldName(fieldName: string) {
  return fieldName
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

function formatFieldValue(value: unknown) {
  if (typeof value === "boolean") {
    return value ? "Active" : "Inactive";
  }

  if (value === null || value === undefined || value === "") {
    return "Empty";
  }

  return String(value);
}

export default function AdminAccountManagers() {
  const adminAccess = useAdminAccess();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("account-managers");
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selectedManager, setSelectedManager] = useState<AccountManagerSummary | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<ChangeRequestSummary | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject">("approve");
  const [reviewNotes, setReviewNotes] = useState("");
  const [assignmentClientIds, setAssignmentClientIds] = useState<string[]>([]);

  const canReadAccountManagers = adminAccess.hasPermission("account-managers", "read");
  const canAssignAccountManagers = adminAccess.hasPermission("account-managers", "assign");
  const canReadRequests = adminAccess.hasPermission("account-manager-requests", "read");
  const canApproveRequests = adminAccess.hasPermission("account-manager-requests", "approve");
  const canRejectRequests = adminAccess.hasPermission("account-manager-requests", "reject");

  const availableTabs = [
    canReadAccountManagers ? "account-managers" : null,
    canReadRequests ? "change-requests" : null,
  ].filter(Boolean) as string[];

  useEffect(() => {
    if (!availableTabs.includes(activeTab) && availableTabs.length > 0) {
      setActiveTab(availableTabs[0]);
    }
  }, [activeTab, availableTabs]);

  const { data: accountManagers, isLoading: managersLoading } = useQuery<AccountManagerSummary[]>({
    queryKey: ["/api/admin/account-managers"],
    enabled: canReadAccountManagers,
    queryFn: async () => {
      const res = await fetch("/api/admin/account-managers", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to fetch account managers");
      }
      return readJsonResponse<AccountManagerSummary[]>(res);
    },
  });

  const { data: availableClients } = useQuery<ClientListResponse>({
    queryKey: ["/api/admin/clients", "account-manager-options"],
    enabled: canAssignAccountManagers && adminAccess.hasPermission("clients", "read"),
    queryFn: async () => {
      const res = await fetch("/api/admin/clients?page=1&limit=1000", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to fetch clients");
      }
      return readJsonResponse<ClientListResponse>(res);
    },
  });

  const { data: changeRequests, isLoading: requestsLoading } = useQuery<ChangeRequestSummary[]>({
    queryKey: ["/api/admin/account-managers/change-requests", statusFilter],
    enabled: canReadRequests,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      const res = await fetch(`/api/admin/account-managers/change-requests?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch change requests");
      }
      return readJsonResponse<ChangeRequestSummary[]>(res);
    },
  });

  const isPageLoading =
    (canReadAccountManagers && managersLoading) ||
    (canReadRequests && activeTab === "change-requests" && requestsLoading);

  const pendingRequestsCount = useMemo(
    () => (changeRequests || []).filter((request) => request.status === "pending").length,
    [changeRequests],
  );

  const toggleSelection = (
    setIds: React.Dispatch<React.SetStateAction<string[]>>,
    clientId: string,
    checked: boolean,
  ) => {
    setIds((previous) => {
      if (checked) {
        return previous.includes(clientId) ? previous : [...previous, clientId];
      }

      return previous.filter((id) => id !== clientId);
    });
  };

  const updateAssignmentsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedManager) {
        throw new Error("No account manager selected");
      }

      const res = await apiRequest("PUT", `/api/admin/account-managers/${selectedManager.id}/clients`, {
        clientAccountIds: assignmentClientIds,
      });

      return readJsonResponse<AccountManagerSummary>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/account-managers"] });
      setAssignDialogOpen(false);
      setSelectedManager(null);
      toast({ title: "Assignments updated", description: "Client assignments were updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update assignments", description: error.message, variant: "destructive" });
    },
  });

  const reviewRequestMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRequest) {
        throw new Error("No change request selected");
      }

      const endpoint =
        reviewAction === "approve"
          ? `/api/admin/account-managers/change-requests/${selectedRequest.id}/approve`
          : `/api/admin/account-managers/change-requests/${selectedRequest.id}/reject`;

      const res = await apiRequest("POST", endpoint, { adminNotes: reviewNotes });
      return readJsonResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/account-managers/change-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      setReviewDialogOpen(false);
      setSelectedRequest(null);
      setReviewNotes("");
      toast({
        title: reviewAction === "approve" ? "Request approved" : "Request rejected",
        description: reviewAction === "approve"
          ? "The requested client changes were applied successfully."
          : "The change request was rejected.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to review request", description: error.message, variant: "destructive" });
    },
  });

  const openAssignmentsDialog = (manager: AccountManagerSummary) => {
    setSelectedManager(manager);
    setAssignmentClientIds(manager.assignedClients.map((client) => client.id));
    setAssignDialogOpen(true);
  };

  const openReviewDialog = (request: ChangeRequestSummary, action: "approve" | "reject") => {
    setSelectedRequest(request);
    setReviewAction(action);
    setReviewNotes("");
    setReviewDialogOpen(true);
  };

  if (isPageLoading) {
    return (
      <AdminLayout>
        <LoadingScreen message="Loading account managers..." />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Account Managers</h1>
            <p className="text-muted-foreground">
              Manage account-manager client scope and review their pending client-change requests.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-sm">
              <Users className="h-3 w-3 mr-1" />
              {accountManagers?.length || 0} account managers
            </Badge>
            <Badge variant="outline" className="text-sm">
              <FileClock className="h-3 w-3 mr-1" />
              {pendingRequestsCount} pending approvals
            </Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            {canReadAccountManagers && (
              <TabsTrigger value="account-managers" data-testid="tab-account-managers">
                <Users className="h-4 w-4 mr-2" />
                Account Managers
              </TabsTrigger>
            )}
            {canReadRequests && (
              <TabsTrigger value="change-requests" data-testid="tab-change-requests">
                <FileClock className="h-4 w-4 mr-2" />
                Change Requests
              </TabsTrigger>
            )}
          </TabsList>

          {canReadAccountManagers && (
            <TabsContent value="account-managers" className="space-y-4">
              <Card>
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  Create new account managers from the Access Control page by assigning the built-in
                  {" "}
                  <span className="font-medium text-foreground">Account Manager</span>
                  {" "}
                  role to an admin user, then manage their client scope here.
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Scoped Admin Users</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {accountManagers && accountManagers.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account Manager</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Assigned Clients</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead className="w-[160px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {accountManagers.map((manager) => (
                          <TableRow key={manager.id} data-testid={`row-account-manager-${manager.id}`}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{manager.username}</p>
                                <p className="text-sm text-muted-foreground">{manager.email}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={manager.isActive ? "outline" : "secondary"}>
                                {manager.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-2">
                                {manager.assignedClients.length > 0 ? (
                                  manager.assignedClients.map((client) => (
                                    <Badge key={client.id} variant="secondary">
                                      {client.accountNumber} - {client.name}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-sm text-muted-foreground">No clients assigned</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(manager.createdAt), "MMM d, yyyy")}
                            </TableCell>
                            <TableCell>
                              {canAssignAccountManagers ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openAssignmentsDialog(manager)}
                                  data-testid={`button-assign-clients-${manager.id}`}
                                >
                                  Assign Clients
                                </Button>
                              ) : (
                                <span className="text-sm text-muted-foreground">Read only</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">No account managers created yet.</div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {canReadRequests && (
            <TabsContent value="change-requests" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
                  <CardTitle>Pending Client Changes</CardTitle>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]" data-testid="select-request-status-filter">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="all">All statuses</SelectItem>
                    </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent className="p-0">
                  {changeRequests && changeRequests.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account Manager</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead>Request</TableHead>
                          <TableHead>Requested Changes</TableHead>
                          <TableHead>Requested</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="w-[180px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {changeRequests.map((request) => (
                          <TableRow key={request.id} data-testid={`row-change-request-${request.id}`}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{request.accountManager?.username || "Unknown"}</p>
                                <p className="text-sm text-muted-foreground">{request.accountManager?.email || "-"}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{request.client?.name || "Unknown client"}</p>
                                <p className="text-sm text-muted-foreground">{request.client?.accountNumber || "-"}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {request.requestType === "profile_update" ? "Profile Update" : "Settings Update"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {Object.keys(request.requestedChanges).length > 0 ? (
                                Object.keys(request.requestedChanges)
                                  .slice(0, 3)
                                  .map(humanizeFieldName)
                                  .join(", ")
                              ) : (
                                "No fields"
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(request.createdAt), "MMM d, yyyy")}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  request.status === "approved"
                                    ? "outline"
                                    : request.status === "rejected"
                                      ? "secondary"
                                      : "default"
                                }
                              >
                                {request.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {request.status === "pending" && canApproveRequests && (
                                  <Button
                                    size="sm"
                                    onClick={() => openReviewDialog(request, "approve")}
                                    data-testid={`button-approve-request-${request.id}`}
                                  >
                                    Approve
                                  </Button>
                                )}
                                {request.status === "pending" && canRejectRequests && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openReviewDialog(request, "reject")}
                                    data-testid={`button-reject-request-${request.id}`}
                                  >
                                    Reject
                                  </Button>
                                )}
                                {request.status !== "pending" && (
                                  <span className="text-sm text-muted-foreground">
                                    {request.reviewedBy ? `Reviewed by ${request.reviewedBy.username}` : "Reviewed"}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">No change requests found.</div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assign Clients</DialogTitle>
            <DialogDescription>
              {selectedManager ? `Choose which clients ${selectedManager.username} can manage.` : "Select a manager first."}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-72 rounded-md border p-3">
            <div className="space-y-3">
              {(availableClients?.clients || []).map((client) => {
                const checked = assignmentClientIds.includes(client.id);
                return (
                  <label key={client.id} className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(nextChecked) =>
                        toggleSelection(setAssignmentClientIds, client.id, Boolean(nextChecked))
                      }
                    />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{client.accountNumber} - {client.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Profile: {client.profile} · {client.isActive ? "Active" : "Inactive"}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAssignDialogOpen(false); setSelectedManager(null); }}>
              Cancel
            </Button>
            <Button
              onClick={() => updateAssignmentsMutation.mutate()}
              disabled={!selectedManager || updateAssignmentsMutation.isPending}
              data-testid="button-save-account-manager-assignments"
            >
              {updateAssignmentsMutation.isPending ? "Saving..." : "Save Assignments"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{reviewAction === "approve" ? "Approve Change Request" : "Reject Change Request"}</DialogTitle>
            <DialogDescription>
              {selectedRequest?.client
                ? `${selectedRequest.client.accountNumber} - ${selectedRequest.client.name}`
                : "Review the requested client updates below."}
            </DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Requested Changes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(selectedRequest.requestedChanges).map(([fieldName, value]) => (
                    <div key={fieldName} className="flex items-start justify-between gap-4 border-b pb-3 last:border-b-0 last:pb-0">
                      <div>
                        <p className="text-sm font-medium">{humanizeFieldName(fieldName)}</p>
                      </div>
                      <p className="text-sm text-muted-foreground text-right">{formatFieldValue(value)}</p>
                    </div>
                  ))}
                  {Object.keys(selectedRequest.requestedChanges).length === 0 && (
                    <p className="text-sm text-muted-foreground">No changes captured for this request.</p>
                  )}
                </CardContent>
              </Card>
              <div className="space-y-2">
                <Label htmlFor="review-notes">Admin Notes</Label>
                <Textarea
                  id="review-notes"
                  value={reviewNotes}
                  onChange={(event) => setReviewNotes(event.target.value)}
                  placeholder={reviewAction === "approve" ? "Optional approval note" : "Why are you rejecting this request?"}
                  data-testid="textarea-review-notes"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReviewDialogOpen(false); setSelectedRequest(null); }}>
              Cancel
            </Button>
            <Button
              variant={reviewAction === "approve" ? "default" : "destructive"}
              onClick={() => reviewRequestMutation.mutate()}
              disabled={!selectedRequest || reviewRequestMutation.isPending}
              data-testid="button-submit-request-review"
            >
              {reviewRequestMutation.isPending
                ? "Submitting..."
                : reviewAction === "approve"
                  ? "Approve Request"
                  : "Reject Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
