import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { LoadingScreen } from "@/components/loading-spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FileText, Plus, Edit, Trash2, Eye, EyeOff, ExternalLink, Clock } from "lucide-react";
import type { Policy } from "@shared/schema";

export default function AdminPolicies() {
  const { toast } = useToast();
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [policyToDelete, setPolicyToDelete] = useState<Policy | null>(null);

  const [formTitle, setFormTitle] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formIsPublished, setFormIsPublished] = useState(true);
  const [activeTab, setActiveTab] = useState("edit");

  const { data: policiesList, isLoading } = useQuery<Policy[]>({
    queryKey: ["/api/admin/policies"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; slug: string; content: string; isPublished: boolean }) => {
      const res = await apiRequest("POST", "/api/admin/policies", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/policies"] });
      setIsCreateOpen(false);
      resetForm();
      toast({ title: "Policy created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; title: string; content: string; isPublished: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/policies/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/policies"] });
      setEditingPolicy(null);
      resetForm();
      toast({ title: "Policy updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/policies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/policies"] });
      setDeleteConfirmOpen(false);
      setPolicyToDelete(null);
      toast({ title: "Policy deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: async ({ id, isPublished }: { id: string; isPublished: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/policies/${id}`, { isPublished });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/policies"] });
      toast({ title: "Policy visibility updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setFormTitle("");
    setFormSlug("");
    setFormContent("");
    setFormIsPublished(true);
    setActiveTab("edit");
  }

  function openEdit(policy: Policy) {
    setEditingPolicy(policy);
    setFormTitle(policy.title);
    setFormSlug(policy.slug);
    setFormContent(policy.content);
    setFormIsPublished(policy.isPublished);
    setActiveTab("edit");
  }

  function openCreate() {
    resetForm();
    setIsCreateOpen(true);
  }

  function handleSave() {
    if (!formTitle.trim() || !formContent.trim()) {
      toast({ title: "Title and content are required", variant: "destructive" });
      return;
    }

    if (editingPolicy) {
      updateMutation.mutate({
        id: editingPolicy.id,
        title: formTitle,
        content: formContent,
        isPublished: formIsPublished,
      });
    } else {
      const slug = formSlug.trim() || formTitle.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      createMutation.mutate({
        title: formTitle,
        slug,
        content: formContent,
        isPublished: formIsPublished,
      });
    }
  }

  function formatDate(date: string | Date) {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (isLoading) {
    return (
      <AdminLayout>
        <LoadingScreen message="Loading policies..." />
      </AdminLayout>
    );
  }

  const isDialogOpen = isCreateOpen || editingPolicy !== null;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-policies-title">Policy Pages</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage public-facing policy pages like privacy policy and shipping terms
            </p>
          </div>
          <Button onClick={openCreate} data-testid="button-create-policy">
            <Plus className="w-4 h-4 mr-2" />
            New Policy
          </Button>
        </div>

        {!policiesList || policiesList.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No policies yet</h3>
              <p className="text-muted-foreground mb-4">Create your first policy page to get started.</p>
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Create Policy
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {policiesList.map((policy) => (
              <Card key={policy.id} data-testid={`card-policy-${policy.id}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap mb-2">
                        <h3 className="text-lg font-semibold" data-testid={`text-policy-title-${policy.id}`}>
                          {policy.title}
                        </h3>
                        <Badge variant={policy.isPublished ? "default" : "secondary"}>
                          {policy.isPublished ? (
                            <><Eye className="w-3 h-3 mr-1" /> Published</>
                          ) : (
                            <><EyeOff className="w-3 h-3 mr-1" /> Draft</>
                          )}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                        <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">/{policy.slug}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Last updated: {formatDate(policy.updatedAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={policy.isPublished}
                        onCheckedChange={(checked) =>
                          togglePublishMutation.mutate({ id: policy.id, isPublished: checked })
                        }
                        data-testid={`switch-publish-${policy.id}`}
                      />
                      {policy.isPublished && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => window.open(`/policy/${policy.slug}`, "_blank")}
                          data-testid={`button-view-${policy.id}`}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(policy)}
                        data-testid={`button-edit-${policy.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setPolicyToDelete(policy);
                          setDeleteConfirmOpen(true);
                        }}
                        data-testid={`button-delete-${policy.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setEditingPolicy(null);
          setIsCreateOpen(false);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPolicy ? "Edit Policy" : "Create New Policy"}</DialogTitle>
            <DialogDescription>
              {editingPolicy
                ? "Update the policy content below. Changes are saved when you click Save."
                : "Create a new public policy page. Content supports HTML formatting."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="policy-title">Title</Label>
                <Input
                  id="policy-title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Privacy Policy"
                  data-testid="input-policy-title"
                />
              </div>
              {!editingPolicy && (
                <div className="space-y-2">
                  <Label htmlFor="policy-slug">URL Slug</Label>
                  <Input
                    id="policy-slug"
                    value={formSlug}
                    onChange={(e) => setFormSlug(e.target.value)}
                    placeholder="auto-generated from title"
                    data-testid="input-policy-slug"
                  />
                  <p className="text-xs text-muted-foreground">Leave blank to auto-generate from title</p>
                </div>
              )}
              {editingPolicy && (
                <div className="space-y-2">
                  <Label>URL Slug</Label>
                  <div className="flex items-center h-9 px-3 rounded-md border bg-muted text-sm text-muted-foreground">
                    /{editingPolicy.slug}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={formIsPublished}
                onCheckedChange={setFormIsPublished}
                id="policy-published"
                data-testid="switch-policy-published"
              />
              <Label htmlFor="policy-published" className="cursor-pointer">
                {formIsPublished ? "Published (visible to public)" : "Draft (hidden from public)"}
              </Label>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="edit" data-testid="tab-edit">Edit HTML</TabsTrigger>
                <TabsTrigger value="preview" data-testid="tab-preview">Preview</TabsTrigger>
              </TabsList>
              <TabsContent value="edit" className="mt-3">
                <Textarea
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="Enter policy content in HTML format..."
                  className="min-h-[400px] font-mono text-sm"
                  data-testid="textarea-policy-content"
                />
              </TabsContent>
              <TabsContent value="preview" className="mt-3">
                <Card>
                  <CardContent className="p-6">
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: formContent }}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditingPolicy(null);
                setIsCreateOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !formTitle.trim() || !formContent.trim()}
              data-testid="button-save-policy"
            >
              {isSaving ? "Saving..." : editingPolicy ? "Save Changes" : "Create Policy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Policy</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{policyToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => policyToDelete && deleteMutation.mutate(policyToDelete.id)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
