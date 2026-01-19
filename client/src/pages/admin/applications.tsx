import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { LoadingScreen } from "@/components/loading-spinner";
import { NoApplications } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Search, Check, X, Building2, User, Mail, Phone, MapPin, FileText, Hash, Download, RefreshCw, Filter, Inbox } from "lucide-react";
import type { ClientApplication, PricingRule } from "@shared/schema";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface PaginatedResponse {
  applications: ClientApplication[];
  total: number;
  page: number;
  totalPages: number;
}

export default function AdminApplications() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedApp, setSelectedApp] = useState<ClientApplication | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null);
  const [selectedProfile, setSelectedProfile] = useState("regular");
  const [reviewNotes, setReviewNotes] = useState("");

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
    queryKey: ["/api/admin/applications", page, pageSize, debouncedSearch, statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/applications?${buildQueryString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch applications");
      return res.json();
    },
  });

  const { data: pricingRules } = useQuery<PricingRule[]>({
    queryKey: ["/api/admin/pricing"],
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, action, profile, notes }: { id: string; action: "approve" | "reject"; profile?: string; notes?: string }) => {
      await apiRequest("POST", `/api/admin/applications/${id}/review`, { action, profile, notes });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setIsReviewOpen(false);
      setReviewAction(null);
      setSelectedApp(null);
      setReviewNotes("");
      toast({
        title: variables.action === "approve" ? "Application approved" : "Application rejected",
        description: variables.action === "approve" ? "A new client account has been created." : "The application has been rejected.",
      });
    },
    onError: (error) => {
      toast({ title: "Action failed", description: error instanceof Error ? error.message : "Please try again", variant: "destructive" });
    },
  });

  const hasActiveFilters = statusFilter !== "all" || debouncedSearch;

  const clearFilters = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setStatusFilter("all");
    setPage(1);
  };

  const handleReview = (app: ClientApplication, action: "approve" | "reject") => {
    setSelectedApp(app);
    setReviewAction(action);
    setSelectedProfile("regular");
    setReviewNotes("");
    setIsReviewOpen(true);
  };

  const handleConfirmReview = () => {
    if (selectedApp && reviewAction) {
      reviewMutation.mutate({
        id: selectedApp.id,
        action: reviewAction,
        profile: reviewAction === "approve" ? selectedProfile : undefined,
        notes: reviewNotes || undefined,
      });
    }
  };

  if (isLoading && !data) {
    return (
      <AdminLayout>
        <LoadingScreen message="Loading applications..." />
      </AdminLayout>
    );
  }

  const applications = data?.applications || [];
  const totalPages = data?.totalPages || 1;
  const total = data?.total || 0;
  const pendingCount = applications.filter((a) => a.status === "pending").length;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Client Applications</h1>
            <p className="text-muted-foreground">Review and process new client account requests</p>
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
                <span className="font-semibold">{pendingCount}</span>
                <span className="text-sm">pending review</span>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh">
              <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Inbox className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{total.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Total Applications</p>
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
                  placeholder="Search applications..."
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
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {applications.length > 0 ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Applicant</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Applied</TableHead>
                      <TableHead className="w-32">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {applications.map((app) => (
                      <TableRow key={app.id} data-testid={`row-application-${app.id}`}>
                        <TableCell>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{app.name}</p>
                              <span className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
                                app.accountType === "company" 
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                  : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                              )}>
                                {app.accountType === "company" ? <Building2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
                                {app.accountType === "company" ? "Company" : "Individual"}
                              </span>
                            </div>
                            {app.companyName && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                <Building2 className="h-3 w-3" />
                                {app.companyName}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="text-sm flex items-center gap-1">
                              <Mail className="h-3 w-3 text-muted-foreground" />
                              {app.email}
                            </p>
                            <p className="text-sm flex items-center gap-1 text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {app.phone}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            {app.country}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={app.status} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(app.createdAt), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          {app.status === "pending" ? (
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-100 dark:hover:bg-green-900/30"
                                onClick={() => handleReview(app, "approve")}
                                data-testid={`button-approve-${app.id}`}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/30"
                                onClick={() => handleReview(app, "reject")}
                                data-testid={`button-reject-${app.id}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
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
              <NoApplications />
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "approve" ? "Approve Application" : "Reject Application"}
            </DialogTitle>
            <DialogDescription>
              {reviewAction === "approve" ? "Create a new client account for this applicant." : "Reject this application request."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <div className="flex items-center gap-2">
                <p className="font-medium">{selectedApp?.name}</p>
                <span className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
                  selectedApp?.accountType === "company" 
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                )}>
                  {selectedApp?.accountType === "company" ? <Building2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
                  {selectedApp?.accountType === "company" ? "Company" : "Individual"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{selectedApp?.email}</p>
              <p className="text-sm text-muted-foreground">
                {selectedApp?.country}
                {selectedApp?.companyName && ` - ${selectedApp.companyName}`}
              </p>
            </div>
            {(selectedApp?.crNumber || selectedApp?.taxNumber) && (
              <div className="p-4 rounded-lg border space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium mb-2">
                  <FileText className="h-4 w-4" />
                  Company Documents
                </div>
                {selectedApp?.crNumber && (
                  <div className="flex items-center gap-2 text-sm">
                    <Hash className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">CR Number:</span>
                    <span>{selectedApp.crNumber}</span>
                  </div>
                )}
                {selectedApp?.taxNumber && (
                  <div className="flex items-center gap-2 text-sm">
                    <Hash className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Tax Number:</span>
                    <span>{selectedApp.taxNumber}</span>
                  </div>
                )}
              </div>
            )}
            {selectedApp?.nationalAddressStreet && (
              <div className="p-4 rounded-lg border space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium mb-2">
                  <MapPin className="h-4 w-4" />
                  National Address
                </div>
                <div className="text-sm space-y-1">
                  <p>{selectedApp.nationalAddressStreet}</p>
                  <p className="text-muted-foreground">
                    Building: {selectedApp.nationalAddressBuilding}, District: {selectedApp.nationalAddressDistrict}
                  </p>
                  <p className="text-muted-foreground">
                    {selectedApp.nationalAddressCity}, {selectedApp.nationalAddressPostalCode}
                  </p>
                </div>
              </div>
            )}
            <div className="p-4 rounded-lg border space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium mb-2">
                <FileText className="h-4 w-4" />
                Uploaded Documents {selectedApp?.documents?.length ? `(${selectedApp.documents.length})` : ''}
              </div>
              {selectedApp?.documents && selectedApp.documents.length > 0 ? (
                <div className="space-y-2">
                  {selectedApp.documents.map((docPath, index) => (
                    <a
                      key={docPath}
                      href={docPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                      data-testid={`link-document-${index}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <span className="text-sm truncate">Document {index + 1}</span>
                      </div>
                      <Download className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No documents uploaded</p>
              )}
            </div>
            {reviewAction === "approve" && (
              <div>
                <label className="text-sm font-medium mb-2 block">Select Client Profile</label>
                <Select value={selectedProfile} onValueChange={setSelectedProfile}>
                  <SelectTrigger data-testid="select-profile">
                    <SelectValue placeholder="Select profile" />
                  </SelectTrigger>
                  <SelectContent>
                    {pricingRules?.map((rule) => (
                      <SelectItem key={rule.id} value={rule.profile}>
                        {rule.displayName || rule.profile}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-2 block">Notes (Optional)</label>
              <Textarea placeholder="Add any notes about this decision..." value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} data-testid="input-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReviewOpen(false)}>Cancel</Button>
            <Button
              variant={reviewAction === "approve" ? "default" : "destructive"}
              onClick={handleConfirmReview}
              disabled={reviewMutation.isPending}
              data-testid="button-confirm-review"
            >
              {reviewAction === "approve" ? "Approve & Create Account" : "Reject Application"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
