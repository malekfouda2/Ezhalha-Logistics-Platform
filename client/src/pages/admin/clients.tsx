import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { ProfileBadge } from "@/components/profile-badge";
import { LoadingScreen } from "@/components/loading-spinner";
import { NoClients } from "@/components/empty-state";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Search, MoreVertical, Eye, Edit, Power, Package, FileText, Download } from "lucide-react";
import { Link } from "wouter";
import type { ClientAccount } from "@shared/schema";
import { format } from "date-fns";

export default function AdminClients() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientAccount | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [editProfile, setEditProfile] = useState("");

  const { data: clients, isLoading } = useQuery<ClientAccount[]>({
    queryKey: ["/api/admin/clients"],
  });

  const updateProfileMutation = useMutation({
    mutationFn: async ({ id, profile }: { id: string; profile: string }) => {
      await apiRequest("PATCH", `/api/admin/clients/${id}/profile`, { profile });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      setIsEditOpen(false);
      toast({
        title: "Profile updated",
        description: "Client profile has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/admin/clients/${id}/status`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      toast({
        title: "Status updated",
        description: "Client status has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const filteredClients = clients?.filter(
    (client) =>
      client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleViewDocs = (client: ClientAccount) => {
    setSelectedClient(client);
    setIsDocsOpen(true);
  };

  const handleEditProfile = (client: ClientAccount) => {
    setSelectedClient(client);
    setEditProfile(client.profile);
    setIsEditOpen(true);
  };

  const handleSaveProfile = () => {
    if (selectedClient && editProfile) {
      updateProfileMutation.mutate({ id: selectedClient.id, profile: editProfile });
    }
  };

  const handleToggleStatus = (client: ClientAccount) => {
    toggleStatusMutation.mutate({ id: client.id, isActive: !client.isActive });
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <LoadingScreen message="Loading clients..." />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Client Accounts</h1>
            <p className="text-muted-foreground">
              Manage client accounts and their profiles
            </p>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search clients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Clients Table */}
        <Card>
          <CardContent className="p-0">
            {filteredClients && filteredClients.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Profile</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.map((client) => (
                    <TableRow key={client.id} data-testid={`row-client-${client.id}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{client.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {client.country}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{client.email}</p>
                          <p className="text-sm text-muted-foreground">
                            {client.phone}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <ProfileBadge profile={client.profile} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={client.isActive ? "active" : "inactive"} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(client.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              data-testid={`button-actions-${client.id}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/clients/${client.id}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEditProfile(client)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleViewDocs(client)}>
                              <FileText className="mr-2 h-4 w-4" />
                              View Documents {client.documents?.length ? `(${client.documents.length})` : ''}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleToggleStatus(client)}>
                              <Power className="mr-2 h-4 w-4" />
                              {client.isActive ? "Deactivate" : "Activate"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <NoClients />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Profile Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Client Profile</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Change the pricing tier for <strong>{selectedClient?.name}</strong>
            </p>
            <Select value={editProfile} onValueChange={setEditProfile}>
              <SelectTrigger data-testid="select-profile">
                <SelectValue placeholder="Select profile" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="regular">Regular</SelectItem>
                <SelectItem value="mid_level">Mid-Level</SelectItem>
                <SelectItem value="vip">VIP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveProfile}
              disabled={updateProfileMutation.isPending}
              data-testid="button-save-profile"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Documents Dialog */}
      <Dialog open={isDocsOpen} onOpenChange={setIsDocsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Client Documents</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Documents for <strong>{selectedClient?.name}</strong>
            </p>
            {selectedClient?.documents && selectedClient.documents.length > 0 ? (
              <div className="space-y-2">
                {selectedClient.documents.map((docPath, index) => (
                  <a
                    key={docPath}
                    href={docPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 p-3 rounded-md border hover:bg-muted/50 transition-colors"
                    data-testid={`link-client-document-${index}`}
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
              <p className="text-sm text-muted-foreground">No documents available</p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsDocsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
