import { useMemo, useState } from "react";
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
  Clock,
  Zap,
  SlidersHorizontal,
  Send,
  AlertTriangle,
  Search,
} from "lucide-react";
import { useAdminAccess } from "@/hooks/use-admin-access";

interface EmailSettings {
  slug: string;
  enabled: boolean;
  maxAttempts: number;
  retryBackoffSeconds: number;
  scheduleEnabled: boolean;
  intervalMinutes: number | null;
  sendHourUtc: number | null;
  config: Record<string, number | boolean>;
  updatedByUserId: string | null;
  updatedAt: string | null;
}

interface EmailConfigField {
  key: string;
  label: string;
  help: string;
  type: "number" | "boolean";
  min?: number;
  max?: number;
  unit?: string;
}

interface DeliveryCounts {
  sent: number;
  failed: number;
  abandoned: number;
  skipped: number;
  pending: number;
  lastAt: string | null;
}

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
  trigger: "event" | "scheduled";
  triggerDescription: string;
  audience: "client" | "admin" | "operations" | "staff";
  configFields: EmailConfigField[];
  settings: EmailSettings | null;
  deliveries: DeliveryCounts;
}

interface EmailDelivery {
  id: string;
  templateSlug: string;
  recipient: string;
  subject: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

const AUDIENCE_SECTIONS: Array<{ key: EmailTemplate["audience"]; label: string; blurb: string }> = [
  { key: "client", label: "Client emails", blurb: "Sent to clients and their users." },
  { key: "admin", label: "Internal emails", blurb: "Sent to the team." },
  { key: "operations", label: "Operations emails", blurb: "Sent to operators about the work queue." },
  { key: "staff", label: "Staff access", blurb: "Invitations and access for internal users." },
];

function statusTone(status: string): string {
  if (status === "sent") return "bg-green-600 text-white";
  if (status === "abandoned") return "bg-destructive text-destructive-foreground";
  if (status === "failed") return "bg-amber-500 text-white";
  return "bg-muted text-muted-foreground";
}

export default function AdminEmailSettings() {
  const { toast } = useToast();
  const adminAccess = useAdminAccess();
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editHtmlBody, setEditHtmlBody] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("content");
  const [contentTab, setContentTab] = useState("editor");
  const [search, setSearch] = useState("");
  // Settings are edited as a draft so a half-typed retry count is never saved, and Save stays
  // one request rather than one per keystroke.
  const [settingsDraft, setSettingsDraft] = useState<EmailSettings | null>(null);

  const canUpdate = adminAccess.hasPermission("email-templates", "update");

  const { data: templates, isLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/admin/email-templates/overview"],
  });

  const editingTemplate = templates?.find((template) => template.slug === editingSlug) ?? null;

  const { data: deliveries } = useQuery<EmailDelivery[]>({
    queryKey: [`/api/admin/email-deliveries?slug=${editingSlug}`],
    enabled: Boolean(editingSlug) && activeTab === "deliveries",
  });

  const invalidateOverview = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/admin/email-templates/overview"] });

  const updateMutation = useMutation({
    mutationFn: async ({ id, subject, htmlBody, isActive }: { id: string; subject: string; htmlBody: string; isActive: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/email-templates/${id}`, { subject, htmlBody, isActive });
      return res.json();
    },
    onSuccess: () => {
      invalidateOverview();
      setEditingSlug(null);
      toast({ title: "Template saved", description: "The wording of this email has been updated." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to save template", variant: "destructive" });
    },
  });

  const settingsMutation = useMutation({
    mutationFn: async ({ slug, settings }: { slug: string; settings: Partial<EmailSettings> }) => {
      const res = await apiRequest("PUT", `/api/admin/email-templates/${slug}/settings`, settings);
      return res.json();
    },
    onSuccess: () => {
      invalidateOverview();
      toast({ title: "Settings saved", description: "This email's behaviour has been updated." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to save settings", variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/email-templates/${id}/reset`);
      return res.json();
    },
    onSuccess: () => {
      invalidateOverview();
      setShowResetConfirm(null);
      setEditingSlug(null);
      toast({ title: "Template reset", description: "The wording has been restored to the built-in default." });
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
      setContentTab("preview");
    },
    onError: (error) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to generate preview", variant: "destructive" });
    },
  });

  const resendMutation = useMutation({
    mutationFn: async (deliveryId: string) => {
      const res = await apiRequest("POST", `/api/admin/email-deliveries/${deliveryId}/resend`);
      return res.json() as Promise<{ sent: boolean }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/email-deliveries?slug=${editingSlug}`] });
      invalidateOverview();
      toast({
        title: data.sent ? "Email sent" : "Still failing",
        description: data.sent
          ? "The email was delivered on this attempt."
          : "The send failed again. The recorded error has been updated.",
        variant: data.sent ? undefined : "destructive",
      });
    },
    onError: (error) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to resend", variant: "destructive" });
    },
  });

  const openTemplate = (template: EmailTemplate) => {
    setEditingSlug(template.slug);
    setEditSubject(template.subject);
    setEditHtmlBody(template.htmlBody);
    setEditIsActive(template.isActive);
    setSettingsDraft(template.settings);
    setPreviewHtml(null);
    setActiveTab("content");
    setContentTab("editor");
  };

  const getVariables = (template: EmailTemplate): string[] => {
    try {
      return JSON.parse(template.availableVariables);
    } catch {
      return [];
    }
  };

  const filtered = useMemo(() => {
    if (!templates) return [];
    const needle = search.trim().toLowerCase();
    if (!needle) return templates;
    return templates.filter((template) =>
      [template.name, template.slug, template.description ?? "", template.triggerDescription]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [templates, search]);

  if (isLoading) return <AdminLayout><LoadingScreen message="Loading email settings..." /></AdminLayout>;

  if (editingTemplate) {
    const draft = settingsDraft ?? editingTemplate.settings;
    const isScheduled = editingTemplate.trigger === "scheduled";
    const setDraft = (patch: Partial<EmailSettings>) =>
      setSettingsDraft({ ...(draft as EmailSettings), ...patch });
    const setConfig = (key: string, value: number | boolean) =>
      setDraft({ config: { ...(draft?.config ?? {}), [key]: value } });

    return (
      <AdminLayout>
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold" data-testid="text-page-title">{editingTemplate.name}</h1>
                <Badge variant="outline" className="gap-1">
                  {isScheduled ? <Clock className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                  {isScheduled ? "Scheduled" : "Event"}
                </Badge>
              </div>
              <p className="text-muted-foreground">{editingTemplate.triggerDescription}</p>
            </div>
            <Button variant="outline" onClick={() => setEditingSlug(null)} data-testid="button-back">
              Back to all emails
            </Button>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="content" data-testid="tab-content">
                <Code className="h-4 w-4 mr-1" />
                Content
              </TabsTrigger>
              <TabsTrigger value="behaviour" data-testid="tab-behaviour">
                <SlidersHorizontal className="h-4 w-4 mr-1" />
                Behaviour
              </TabsTrigger>
              <TabsTrigger value="deliveries" data-testid="tab-deliveries">
                <Send className="h-4 w-4 mr-1" />
                Deliveries
              </TabsTrigger>
            </TabsList>

            {/* ---------------- Content: the wording ---------------- */}
            <TabsContent value="content" className="space-y-4">
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
                    <Label>Subject line</Label>
                    <Input
                      value={editSubject}
                      onChange={(e) => setEditSubject(e.target.value)}
                      placeholder="Email subject..."
                      disabled={!canUpdate}
                      data-testid="input-subject"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <Switch
                      checked={editIsActive}
                      onCheckedChange={setEditIsActive}
                      disabled={!canUpdate}
                      data-testid="switch-active"
                    />
                    <Label>Use this wording</Label>
                    {!editIsActive && (
                      <span className="text-xs text-muted-foreground">
                        Turned off, the email still sends — on the built-in default wording. To stop
                        sending it at all, use Behaviour.
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <Tabs value={contentTab} onValueChange={setContentTab}>
                    <div className="flex items-center justify-between mb-4">
                      <TabsList>
                        <TabsTrigger value="editor" data-testid="tab-editor">
                          <Code className="h-4 w-4 mr-1" />
                          HTML
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
                        {canUpdate && (
                          <Button variant="outline" size="sm" onClick={() => setShowResetConfirm(editingTemplate.id)} data-testid="button-reset">
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Reset to default
                          </Button>
                        )}
                        {canUpdate && (
                          <Button
                            size="sm"
                            onClick={() => updateMutation.mutate({ id: editingTemplate.id, subject: editSubject, htmlBody: editHtmlBody, isActive: editIsActive })}
                            disabled={updateMutation.isPending}
                            data-testid="button-save"
                          >
                            {updateMutation.isPending ? <LoadingSpinner size="sm" className="mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                            Save wording
                          </Button>
                        )}
                      </div>
                    </div>

                    <TabsContent value="editor" className="mt-0">
                      <textarea
                        value={editHtmlBody}
                        onChange={(e) => setEditHtmlBody(e.target.value)}
                        className="w-full h-[560px] font-mono text-sm p-4 border rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                        disabled={!canUpdate}
                        readOnly={!canUpdate}
                        spellCheck={false}
                        data-testid="textarea-html-body"
                      />
                    </TabsContent>

                    <TabsContent value="preview" className="mt-0">
                      {previewHtml ? (
                        <div className="border rounded-md bg-white">
                          <iframe
                            srcDoc={previewHtml}
                            className="w-full h-[560px] rounded-md"
                            title="Email preview"
                            sandbox="allow-same-origin"
                            data-testid="iframe-preview"
                          />
                        </div>
                      ) : (
                        <div className="border rounded-md h-[560px] flex items-center justify-center text-muted-foreground">
                          <div className="text-center">
                            <Eye className="h-12 w-12 mx-auto mb-3 opacity-30" />
                            <p>Press Preview to see how this email will look.</p>
                          </div>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ---------------- Behaviour: when and how hard ---------------- */}
            <TabsContent value="behaviour" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Sending</CardTitle>
                  <CardDescription>{editingTemplate.triggerDescription}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={draft?.enabled ?? true}
                      onCheckedChange={(enabled) => setDraft({ enabled })}
                      disabled={!canUpdate}
                      data-testid="switch-enabled"
                    />
                    <div>
                      <Label>Send this email</Label>
                      <p className="text-xs text-muted-foreground">
                        Turned off, nothing is sent. Each suppressed email is still recorded under
                        Deliveries, so it is clear why a recipient heard nothing.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="max-attempts">Delivery attempts</Label>
                      <Input
                        id="max-attempts"
                        type="number"
                        min={1}
                        max={10}
                        value={draft?.maxAttempts ?? 3}
                        onChange={(e) => setDraft({ maxAttempts: Number(e.target.value) })}
                        disabled={!canUpdate}
                        data-testid="input-max-attempts"
                      />
                      <p className="text-xs text-muted-foreground">
                        Total tries before the email is abandoned and left for a person. Set 1 for
                        anything time-critical, like a login code.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="retry-backoff">Wait before retrying</Label>
                      <Input
                        id="retry-backoff"
                        type="number"
                        min={30}
                        max={86400}
                        value={draft?.retryBackoffSeconds ?? 300}
                        onChange={(e) => setDraft({ retryBackoffSeconds: Number(e.target.value) })}
                        disabled={!canUpdate}
                        data-testid="input-retry-backoff"
                      />
                      <p className="text-xs text-muted-foreground">
                        Seconds before the second attempt. Each further attempt waits twice as long,
                        up to six hours.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {isScheduled ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Schedule</CardTitle>
                    <CardDescription>How often the job that produces this email runs.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={draft?.scheduleEnabled ?? true}
                        onCheckedChange={(scheduleEnabled) => setDraft({ scheduleEnabled })}
                        disabled={!canUpdate}
                        data-testid="switch-schedule-enabled"
                      />
                      <Label>Run on a schedule</Label>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="interval-minutes">Run every</Label>
                        <Input
                          id="interval-minutes"
                          type="number"
                          min={1}
                          max={10080}
                          value={draft?.intervalMinutes ?? 60}
                          onChange={(e) => setDraft({ intervalMinutes: Number(e.target.value) })}
                          disabled={!canUpdate}
                          data-testid="input-interval-minutes"
                        />
                        <p className="text-xs text-muted-foreground">
                          Minutes between sweeps. Takes effect immediately — the running scheduler is
                          re-armed on save, with no deploy.
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={draft?.sendHourUtc !== null && draft?.sendHourUtc !== undefined}
                            onCheckedChange={(pinned) => setDraft({ sendHourUtc: pinned ? 6 : null })}
                            disabled={!canUpdate}
                            data-testid="switch-pin-hour"
                          />
                          <Label htmlFor="send-hour">Pin to an hour (UTC)</Label>
                        </div>
                        <Input
                          id="send-hour"
                          type="number"
                          min={0}
                          max={23}
                          value={draft?.sendHourUtc ?? ""}
                          onChange={(e) => setDraft({ sendHourUtc: e.target.value === "" ? null : Number(e.target.value) })}
                          disabled={!canUpdate || draft?.sendHourUtc === null || draft?.sendHourUtc === undefined}
                          data-testid="input-send-hour"
                        />
                        <p className="text-xs text-muted-foreground">
                          Unpinned, it sends every interval counting from the last server restart —
                          which is how a daily digest ends up arriving at 3am after a deploy. Pinned,
                          it sends once a day inside the hour you choose.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="flex items-start gap-3 pt-6 text-sm text-muted-foreground">
                    <Zap className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      There is no schedule to set: this email is sent the moment the event above
                      happens. Attempts and retry timing still apply.
                    </p>
                  </CardContent>
                </Card>
              )}

              {editingTemplate.configFields.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Logic</CardTitle>
                    <CardDescription>Settings specific to this email.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    {editingTemplate.configFields.map((field) => (
                      <div key={field.key} className="space-y-1.5">
                        <Label htmlFor={`config-${field.key}`}>{field.label}</Label>
                        {field.type === "boolean" ? (
                          <div className="flex items-center gap-3 pt-1">
                            <Switch
                              id={`config-${field.key}`}
                              checked={Boolean(draft?.config?.[field.key])}
                              onCheckedChange={(value) => setConfig(field.key, value)}
                              disabled={!canUpdate}
                              data-testid={`switch-config-${field.key}`}
                            />
                            <span className="text-xs text-muted-foreground">{field.help}</span>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <Input
                                id={`config-${field.key}`}
                                type="number"
                                min={field.min}
                                max={field.max}
                                value={Number(draft?.config?.[field.key] ?? 0)}
                                onChange={(e) => setConfig(field.key, Number(e.target.value))}
                                disabled={!canUpdate}
                                data-testid={`input-config-${field.key}`}
                              />
                              {field.unit && (
                                <span className="whitespace-nowrap text-xs text-muted-foreground">{field.unit}</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{field.help}</p>
                          </>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {canUpdate && (
                <div className="flex justify-end">
                  <Button
                    onClick={() =>
                      settingsMutation.mutate({
                        slug: editingTemplate.slug,
                        settings: {
                          enabled: draft?.enabled ?? true,
                          maxAttempts: draft?.maxAttempts ?? 3,
                          retryBackoffSeconds: draft?.retryBackoffSeconds ?? 300,
                          ...(isScheduled
                            ? {
                                scheduleEnabled: draft?.scheduleEnabled ?? true,
                                intervalMinutes: draft?.intervalMinutes ?? 60,
                                sendHourUtc: draft?.sendHourUtc ?? null,
                              }
                            : {}),
                          config: draft?.config ?? {},
                        },
                      })
                    }
                    disabled={settingsMutation.isPending}
                    data-testid="button-save-settings"
                  >
                    {settingsMutation.isPending ? <LoadingSpinner size="sm" className="mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                    Save settings
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* ---------------- Deliveries: what actually happened ---------------- */}
            <TabsContent value="deliveries" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Recent deliveries</CardTitle>
                  <CardDescription>
                    Every attempt at this email, newest first. A failure is retried automatically
                    until the attempts above run out.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!deliveries?.length ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      <Send className="mx-auto mb-3 h-10 w-10 opacity-30" />
                      <p>Nothing sent yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {deliveries.map((delivery) => (
                        <div
                          key={delivery.id}
                          className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3"
                          data-testid={`row-delivery-${delivery.id}`}
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge className={statusTone(delivery.status)}>{delivery.status}</Badge>
                              <span className="truncate font-mono text-xs">{delivery.recipient}</span>
                            </div>
                            <p className="truncate text-sm">{delivery.subject}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(delivery.createdAt), "MMM d, yyyy HH:mm")}
                              {" · "}
                              {delivery.attempts} of {delivery.maxAttempts} attempt{delivery.maxAttempts === 1 ? "" : "s"}
                              {delivery.nextAttemptAt
                                ? ` · next try ${format(new Date(delivery.nextAttemptAt), "HH:mm")}`
                                : ""}
                            </p>
                            {delivery.lastError && (
                              <p className="flex items-start gap-1 text-xs text-destructive">
                                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                <span className="break-all">{delivery.lastError}</span>
                              </p>
                            )}
                          </div>
                          {canUpdate && delivery.status !== "sent" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => resendMutation.mutate(delivery.id)}
                              disabled={resendMutation.isPending}
                              data-testid={`button-resend-${delivery.id}`}
                            >
                              <Send className="mr-1 h-3 w-3" />
                              Resend
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {canUpdate && (
          <Dialog open={!!showResetConfirm} onOpenChange={() => setShowResetConfirm(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reset wording to default</DialogTitle>
                <DialogDescription>
                  This replaces the subject and HTML body with the original built-in version. Settings
                  are not affected. This cannot be undone.
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
                  {resetMutation.isPending ? "Resetting..." : "Reset to default"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Email Settings</h1>
            <p className="text-muted-foreground">
              Every email the system sends: its wording, when it goes out, how hard delivery is
              retried, and whether it arrived.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search emails..."
              className="pl-8"
              data-testid="input-search"
            />
          </div>
        </div>

        {AUDIENCE_SECTIONS.map((section) => {
          const sectionTemplates = filtered.filter((template) => template.audience === section.key);
          if (sectionTemplates.length === 0) return null;

          return (
            <div key={section.key} className="space-y-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                  {section.label}
                </h2>
                <p className="text-xs text-muted-foreground">{section.blurb}</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {sectionTemplates.map((template) => {
                  const settings = template.settings;
                  const sending = settings?.enabled ?? true;
                  const failing = template.deliveries.failed + template.deliveries.abandoned;

                  return (
                    <Card key={template.id} className="flex flex-col" data-testid={`card-template-${template.slug}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Mail className="h-5 w-5 text-primary" />
                            <CardTitle className="text-base">{template.name}</CardTitle>
                          </div>
                          {sending ? (
                            <Badge className="gap-1 bg-green-600" data-testid={`badge-sending-${template.slug}`}>
                              <CheckCircle2 className="h-3 w-3" />On
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1" data-testid={`badge-off-${template.slug}`}>
                              <XCircle className="h-3 w-3" />Off
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="mt-1 text-xs">{template.triggerDescription}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-1 flex-col justify-between">
                        <div className="mb-4 space-y-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="gap-1 text-xs">
                              {template.trigger === "scheduled" ? <Clock className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                              {template.trigger === "scheduled"
                                ? settings?.intervalMinutes
                                  ? `Every ${settings.intervalMinutes} min`
                                  : "Scheduled"
                                : "On event"}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {settings?.maxAttempts ?? 3} attempt{(settings?.maxAttempts ?? 3) === 1 ? "" : "s"}
                            </Badge>
                            {template.deliveries.sent > 0 && (
                              <Badge variant="outline" className="text-xs">{template.deliveries.sent} sent</Badge>
                            )}
                            {failing > 0 && (
                              <Badge className="gap-1 bg-destructive text-xs text-destructive-foreground">
                                <AlertTriangle className="h-3 w-3" />
                                {failing} failing
                              </Badge>
                            )}
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">Subject:</span>
                            <p className="truncate font-mono text-sm" title={template.subject}>{template.subject}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {template.deliveries.lastAt
                              ? `Last sent ${format(new Date(template.deliveries.lastAt), "MMM d, yyyy HH:mm")}`
                              : "Never sent"}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => openTemplate(template)}
                          data-testid={`button-edit-${template.slug}`}
                        >
                          {canUpdate ? "Configure" : "View"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}

        {!filtered.length && (
          <div className="py-12 text-center text-muted-foreground">
            <Mail className="mx-auto mb-3 h-12 w-12 opacity-30" />
            <p>{search ? "No emails match that search." : "No email templates found. They are created automatically on server start."}</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
