import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { LoadingScreen, LoadingSpinner } from "@/components/loading-spinner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import {
  Mail,
  Eye,
  Save,
  RotateCcw,
  Code,
  CheckCircle2,
  XCircle,
  Variable,
} from "lucide-react";

interface EmailTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  subject: string;
  htmlBody: string;
  availableVariables: string;
  isActive: boolean;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function AdminEmailTemplates() {
  const { toast } = useToast();
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editHtmlBody, setEditHtmlBody] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("editor");

  const { data: templates, isLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/admin/email-templates"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, subject, htmlBody, isActive }: { id: string; subject: string; htmlBody: string; isActive: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/email-templates/${id}`, { subject, htmlBody, isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-templates"] });
      setEditingTemplate(null);
      toast({ title: "Template Saved", description: "Email template has been updated successfully." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to save template", variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/email-templates/${id}/reset`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-templates"] });
      setShowResetConfirm(null);
      setEditingTemplate(null);
      toast({ title: "Template Reset", description: "Email template has been reset to default." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to reset template", variant: "destructive" });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async ({ id, subject, htmlBody }: { id: string; subject: string; htmlBody: string }) => {
      const res = await apiRequest("POST", `/api/admin/email-templates/${id}/preview`, { subject, htmlBody });
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewHtml(data.html);
      setActiveTab("preview");
    },
    onError: (error) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to generate preview", variant: "destructive" });
    },
  });

  const openEditor = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setEditSubject(template.subject);
    setEditHtmlBody(template.htmlBody);
    setEditIsActive(template.isActive);
    setPreviewHtml(null);
    setActiveTab("editor");
  };

  const getVariables = (template: EmailTemplate): string[] => {
    try {
      return JSON.parse(template.availableVariables);
    } catch {
      return [];
    }
  };

  if (isLoading) return <AdminLayout><LoadingScreen message="Loading email templates..." /></AdminLayout>;

  if (editingTemplate) {
    return (
      <AdminLayout>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-page-title">{editingTemplate.name}</h1>
              <p className="text-muted-foreground">{editingTemplate.description}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditingTemplate(null)} data-testid="button-back">
                Back to Templates
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Variable className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Variables:</span>
                </div>
                {getVariables(editingTemplate).map((v) => (
                  <Badge key={v} variant="secondary" className="font-mono text-xs cursor-pointer" onClick={() => {
                    navigator.clipboard.writeText(`{{${v}}}`);
                    toast({ title: "Copied", description: `{{${v}}} copied to clipboard` });
                  }}>
                    {"{{" + v + "}}"}
                  </Badge>
                ))}
              </div>

              <div className="space-y-2">
                <Label>Subject Line</Label>
                <Input
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  placeholder="Email subject..."
                  data-testid="input-subject"
                />
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  checked={editIsActive}
                  onCheckedChange={setEditIsActive}
                  data-testid="switch-active"
                />
                <Label>Template Active</Label>
                {!editIsActive && (
                  <span className="text-xs text-muted-foreground">(Disabled templates will use the default built-in version)</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <div className="flex items-center justify-between mb-4">
                  <TabsList>
                    <TabsTrigger value="editor" data-testid="tab-editor">
                      <Code className="h-4 w-4 mr-1" />
                      HTML Editor
                    </TabsTrigger>
                    <TabsTrigger value="preview" data-testid="tab-preview">
                      <Eye className="h-4 w-4 mr-1" />
                      Preview
                    </TabsTrigger>
                  </TabsList>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => previewMutation.mutate({ id: editingTemplate.id, subject: editSubject, htmlBody: editHtmlBody })}
                      disabled={previewMutation.isPending}
                      data-testid="button-preview"
                    >
                      {previewMutation.isPending ? <LoadingSpinner size="sm" className="mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                      Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowResetConfirm(editingTemplate.id)}
                      data-testid="button-reset"
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Reset to Default
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => updateMutation.mutate({ id: editingTemplate.id, subject: editSubject, htmlBody: editHtmlBody, isActive: editIsActive })}
                      disabled={updateMutation.isPending}
                      data-testid="button-save"
                    >
                      {updateMutation.isPending ? <LoadingSpinner size="sm" className="mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                      Save Template
                    </Button>
                  </div>
                </div>

                <TabsContent value="editor" className="mt-0">
                  <textarea
                    value={editHtmlBody}
                    onChange={(e) => setEditHtmlBody(e.target.value)}
                    className="w-full h-[600px] font-mono text-sm p-4 border rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    spellCheck={false}
                    data-testid="textarea-html-body"
                  />
                </TabsContent>

                <TabsContent value="preview" className="mt-0">
                  {previewHtml ? (
                    <div className="border rounded-md bg-white">
                      <iframe
                        srcDoc={previewHtml}
                        className="w-full h-[600px] rounded-md"
                        title="Email Preview"
                        sandbox="allow-same-origin"
                        data-testid="iframe-preview"
                      />
                    </div>
                  ) : (
                    <div className="border rounded-md h-[600px] flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <Eye className="h-12 w-12 mx-auto mb-3 opacity-30" />
                        <p>Click "Preview" to see how the email will look</p>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <Dialog open={!!showResetConfirm} onOpenChange={() => setShowResetConfirm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Template to Default</DialogTitle>
              <DialogDescription>
                This will replace the current subject and HTML body with the original default template. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowResetConfirm(null)} data-testid="button-cancel-reset">Cancel</Button>
              <Button
                variant="destructive"
                disabled={resetMutation.isPending}
                onClick={() => { if (showResetConfirm) resetMutation.mutate(showResetConfirm); }}
                data-testid="button-confirm-reset"
              >
                {resetMutation.isPending ? "Resetting..." : "Reset to Default"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Email Templates</h1>
          <p className="text-muted-foreground">Customize the content and styling of all system emails</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates?.map((template) => (
            <Card key={template.id} className="flex flex-col" data-testid={`card-template-${template.slug}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">{template.name}</CardTitle>
                  </div>
                  {template.isActive ? (
                    <Badge className="gap-1 bg-green-600" data-testid={`badge-active-${template.slug}`}>
                      <CheckCircle2 className="h-3 w-3" />Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1" data-testid={`badge-inactive-${template.slug}`}>
                      <XCircle className="h-3 w-3" />Inactive
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-xs mt-1">{template.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between">
                <div className="space-y-2 mb-4">
                  <div>
                    <span className="text-xs text-muted-foreground">Subject:</span>
                    <p className="text-sm font-mono truncate" title={template.subject}>{template.subject}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Variables:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {getVariables(template).slice(0, 4).map((v) => (
                        <Badge key={v} variant="outline" className="font-mono text-xs py-0">{v}</Badge>
                      ))}
                      {getVariables(template).length > 4 && (
                        <Badge variant="outline" className="text-xs py-0">+{getVariables(template).length - 4}</Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Updated {format(new Date(template.updatedAt), "MMM d, yyyy")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => openEditor(template)}
                  data-testid={`button-edit-${template.slug}`}
                >
                  Edit Template
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {!templates?.length && (
          <div className="text-center py-12 text-muted-foreground">
            <Mail className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No email templates found. Templates will be created automatically on server restart.</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
