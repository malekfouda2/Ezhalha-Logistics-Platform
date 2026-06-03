import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { LoadingScreen } from "@/components/loading-spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  Bot,
  Check,
  CheckCircle2,
  CreditCard,
  Database,
  Globe2,
  KeyRound,
  Layers3,
  PackageCheck,
  Plus,
  PlugZap,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Truck,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

type IntegrationCategory = "shipping" | "payment" | "ai" | "accounting" | "notifications" | "storage";

type FieldDefinition = {
  key: string;
  label: string;
  required?: boolean;
  secret?: boolean;
  placeholder?: string;
  helpText?: string;
};

type IntegrationAccount = {
  id: string;
  appKey: string;
  appName: string;
  category: IntegrationCategory;
  accountName: string;
  environment: "sandbox" | "production";
  countryCode: string | null;
  region: string | null;
  priority: number;
  isActive: boolean;
  isDefault: boolean;
  credentials: Record<string, string>;
  settings: Record<string, string>;
  capabilities: string[];
  source?: "database" | "environment";
  lastTestedAt: string | null;
  lastTestSuccess: boolean | null;
  lastTestMessage: string | null;
};

type IntegrationApp = {
  key: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  credentialFields: FieldDefinition[];
  settingsFields?: FieldDefinition[];
  capabilities: string[];
  docsSummary: string;
  configured: boolean;
  accountCount: number;
  activeAccountCount: number;
  accounts: IntegrationAccount[];
};

type AppsResponse = {
  categories: Array<{ key: string; label: string }>;
  apps: IntegrationApp[];
};

const categoryIcons: Record<string, typeof Truck> = {
  shipping: Truck,
  payment: CreditCard,
  ai: Bot,
  accounting: Database,
  notifications: Settings2,
  storage: PackageCheck,
};

const appAccent: Record<string, string> = {
  fedex: "from-violet-700 to-orange-500",
  dhl: "from-yellow-300 to-red-500",
  aramex: "from-orange-600 to-red-700",
  tap: "from-sky-500 to-blue-700",
  gemini: "from-blue-500 to-emerald-400",
  zoho: "from-red-600 to-blue-600",
};

function formatDate(value: string | null) {
  if (!value) return "Not tested";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function accountStatus(account: IntegrationAccount) {
  if (!account.isActive) {
    return {
      label: "Inactive",
      className: "border-muted-foreground/30 bg-muted text-muted-foreground",
      icon: XCircle,
    };
  }
  if (account.lastTestSuccess === false) {
    return {
      label: "Needs attention",
      className: "border-red-500/30 bg-red-500/10 text-red-500",
      icon: XCircle,
    };
  }
  if (account.lastTestSuccess === true) {
    return {
      label: "Validated",
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
      icon: CheckCircle2,
    };
  }
  return {
    label: "Ready to test",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-500",
    icon: ShieldCheck,
  };
}

function appStatus(app: IntegrationApp) {
  const activeAccounts = app.accounts.filter((account) => account.isActive);
  if (activeAccounts.some((account) => account.lastTestSuccess === false)) {
    return {
      label: "Needs attention",
      className: "border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/10",
    };
  }
  if (activeAccounts.length > 0) {
    return {
      label: "Active",
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/10",
    };
  }
  return {
    label: "Setup needed",
    className: "border-muted-foreground/30 bg-muted text-muted-foreground hover:bg-muted",
  };
}

function emptyForm(app: IntegrationApp) {
  const credentials = Object.fromEntries(app.credentialFields.map((field) => [field.key, ""]));
  const settings = Object.fromEntries((app.settingsFields || []).map((field) => [field.key, ""]));

  return {
    id: undefined as string | undefined,
    accountName: "",
    environment: "sandbox" as "sandbox" | "production",
    countryCode: "",
    region: "",
    priority: 100,
    isActive: true,
    isDefault: false,
    credentials,
    settings,
  };
}

export default function AdminApps() {
  const { toast } = useToast();
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedAppKey, setSelectedAppKey] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<IntegrationAccount | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState<ReturnType<typeof emptyForm> | null>(null);

  const { data, isLoading } = useQuery<AppsResponse>({
    queryKey: ["/api/admin/apps"],
  });

  const apps = data?.apps || [];
  const selectedApp = apps.find((app) => app.key === selectedAppKey) || apps[0] || null;
  const totalAccounts = apps.reduce(
    (sum, app) => sum + app.accounts.filter((account) => account.source !== "environment").length,
    0,
  );
  const activeAccounts = apps.reduce((sum, app) => sum + app.activeAccountCount, 0);
  const configuredApps = apps.filter((app) => app.configured).length;

  const filteredApps = useMemo(() => {
    const query = search.trim().toLowerCase();
    return apps.filter((app) => {
      const matchesCategory = category === "all" || app.category === category;
      const matchesSearch =
        !query ||
        app.name.toLowerCase().includes(query) ||
        app.description.toLowerCase().includes(query) ||
        app.capabilities.some((capability) => capability.toLowerCase().includes(query));
      return matchesCategory && matchesSearch;
    });
  }, [apps, category, search]);

  useEffect(() => {
    if (filteredApps.length > 0 && !filteredApps.some((app) => app.key === selectedAppKey)) {
      setSelectedAppKey(filteredApps[0].key);
    }
  }, [filteredApps, selectedAppKey]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedApp || !formState) throw new Error("No app selected");
      const payload = {
        appKey: selectedApp.key,
        accountName: formState.accountName,
        environment: formState.environment,
        countryCode: formState.countryCode || null,
        region: formState.region || null,
        priority: formState.priority,
        isActive: formState.isActive,
        isDefault: formState.isDefault,
        credentials: formState.credentials,
        settings: formState.settings,
      };

      const res = formState.id
        ? await apiRequest("PATCH", `/api/admin/apps/accounts/${formState.id}`, payload)
        : await apiRequest("POST", "/api/admin/apps/accounts", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/apps"] });
      setFormOpen(false);
      setEditingAccount(null);
      toast({ title: "Integration account saved", description: "The app configuration has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save account", description: error.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await apiRequest("POST", `/api/admin/apps/accounts/${accountId}/test`);
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/apps"] });
      toast({
        title: result.success ? "Account looks ready" : "Account needs attention",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Test failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/apps/accounts/${accountId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/apps"] });
      toast({ title: "Integration account deleted", description: "The managed account has been removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete account", description: error.message, variant: "destructive" });
    },
  });

  const openCreateForm = (app: IntegrationApp) => {
    setSelectedAppKey(app.key);
    setEditingAccount(null);
    setFormState(emptyForm(app));
    setFormOpen(true);
  };

  const openEditForm = (app: IntegrationApp, account: IntegrationAccount) => {
    if (account.source === "environment") {
      setEditingAccount(null);
      setFormState({
        ...emptyForm(app),
        accountName: `${app.name} managed account`,
        environment: account.environment,
        countryCode: account.countryCode || "",
        region: account.region || "",
        priority: account.priority,
        isActive: account.isActive,
        isDefault: true,
        credentials: Object.fromEntries(app.credentialFields.map((field) => [field.key, ""])),
        settings: Object.fromEntries((app.settingsFields || []).map((field) => [field.key, account.settings?.[field.key] || ""])),
      });
    } else {
      setEditingAccount(account);
      setFormState({
        id: account.id,
        accountName: account.accountName,
        environment: account.environment,
        countryCode: account.countryCode || "",
        region: account.region || "",
        priority: account.priority,
        isActive: account.isActive,
        isDefault: account.isDefault,
        credentials: Object.fromEntries(app.credentialFields.map((field) => [field.key, account.credentials?.[field.key] || ""])),
        settings: Object.fromEntries((app.settingsFields || []).map((field) => [field.key, account.settings?.[field.key] || ""])),
      });
    }
    setSelectedAppKey(app.key);
    setFormOpen(true);
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <LoadingScreen message="Loading apps..." />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(255,81,28,0.12),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:p-6 xl:flex-row">
          <main className="min-w-0 flex-1 space-y-6">
            <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
              <div className="relative p-6 sm:p-8">
                <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
                <div className="relative flex flex-wrap items-start justify-between gap-5">
                  <div className="max-w-2xl">
                    <Badge variant="outline" className="mb-3 gap-1.5 rounded-full bg-background/70">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Integration Control Center
                    </Badge>
                    <h1 className="text-3xl font-bold tracking-tight">Apps</h1>
                    <p className="mt-2 text-muted-foreground">
                      Manage carrier, payment, AI, accounting, and platform integrations with country-aware accounts.
                    </p>
                  </div>
                  {selectedApp && (
                    <Button onClick={() => openCreateForm(selectedApp)} data-testid="button-add-app-account">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Account
                    </Button>
                  )}
                </div>

                <div className="relative mt-7 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border bg-background/70 p-4">
                    <p className="text-sm text-muted-foreground">Configured Apps</p>
                    <div className="mt-2 flex items-end justify-between">
                      <p className="text-2xl font-bold">{configuredApps}</p>
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-background/70 p-4">
                    <p className="text-sm text-muted-foreground">Managed Accounts</p>
                    <div className="mt-2 flex items-end justify-between">
                      <p className="text-2xl font-bold">{totalAccounts}</p>
                      <Layers3 className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-background/70 p-4">
                    <p className="text-sm text-muted-foreground">Active Accounts</p>
                    <div className="mt-2 flex items-end justify-between">
                      <p className="text-2xl font-bold">{activeAccounts}</p>
                      <Globe2 className="h-5 w-5 text-sky-500" />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border bg-card p-4 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  {(data?.categories || []).map((item) => (
                    <Button
                      key={item.key}
                      variant={category === item.key ? "default" : "outline"}
                      size="sm"
                      className="rounded-full"
                      onClick={() => setCategory(item.key)}
                      data-testid={`filter-app-category-${item.key}`}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
                <div className="relative w-full lg:w-80">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search apps, capabilities..."
                    className="pl-9"
                    data-testid="input-search-apps"
                  />
                </div>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {filteredApps.map((app) => {
                const Icon = categoryIcons[app.category] || Settings2;
                const isSelected = selectedApp?.key === app.key;
                const status = appStatus(app);
                return (
                  <Card
                    key={app.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedAppKey(app.key)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedAppKey(app.key);
                      }
                    }}
                    className={cn(
                      "group cursor-pointer overflow-hidden border bg-card transition hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg",
                      isSelected && "border-primary/70 shadow-lg ring-2 ring-primary/20",
                    )}
                    data-testid={`card-app-${app.key}`}
                  >
                    <CardContent className="p-0">
                      <div className={cn("h-1.5 bg-gradient-to-r", appAccent[app.key] || "from-slate-600 to-slate-900")} />
                      <div className="p-5">
                        <div className="mb-5 flex items-start justify-between gap-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-sm", appAccent[app.key] || "from-slate-600 to-slate-900")}>
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="truncate font-semibold">{app.name}</h3>
                              <p className="text-xs capitalize text-muted-foreground">{app.category}</p>
                            </div>
                          </div>
                          <Badge className={cn("shrink-0", status.className)} variant="outline">
                            {status.label}
                          </Badge>
                        </div>
                        <p className="min-h-[44px] text-sm leading-6 text-muted-foreground">{app.description}</p>
                        <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
                          <div className="rounded-xl bg-muted/50 p-3">
                            <p className="text-xs text-muted-foreground">Accounts</p>
                            <p className="mt-1 font-semibold">{app.accountCount}</p>
                          </div>
                          <div className="rounded-xl bg-muted/50 p-3">
                            <p className="text-xs text-muted-foreground">Active</p>
                            <p className="mt-1 font-semibold">{app.activeAccountCount}</p>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          {app.capabilities.slice(0, 4).map((capability) => (
                            <Badge key={capability} variant="outline" className="rounded-full text-xs">
                              {capability}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {filteredApps.length === 0 && (
                <div className="col-span-full rounded-3xl border border-dashed bg-card p-10 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                    <Search className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="mt-4 font-semibold">No apps found</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Try a different category or search term.
                  </p>
                </div>
              )}
            </section>
          </main>

          {selectedApp && (
            <aside className="w-full shrink-0 xl:w-[440px]">
              <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-hidden rounded-3xl border bg-card shadow-sm">
                <div className="border-b p-5">
                  <div className="flex items-start gap-4">
                    <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-sm", appAccent[selectedApp.key] || "from-slate-600 to-slate-900")}>
                      {(() => {
                        const Icon = categoryIcons[selectedApp.category] || Settings2;
                        return <Icon className="h-6 w-6" />;
                      })()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="font-semibold">{selectedApp.name}</h2>
                        <Badge variant="outline" className="capitalize">{selectedApp.category}</Badge>
                      </div>
                      <p className="mt-1 text-sm leading-5 text-muted-foreground">{selectedApp.docsSummary}</p>
                    </div>
                  </div>
                  <Button className="mt-5 w-full" onClick={() => openCreateForm(selectedApp)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add {selectedApp.name} Account
                  </Button>
                </div>

                <div className="max-h-[calc(100vh-210px)] overflow-auto p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connected Accounts</p>
                      <p className="text-sm text-muted-foreground">{selectedApp.accounts.length} source records</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {selectedApp.accounts.length === 0 && (
                      <div className="rounded-2xl border border-dashed bg-background p-6 text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                          <PlugZap className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <h3 className="mt-4 font-semibold">No accounts yet</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Add a managed account to activate this integration for sandbox, production, or a specific country.
                        </p>
                        <Button className="mt-4" size="sm" onClick={() => openCreateForm(selectedApp)}>
                          <Plus className="mr-2 h-4 w-4" />
                          Add Account
                        </Button>
                      </div>
                    )}
                    {selectedApp.accounts.map((account) => {
                      const status = accountStatus(account);
                      const StatusIcon = status.icon;
                      return (
                        <div key={account.id} className="rounded-2xl border bg-background p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium">{account.accountName}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {[account.environment, account.countryCode || "Global", account.region].filter(Boolean).join(" / ")}
                              </p>
                            </div>
                            <Badge variant="outline" className={cn("shrink-0 gap-1", status.className)}>
                              <StatusIcon className="h-3.5 w-3.5" />
                              {status.label}
                            </Badge>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                            <div className="rounded-xl bg-muted/40 p-2.5">
                              <p className="text-muted-foreground">Source</p>
                              <p className="mt-1 font-medium capitalize">{account.source || "database"}</p>
                            </div>
                            <div className="rounded-xl bg-muted/40 p-2.5">
                              <p className="text-muted-foreground">Default</p>
                              <p className="mt-1 font-medium">{account.isDefault ? "Yes" : "No"}</p>
                            </div>
                            <div className="rounded-xl bg-muted/40 p-2.5">
                              <p className="text-muted-foreground">Last Test</p>
                              <p className="mt-1 truncate font-medium">{formatDate(account.lastTestedAt)}</p>
                            </div>
                            <div className="rounded-xl bg-muted/40 p-2.5">
                              <p className="text-muted-foreground">Priority</p>
                              <p className="mt-1 font-medium">{account.priority}</p>
                            </div>
                          </div>

                          {account.lastTestMessage && (
                            <p className="mt-3 rounded-xl bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
                              {account.lastTestMessage}
                            </p>
                          )}

                          <div className="mt-4 flex gap-2">
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => openEditForm(selectedApp, account)}>
                              {account.source === "environment" ? "Create Managed Copy" : "Edit"}
                            </Button>
                            {account.source !== "environment" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1"
                                disabled={testMutation.isPending && testMutation.variables === account.id}
                                onClick={() => testMutation.mutate(account.id)}
                              >
                                {testMutation.isPending && testMutation.variables === account.id ? (
                                  <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="mr-2 h-3.5 w-3.5" />
                                )}
                                Test
                              </Button>
                            )}
                            {account.source !== "environment" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={deleteMutation.isPending && deleteMutation.variables === account.id}
                                onClick={() => {
                                  if (window.confirm(`Delete ${account.accountName}?`)) {
                                    deleteMutation.mutate(account.id);
                                  }
                                }}
                                aria-label={`Delete ${account.accountName}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle>{editingAccount ? "Edit Account" : "Add Integration Account"}</SheetTitle>
              <Button variant="ghost" size="icon" onClick={() => setFormOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>

          {selectedApp && formState && (
            <div className="mt-6 space-y-6">
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="flex items-center gap-2 font-medium">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  {selectedApp.name}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{selectedApp.docsSummary}</p>
                {selectedApp.key === "object-storage" && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    Storage routing is selected while the server starts. Restart the application after changing this account.
                  </p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Account Name</Label>
                  <Input
                    value={formState.accountName}
                    onChange={(event) => setFormState({ ...formState, accountName: event.target.value })}
                    placeholder="Saudi Arabia production account"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Environment</Label>
                  <Select
                    value={formState.environment}
                    onValueChange={(value: "sandbox" | "production") => setFormState({ ...formState, environment: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sandbox">Sandbox</SelectItem>
                      <SelectItem value="production">Production</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Country Code</Label>
                  <Input
                    value={formState.countryCode}
                    onChange={(event) => setFormState({ ...formState, countryCode: event.target.value.toUpperCase().slice(0, 2) })}
                    placeholder="SA"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Region / Branch Label</Label>
                  <Input
                    value={formState.region}
                    onChange={(event) => setFormState({ ...formState, region: event.target.value })}
                    placeholder="Riyadh, Jeddah, UAE, Global..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Input
                    type="number"
                    min={1}
                    max={9999}
                    value={formState.priority}
                    onChange={(event) => setFormState({ ...formState, priority: Number(event.target.value) || 100 })}
                  />
                  <p className="text-xs text-muted-foreground">Lower numbers are preferred when multiple accounts match.</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center gap-2 font-medium">
                  <KeyRound className="h-4 w-4" />
                  Credentials
                </div>
                {selectedApp.credentialFields.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label>
                      {field.label}
                      {field.required && <span className="text-destructive"> *</span>}
                    </Label>
                    <Input
                      type={field.secret ? "password" : "text"}
                      value={formState.credentials[field.key] || ""}
                      onChange={(event) =>
                        setFormState({
                          ...formState,
                          credentials: { ...formState.credentials, [field.key]: event.target.value },
                        })
                      }
                      placeholder={field.placeholder || field.key}
                      className={field.secret ? "font-mono" : undefined}
                    />
                    {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                  </div>
                ))}
              </div>

              {(selectedApp.settingsFields || []).length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <div className="font-medium">Settings</div>
                    {(selectedApp.settingsFields || []).map((field) => (
                      <div key={field.key} className="space-y-2">
                        <Label>{field.label}</Label>
                        {field.placeholder === "false" || field.placeholder === "true" ? (
                          <div className="flex items-center justify-between rounded-lg border p-3">
                            <p className="text-sm text-muted-foreground">Enable this setting</p>
                            <Switch
                              checked={formState.settings[field.key] === "true"}
                              onCheckedChange={(checked) =>
                                setFormState({
                                  ...formState,
                                  settings: { ...formState.settings, [field.key]: String(checked) },
                                })
                              }
                            />
                          </div>
                        ) : (
                          <Input
                            value={formState.settings[field.key] || ""}
                            onChange={(event) =>
                              setFormState({
                                ...formState,
                                settings: { ...formState.settings, [field.key]: event.target.value },
                              })
                            }
                            placeholder={field.placeholder || field.key}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">Active</p>
                    <p className="text-sm text-muted-foreground">Allow this account to be used by the system.</p>
                  </div>
                  <Switch checked={formState.isActive} onCheckedChange={(checked) => setFormState({ ...formState, isActive: checked })} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">Default Account</p>
                    <p className="text-sm text-muted-foreground">Apply this account to the current runtime after saving.</p>
                  </div>
                  <Switch checked={formState.isDefault} onCheckedChange={(checked) => setFormState({ ...formState, isDefault: checked })} />
                </div>
              </div>

              <Button
                className="w-full"
                disabled={!formState.accountName || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                data-testid="button-save-app-account"
              >
                {saveMutation.isPending ? "Saving..." : "Save Account"}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}
