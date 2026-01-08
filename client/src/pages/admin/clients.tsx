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
import { Separator } from "@/components/ui/separator";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Search, MoreVertical, Eye, Edit, Power, FileText, Download, Mail, Phone, MapPin, Building, Calendar, Plus, Trash2, Upload, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useUpload } from "@/hooks/use-upload";

const countries = [
  "Saudi Arabia",
  "United Arab Emirates",
  "Qatar",
  "Kuwait",
  "Bahrain",
  "Oman",
  "Egypt",
  "Jordan",
  "Lebanon",
  "United States",
  "United Kingdom",
  "Germany",
  "France",
  "Other",
];

interface UploadedDocument {
  name: string;
  path: string;
}
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ClientAccount } from "@shared/schema";
import { format } from "date-fns";

export default function AdminClients() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientAccount | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editProfile, setEditProfile] = useState("");
  const [newClient, setNewClient] = useState({
    name: "",
    email: "",
    phone: "",
    country: "",
    companyName: "",
  });
  const [createUploadedDocs, setCreateUploadedDocs] = useState<UploadedDocument[]>([]);
  
  const { uploadFile, isUploading } = useUpload({
    onSuccess: (response) => {
      setCreateUploadedDocs((prev) => [
        ...prev,
        { name: response.metadata.name, path: response.objectPath },
      ]);
      toast({
        title: "Document uploaded",
        description: response.metadata.name,
      });
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      await uploadFile(files[i]);
    }
    e.target.value = "";
  };

  const removeCreateDocument = (path: string) => {
    setCreateUploadedDocs((prev) => prev.filter((doc) => doc.path !== path));
  };

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

  const createClientMutation = useMutation({
    mutationFn: async (data: typeof newClient & { documents?: string[] }) => {
      await apiRequest("POST", "/api/admin/clients", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      setIsCreateOpen(false);
      setNewClient({ name: "", email: "", phone: "", country: "", companyName: "" });
      setCreateUploadedDocs([]);
      toast({
        title: "Client created",
        description: "New client has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Creation failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/clients/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      setIsDeleteOpen(false);
      setIsDetailsOpen(false);
      setSelectedClient(null);
      toast({
        title: "Client deleted",
        description: "Client has been permanently deleted.",
      });
    },
    onError: (error) => {
      toast({
        title: "Deletion failed",
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

  const handleViewDetails = (client: ClientAccount) => {
    setSelectedClient(client);
    setIsDetailsOpen(true);
  };

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

  const handleDeleteClient = (client: ClientAccount) => {
    setSelectedClient(client);
    setIsDeleteOpen(true);
  };

  const handleCreateClient = () => {
    if (!newClient.name || !newClient.email || !newClient.phone || !newClient.country) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    createClientMutation.mutate({
      ...newClient,
      documents: createUploadedDocs.length > 0 ? createUploadedDocs.map((doc) => doc.path) : undefined,
    });
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
          <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-client">
            <Plus className="mr-2 h-4 w-4" />
            Create Client
          </Button>
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
                            <DropdownMenuItem onClick={() => handleViewDetails(client)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
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
                            <DropdownMenuItem
                              onClick={() => handleDeleteClient(client)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete Client
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

      {/* Client Details Sheet */}
      <Sheet open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Client Details</SheetTitle>
          </SheetHeader>
          {selectedClient && (
            <div className="mt-6 space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-2xl font-bold">
                  {selectedClient.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg truncate">{selectedClient.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <ProfileBadge profile={selectedClient.profile} />
                    <StatusBadge status={selectedClient.isActive ? "active" : "inactive"} />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground">Contact Information</h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm truncate">{selectedClient.email}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm">{selectedClient.phone}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm">{selectedClient.country}</span>
                  </div>
                  {selectedClient.companyName && (
                    <div className="flex items-center gap-3">
                      <Building className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm">{selectedClient.companyName}</span>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground">Account Information</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Client ID</span>
                    <span className="text-sm font-mono">{selectedClient.id.slice(0, 8)}...</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Joined</span>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{format(new Date(selectedClient.createdAt), "MMM d, yyyy")}</span>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground">Documents</h4>
                {selectedClient.documents && selectedClient.documents.length > 0 ? (
                  <div className="space-y-2">
                    {selectedClient.documents.map((docPath, index) => (
                      <a
                        key={docPath}
                        href={docPath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 p-3 rounded-md border hover:bg-muted/50 transition-colors"
                        data-testid={`link-detail-document-${index}`}
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

              <Separator />

              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsDetailsOpen(false);
                    handleEditProfile(selectedClient);
                  }}
                  data-testid="button-edit-from-details"
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Profile
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    handleToggleStatus(selectedClient);
                    setIsDetailsOpen(false);
                  }}
                  data-testid="button-toggle-from-details"
                >
                  <Power className="mr-2 h-4 w-4" />
                  {selectedClient.isActive ? "Deactivate Client" : "Activate Client"}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleDeleteClient(selectedClient)}
                  data-testid="button-delete-from-details"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Client
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Create Client Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                placeholder="Enter client name"
                value={newClient.name}
                onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                data-testid="input-new-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="client@example.com"
                value={newClient.email}
                onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                data-testid="input-new-email"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  placeholder="+1 234 567 890"
                  value={newClient.phone}
                  onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                  data-testid="input-new-phone"
                />
              </div>
              <div className="space-y-2">
                <Label>Country *</Label>
                <Select
                  value={newClient.country}
                  onValueChange={(value) => setNewClient({ ...newClient, country: value })}
                >
                  <SelectTrigger data-testid="select-new-country">
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map((country) => (
                      <SelectItem key={country} value={country}>
                        {country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name (Optional)</Label>
              <Input
                id="companyName"
                placeholder="Enter company name"
                value={newClient.companyName}
                onChange={(e) => setNewClient({ ...newClient, companyName: e.target.value })}
                data-testid="input-new-company"
              />
            </div>
            
            <div className="pt-4 border-t">
              <h3 className="text-sm font-medium mb-3">Upload Company Documents</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Upload Commercial Registration, Tax Certificate, and other business documents.
              </p>
              
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <label htmlFor="create-document-upload" className="cursor-pointer">
                    <div className="flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-muted/50 transition-colors">
                      <Upload className="h-4 w-4" />
                      <span className="text-sm">
                        {isUploading ? "Uploading..." : "Choose Files"}
                      </span>
                    </div>
                    <input
                      id="create-document-upload"
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={handleCreateFileSelect}
                      disabled={isUploading}
                      data-testid="input-new-documents"
                    />
                  </label>
                  <span className="text-xs text-muted-foreground">
                    PDF, DOC, DOCX, JPG, PNG
                  </span>
                </div>
                
                {createUploadedDocs.length > 0 && (
                  <div className="space-y-2">
                    {createUploadedDocs.map((doc) => (
                      <div
                        key={doc.path}
                        className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                          <span className="text-sm truncate">{doc.name}</span>
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => removeCreateDocument(doc.path)}
                          data-testid={`button-remove-create-doc-${doc.path}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                
                {createUploadedDocs.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No documents uploaded yet
                  </p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateClient}
              disabled={createClientMutation.isPending || isUploading}
              data-testid="button-save-new-client"
            >
              Create Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Client</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{selectedClient?.name}</strong>?
              This action cannot be undone and will remove all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedClient && deleteClientMutation.mutate(selectedClient.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
