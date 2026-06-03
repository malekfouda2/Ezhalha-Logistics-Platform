import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { LoadingScreen } from "@/components/loading-spinner";
import { NoShipments } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Eye,
  MapPin,
  Package,
  Calendar,
  Ban,
  Loader2,
  RefreshCw,
  Filter,
  X,
  Tag,
  AlertTriangle,
  RotateCcw,
  Download,
  ShoppingCart,
  DollarSign,
  Gift,
  Send,
  Plane,
  Ship,
  Home,
  Upload,
  CheckCircle2,
} from "lucide-react";
import { SarSymbol, SarAmount, formatSAR } from "@/components/sar-symbol";
import { useToast } from "@/hooks/use-toast";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Shipment, ShipmentItem } from "@shared/schema";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface PaginatedResponse {
  shipments: Shipment[];
  total: number;
  page: number;
  totalPages: number;
  recoveries?: AbandonedShipmentRecovery[];
  metrics?: {
    statusCounts: Record<string, number>;
    lostRevenue: number;
    recoveryRate: number;
    discountsSent: number;
  };
}

interface AdminShipmentsProps {
  abandonedOnly?: boolean;
}

type AbandonedStatus = "not_contacted" | "discount_sent" | "expired" | "recovered";
type DiscountType = "percent" | "fixed";

interface AbandonedShipmentRecovery {
  id: string;
  shipmentId: string;
  clientAccountId: string;
  status: "not_contacted" | "discount_sent" | "expired" | "reminder_sent" | "dismissed" | "recovered";
  lastAction: string | null;
  discountType: string | null;
  discountValue: string | null;
  discountAmount: string | null;
  discountFinalPrice: string | null;
  discountChannel: string | null;
  discountExpiresAt: string | null;
  discountMessage: string | null;
  discountSentAt: string | null;
  reminderChannel: string | null;
  reminderCount: number;
  reminderSentAt: string | null;
  dismissedAt: string | null;
  recoveredAt: string | null;
}

interface ClientDirectoryEntry {
  id: string;
  accountNumber?: string | null;
  name: string;
  email: string;
  phone: string;
}

function formatPackageWord(count: number) {
  return `${count} package${count === 1 ? "" : "s"}`;
}

function formatChargeablePackageCounts(packages: any[]) {
  const dimensionalPackages = packages.filter((pkg) => pkg?.usesDimensionalWeight).length;
  const actualPackages = Math.max(packages.length - dimensionalPackages, 0);

  return `${formatPackageWord(actualPackages)} charged by actual weight. ${formatPackageWord(dimensionalPackages)} charged by dimensional weight.`;
}

function hasAccountingSnapshot(shipment: Shipment) {
  return Boolean(shipment.taxScenario && shipment.accountingCurrency === "SAR");
}

function formatTaxScenarioLabel(shipment: Shipment) {
  if (shipment.taxScenario === "DDP") return "DDP Import";
  if (shipment.taxScenario === "DCE") return "DCE Domestic";
  if (shipment.taxScenario === "IMPORT") return "Import";
  if (shipment.taxScenario === "EXPORT") return "Export";
  return "Unclassified";
}

function getAccountingNote(shipment: Shipment) {
  if (shipment.taxScenario === "DCE") {
    return "Sell tax is added to the client total. Cost tax is system-only and is not billed to the client.";
  }

  if (shipment.taxScenario === "DDP") {
    return "Sell tax is embedded inside the shipment sell amount and is shown here for accounting visibility.";
  }

  if (shipment.taxScenario === "IMPORT" || shipment.taxScenario === "EXPORT") {
    return "Sell tax is embedded inside the shipment amount and is tracked separately for accounting.";
  }

  return "This shipment was created before the accounting snapshot was introduced.";
}

function canCancelShipment(shipment: Shipment) {
  const carrierStatus = String((shipment as any).carrierStatus || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const pickedUpOrLaterStatuses = ["picked_up", "in_transit", "out_for_delivery", "delivered", "cancelled"];

  return (
    ["created", "processing", "carrier_error", "payment_pending"].includes(shipment.status) &&
    !pickedUpOrLaterStatuses.includes(carrierStatus)
  );
}

function getShipmentClient(shipment: Shipment, clients: ClientDirectoryEntry[]) {
  return clients.find((client) => client.id === shipment.clientAccountId);
}

function getClientDisplayName(shipment: Shipment, clients: ClientDirectoryEntry[]) {
  return getShipmentClient(shipment, clients)?.name || shipment.recipientName || shipment.senderName || "Unknown Client";
}

function getClientPhone(shipment: Shipment, clients: ClientDirectoryEntry[]) {
  return getShipmentClient(shipment, clients)?.phone || shipment.recipientPhone || shipment.senderPhone || "-";
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.slice(0, 2) || "CL").toUpperCase();
}

function getAbandonedStatus(shipment: Shipment, recovery?: AbandonedShipmentRecovery): AbandonedStatus {
  if (shipment.paymentStatus === "paid") return "recovered";
  if (recovery?.status === "discount_sent") return "discount_sent";
  if (recovery?.status === "expired") return "expired";
  if (recovery?.status === "recovered") return "recovered";
  return "not_contacted";
}

function getShipmentMethod(shipment: Shipment) {
  const service = `${shipment.serviceType || ""} ${(shipment as any).serviceName || ""}`.toLowerCase();
  const shipmentType = String((shipment as any).shipmentType || "").toLowerCase();
  const senderCountry = String(shipment.senderCountry || "").toLowerCase();
  const recipientCountry = String(shipment.recipientCountry || "").toLowerCase();

  if (shipmentType === "domestic" || senderCountry === recipientCountry) return "domestic";
  if (service.includes("sea") || service.includes("ocean")) return "sea";
  if (shipmentType === "inbound") return "express_import";
  if (shipmentType === "outbound") return "express_export";
  return "air";
}

function getMethodMeta(method: string) {
  const meta = {
    air: { label: "Air freight", icon: Plane, className: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
    sea: { label: "Sea freight", icon: Ship, className: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300" },
    domestic: { label: "Domestic", icon: Home, className: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" },
    express_import: { label: "Express import", icon: Download, className: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300" },
    express_export: { label: "Express export", icon: Upload, className: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
  } as const;

  return meta[method as keyof typeof meta] || meta.air;
}

function getOriginFilter(shipment: Shipment) {
  const country = String(shipment.senderCountry || "").toLowerCase();
  if (country.includes("china") || country === "cn") return "cn";
  if (country.includes("emirates") || country.includes("uae") || country === "ae") return "uae";
  if (country.includes("saudi") || country === "sa") return "sa";
  return "other";
}

function getCountryFlag(country: string | null | undefined) {
  const normalized = String(country || "").toLowerCase();
  if (normalized.includes("china") || normalized === "cn") return "CN";
  if (normalized.includes("emirates") || normalized.includes("uae") || normalized === "ae") return "AE";
  if (normalized.includes("saudi") || normalized === "sa") return "SA";
  if (normalized.includes("united states") || normalized === "us") return "US";
  return normalized.slice(0, 2).toUpperCase() || "--";
}

function formatAbandonedAge(dateValue: string | Date) {
  const createdAt = new Date(dateValue);
  const diffMs = Date.now() - createdAt.getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hrs ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function getAgeBadgeClass(ageText: string) {
  if (ageText.includes("min")) return "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300";
  if (ageText.includes("hrs")) return "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300";
  return "bg-muted text-muted-foreground";
}

function getStatusBadgeClass(status: AbandonedStatus) {
  if (status === "discount_sent") return "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300";
  if (status === "expired") return "bg-slate-200 text-slate-700 dark:bg-slate-900 dark:text-slate-300";
  if (status === "recovered") return "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300";
  return "bg-muted text-muted-foreground";
}

export default function AdminShipments({ abandonedOnly = false }: AdminShipmentsProps = {}) {
  const adminAccess = useAdminAccess();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [abandonedTab, setAbandonedTab] = useState<"all" | AbandonedStatus>("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState("all");
  const [abandonedStatusFilter, setAbandonedStatusFilter] = useState("all");
  const [discountShipment, setDiscountShipment] = useState<Shipment | null>(null);
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const [discountExpiry, setDiscountExpiry] = useState("24 hours");
  const [discountChannel, setDiscountChannel] = useState("WhatsApp");
  const [ddpAdjustmentDescription, setDdpAdjustmentDescription] = useState("");
  const [ddpAdjustmentAmount, setDdpAdjustmentAmount] = useState("");
  const { toast } = useToast();

  const canUpdateShipments = adminAccess.hasPermission("shipments", "update");
  const canCancelShipments = adminAccess.hasPermission("shipments", "cancel");
  const canRetryCarrier = canUpdateShipments && !adminAccess.isAccountManager;

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
    if (abandonedOnly) params.set("abandoned", "true");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter !== "all") params.set("status", statusFilter);
    return params.toString();
  };

  const { data, isLoading, isFetching, refetch } = useQuery<PaginatedResponse>({
    queryKey: ["/api/admin/shipments", page, pageSize, debouncedSearch, statusFilter, abandonedOnly],
    queryFn: async () => {
      const res = await fetch(`/api/admin/shipments?${buildQueryString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch shipments");
      return res.json();
    },
  });

  const { data: clientDirectoryData } = useQuery<{ clients: ClientDirectoryEntry[] }>({
    queryKey: ["/api/admin/clients", "abandoned-directory"],
    queryFn: async () => {
      const res = await fetch("/api/admin/clients?page=1&limit=100", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
    enabled: abandonedOnly,
  });

  const sendAbandonedDiscountMutation = useMutation({
    mutationFn: async ({ shipmentIds, payload }: {
      shipmentIds: string[];
      payload: {
        discountType: DiscountType;
        discountValue: number;
        expiresIn: string;
        channel: string;
        message?: string;
      };
    }) => {
      const responses = [];
      for (const shipmentId of shipmentIds) {
        const res = await apiRequest("POST", `/api/admin/shipments/${shipmentId}/abandoned-recovery/discount`, payload);
        responses.push(await res.json());
      }
      return responses;
    },
    onSuccess: (_responses, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shipments"] });
      setSelectedRows(new Set());
      setDiscountShipment(null);
      toast({
        title: "Discount offer recorded",
        description: `${variables.shipmentIds.length} offer${variables.shipmentIds.length === 1 ? "" : "s"} saved and queued.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to record discount", description: error.message, variant: "destructive" });
    },
  });

  const sendAbandonedReminderMutation = useMutation({
    mutationFn: async ({ shipmentIds, channel }: { shipmentIds: string[]; channel: string }) => {
      const responses = [];
      for (const shipmentId of shipmentIds) {
        const res = await apiRequest("POST", `/api/admin/shipments/${shipmentId}/abandoned-recovery/reminder`, { channel });
        responses.push(await res.json());
      }
      return responses;
    },
    onSuccess: (_responses, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shipments"] });
      setSelectedRows(new Set());
      toast({
        title: "Reminder recorded",
        description: `${variables.shipmentIds.length} reminder${variables.shipmentIds.length === 1 ? "" : "s"} saved and queued.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to record reminder", description: error.message, variant: "destructive" });
    },
  });

  const dismissAbandonedMutation = useMutation({
    mutationFn: async (shipmentIds: string[]) => {
      const responses = [];
      for (const shipmentId of shipmentIds) {
        const res = await apiRequest("POST", `/api/admin/shipments/${shipmentId}/abandoned-recovery/dismiss`, {});
        responses.push(await res.json());
      }
      return responses;
    },
    onSuccess: (_responses, shipmentIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shipments"] });
      setSelectedRows(new Set());
      toast({
        title: "Abandoned shipments dismissed",
        description: `${shipmentIds.length} record${shipmentIds.length === 1 ? "" : "s"} dismissed.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to dismiss", description: error.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/shipments/${id}/status`, { status });
      return res.json();
    },
    onSuccess: (_data: Shipment, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shipments"] });
      if (selectedShipment) {
        setSelectedShipment({ ...selectedShipment, status: variables.status as any });
      }
      toast({ title: "Status Updated", description: "Shipment status has been updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const retryCarrierMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/shipments/${id}/retry-carrier`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shipments"] });
      if (selectedShipment) {
        setSelectedShipment({ ...selectedShipment, status: data.shipment?.status || "processing", carrierStatus: data.shipment?.carrierStatus || "created", carrierErrorCode: null, carrierErrorMessage: null } as any);
      }
      toast({ title: "Carrier Retry Successful", description: "Shipment has been re-submitted to the carrier." });
    },
    onError: (error: Error) => {
      toast({ title: "Carrier Retry Failed", description: error.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/shipments/${id}/cancel`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shipments"] });
      if (selectedShipment) {
        setSelectedShipment({ ...selectedShipment, status: "cancelled" });
      }
      toast({
        title: "Shipment Cancelled",
        description: data?.refundRequest
          ? "Shipment cancelled and refund approval has been started."
          : "Shipment has been cancelled successfully.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createDdpAdjustmentMutation = useMutation({
    mutationFn: async ({ id, description, amount }: { id: string; description: string; amount: number }) => {
      const res = await apiRequest("POST", `/api/admin/ddp/shipments/${id}/charges`, { description, amount });
      return res.json();
    },
    onSuccess: () => {
      setDdpAdjustmentDescription("");
      setDdpAdjustmentAmount("");
      toast({ title: "DDP adjustment invoiced", description: "A separate payable client invoice has been created." });
    },
    onError: (error: Error) => toast({ title: "Could not add DDP adjustment", description: error.message, variant: "destructive" }),
  });

  const hasActiveFilters = statusFilter !== "all" || debouncedSearch;

  const clearFilters = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setStatusFilter("all");
    setPage(1);
  };

  if (isLoading && !data) {
    return (
      <AdminLayout>
        <LoadingScreen message="Loading shipments..." />
      </AdminLayout>
    );
  }

  const shipments = data?.shipments || [];
  const totalPages = data?.totalPages || 1;
  const total = data?.total || 0;
  const clients = clientDirectoryData?.clients || [];
  const recoveries = data?.recoveries || [];
  const recoveryByShipmentId = new Map(recoveries.map((recovery) => [recovery.shipmentId, recovery]));

  const filteredAbandonedShipments = shipments.filter((shipment) => {
    const clientName = getClientDisplayName(shipment, clients).toLowerCase();
    const clientPhone = getClientPhone(shipment, clients).toLowerCase();
    const shipmentNumber = String(shipment.trackingNumber || "").toLowerCase();
    const query = searchQuery.trim().toLowerCase();
    const method = getShipmentMethod(shipment);
    const origin = getOriginFilter(shipment);
    const rowStatus = getAbandonedStatus(shipment, recoveryByShipmentId.get(shipment.id));

    if (abandonedTab !== "all" && rowStatus !== abandonedTab) return false;
    if (query && !clientName.includes(query) && !clientPhone.includes(query) && !shipmentNumber.includes(query)) return false;
    if (methodFilter !== "all" && method !== methodFilter) return false;
    if (originFilter !== "all" && origin !== originFilter) return false;
    if (abandonedStatusFilter !== "all" && rowStatus !== abandonedStatusFilter) return false;
    return true;
  });

  const abandonedCounts = {
    all: data?.metrics?.statusCounts?.all || total,
    not_contacted: data?.metrics?.statusCounts?.not_contacted || 0,
    discount_sent: data?.metrics?.statusCounts?.discount_sent || 0,
    expired: data?.metrics?.statusCounts?.expired || 0,
    recovered: data?.metrics?.statusCounts?.recovered || 0,
  };

  const abandonedLostRevenue = data?.metrics?.lostRevenue || shipments.reduce((sum, shipment) => sum + Number(shipment.finalPrice || 0), 0);
  const abandonedRecoveredCount = abandonedCounts.recovered;
  const abandonedRecoveryRate = data?.metrics?.recoveryRate || 0;
  const selectedFilteredRows = filteredAbandonedShipments.filter((shipment) => selectedRows.has(shipment.id));
  const discountAmount = discountShipment
    ? discountType === "percent"
      ? Math.round(Number(discountShipment.finalPrice || 0) * (Number(discountValue) || 0) / 100)
      : Number(discountValue) || 0
    : 0;
  const discountFinalPrice = Math.max(0, Number(discountShipment?.finalPrice || 0) - discountAmount);

  const clearAbandonedFilters = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setMethodFilter("all");
    setOriginFilter("all");
    setAbandonedStatusFilter("all");
    setAbandonedTab("all");
    setSelectedRows(new Set());
    setPage(1);
  };

  const toggleAbandonedRow = (shipmentId: string, checked: boolean) => {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (checked) next.add(shipmentId);
      else next.delete(shipmentId);
      return next;
    });
  };

  const toggleAllAbandonedRows = (checked: boolean) => {
    setSelectedRows(checked ? new Set(filteredAbandonedShipments.map((shipment) => shipment.id)) : new Set());
  };

  const sendDiscountForShipments = (targetShipments: Shipment[]) => {
    sendAbandonedDiscountMutation.mutate({
      shipmentIds: targetShipments.map((shipment) => shipment.id),
      payload: {
        discountType,
        discountValue: Number(discountValue) || 0,
        expiresIn: discountExpiry,
        channel: discountChannel,
      },
    });
  };

  const sendReminderForShipments = (targetShipments: Shipment[]) => {
    sendAbandonedReminderMutation.mutate({
      shipmentIds: targetShipments.map((shipment) => shipment.id),
      channel: discountChannel,
    });
  };

  const dismissAbandonedShipments = (targetShipments: Shipment[]) => {
    dismissAbandonedMutation.mutate(targetShipments.map((shipment) => shipment.id));
  };

  const exportAbandonedCsv = () => {
    const rows = filteredAbandonedShipments.map((shipment) => {
      const method = getShipmentMethod(shipment);
      return {
        client: getClientDisplayName(shipment, clients),
        phone: getClientPhone(shipment, clients),
        shipmentId: shipment.trackingNumber,
        route: `${shipment.senderCountry} to ${shipment.recipientCountry}`,
        method: getMethodMeta(method).label,
        amount: Number(shipment.finalPrice || 0).toFixed(2),
        abandoned: formatAbandonedAge(shipment.createdAt),
        status: getAbandonedStatus(shipment, recoveryByShipmentId.get(shipment.id)).replace("_", " "),
      };
    });
    const header = Object.keys(rows[0] || {
      client: "",
      phone: "",
      shipmentId: "",
      route: "",
      method: "",
      amount: "",
      abandoned: "",
      status: "",
    });
    const csv = [
      header.join(","),
      ...rows.map((row) => header.map((key) => `"${String((row as any)[key] || "").replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `abandoned-shipments-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported", description: "The current abandoned shipments view has been exported." });
  };

  if (abandonedOnly) {
    const hasAbandonedFilters =
      searchQuery || methodFilter !== "all" || originFilter !== "all" || abandonedStatusFilter !== "all" || abandonedTab !== "all";

    return (
      <AdminLayout>
        <div className="min-h-screen bg-muted/30">
          <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
              <div>
                <h1 className="flex items-center gap-2 text-xl font-extrabold">
                  <ShoppingCart className="h-5 w-5 text-primary" />
                  Abandoned Shipments
                </h1>
                <p className="text-sm text-muted-foreground">Clients who viewed pricing but did not complete online payment</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={exportAbandonedCsv} data-testid="button-export-abandoned-csv">
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh">
                  <RefreshCw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} />
                  Refresh
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-6 p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card className="border-border/70 bg-background">
                <CardContent className="p-5">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <ShoppingCart className="h-4 w-4" />
                    Abandoned
                  </p>
                  <p className="mt-2 text-3xl font-extrabold text-primary">{abandonedCounts.all}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Last active checkout records</p>
                </CardContent>
              </Card>
              <Card className="border-border/70 bg-background">
                <CardContent className="p-5">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <DollarSign className="h-4 w-4" />
                    Lost revenue
                  </p>
                  <p className="mt-2 text-3xl font-extrabold text-primary"><SarAmount amount={abandonedLostRevenue} /></p>
                  <p className="mt-1 text-xs text-muted-foreground">Potential if recovered</p>
                </CardContent>
              </Card>
              <Card className="border-border/70 bg-background">
                <CardContent className="p-5">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <RotateCcw className="h-4 w-4" />
                    Recovery rate
                  </p>
                  <p className="mt-2 text-3xl font-extrabold text-green-600">{abandonedRecoveryRate}%</p>
                  <p className="mt-1 text-xs text-green-600">{abandonedRecoveredCount} of {abandonedCounts.all} recovered</p>
                </CardContent>
              </Card>
              <Card className="border-border/70 bg-background">
                <CardContent className="p-5">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <Gift className="h-4 w-4" />
                    Discounts sent
                  </p>
                  <p className="mt-2 text-3xl font-extrabold">{abandonedCounts.discount_sent}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Manual outreach in this workspace</p>
                </CardContent>
              </Card>
            </div>

            <div className="flex border-b">
              {[
                { key: "all", label: "All abandoned", count: abandonedCounts.all },
                { key: "not_contacted", label: "Not contacted", count: abandonedCounts.not_contacted },
                { key: "discount_sent", label: "Discount sent", count: abandonedCounts.discount_sent },
                { key: "expired", label: "Expired", count: abandonedCounts.expired },
                { key: "recovered", label: "Recovered", count: abandonedCounts.recovered },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setAbandonedTab(tab.key as any);
                    setSelectedRows(new Set());
                  }}
                  className={cn(
                    "-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition",
                    abandonedTab === tab.key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                  data-testid={`tab-abandoned-${tab.key}`}
                >
                  {tab.label}
                  <span className={cn("rounded-full px-2 py-0.5 text-xs", abandonedTab === tab.key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[260px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by name, phone, or shipment ID..."
                  className="bg-background pl-10"
                  data-testid="input-abandoned-search"
                />
              </div>
              <Select value={methodFilter} onValueChange={setMethodFilter}>
                <SelectTrigger className="w-[190px] bg-background" data-testid="select-abandoned-method">
                  <SelectValue placeholder="All methods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All methods</SelectItem>
                  <SelectItem value="air">Air freight</SelectItem>
                  <SelectItem value="sea">Sea freight</SelectItem>
                  <SelectItem value="domestic">Domestic</SelectItem>
                  <SelectItem value="express_import">Express import</SelectItem>
                  <SelectItem value="express_export">Express export</SelectItem>
                </SelectContent>
              </Select>
              <Select value={originFilter} onValueChange={setOriginFilter}>
                <SelectTrigger className="w-[160px] bg-background" data-testid="select-abandoned-origin">
                  <SelectValue placeholder="All origins" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All origins</SelectItem>
                  <SelectItem value="cn">China</SelectItem>
                  <SelectItem value="uae">UAE</SelectItem>
                  <SelectItem value="sa">Saudi Arabia</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Select value={abandonedStatusFilter} onValueChange={setAbandonedStatusFilter}>
                <SelectTrigger className="w-[170px] bg-background" data-testid="select-abandoned-status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="not_contacted">Not contacted</SelectItem>
                  <SelectItem value="discount_sent">Discount sent</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="recovered">Recovered</SelectItem>
                </SelectContent>
              </Select>
              {hasAbandonedFilters && (
                <Button variant="ghost" size="sm" onClick={clearAbandonedFilters} data-testid="button-clear-abandoned-filters">
                  <X className="mr-1 h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>

            {selectedRows.size > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">
                <CheckCircle2 className="h-4 w-4" />
                <span className="mr-auto">{selectedRows.size} client{selectedRows.size === 1 ? "" : "s"} selected</span>
                <Button size="sm" onClick={() => sendDiscountForShipments(selectedFilteredRows)} data-testid="button-bulk-discount">
                  <Gift className="mr-2 h-4 w-4" />
                  Send discount
                </Button>
                <Button variant="outline" size="sm" onClick={() => sendReminderForShipments(selectedFilteredRows)} data-testid="button-bulk-reminder">
                  <Send className="mr-2 h-4 w-4" />
                  Send reminder
                </Button>
                <Button variant="destructive" size="sm" onClick={() => dismissAbandonedShipments(selectedFilteredRows)} data-testid="button-bulk-dismiss">
                  <X className="mr-2 h-4 w-4" />
                  Dismiss
                </Button>
              </div>
            )}

            <Card className="overflow-hidden border-border/70 bg-background">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={filteredAbandonedShipments.length > 0 && filteredAbandonedShipments.every((shipment) => selectedRows.has(shipment.id))}
                          onChange={(event) => toggleAllAbandonedRows(event.target.checked)}
                          data-testid="checkbox-abandoned-select-all"
                        />
                      </TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Shipment ID</TableHead>
                      <TableHead>Route & Method</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Abandoned</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[190px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAbandonedShipments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-40 text-center text-muted-foreground">
                          No abandoned shipments match the current filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAbandonedShipments.map((shipment) => {
                        const clientName = getClientDisplayName(shipment, clients);
                        const clientPhone = getClientPhone(shipment, clients);
                        const method = getShipmentMethod(shipment);
                        const methodMeta = getMethodMeta(method);
                        const MethodIcon = methodMeta.icon;
                        const recovery = recoveryByShipmentId.get(shipment.id);
                        const rowStatus = getAbandonedStatus(shipment, recovery);
                        const ageText = formatAbandonedAge(shipment.createdAt);
                        const isSelected = selectedRows.has(shipment.id);

                        return (
                          <TableRow key={shipment.id} className={cn(isSelected && "bg-amber-50/60 dark:bg-amber-950/10")} data-testid={`row-abandoned-${shipment.id}`}>
                            <TableCell>
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-primary"
                                checked={isSelected}
                                onChange={(event) => toggleAbandonedRow(shipment.id, event.target.checked)}
                                data-testid={`checkbox-abandoned-${shipment.id}`}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-extrabold text-primary">
                                  {getInitials(clientName)}
                                </div>
                                <div>
                                  <p className="font-bold text-foreground">{clientName}</p>
                                  <p className="text-xs text-muted-foreground">{clientPhone}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <p className="font-mono text-xs font-bold text-primary">{shipment.trackingNumber}</p>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 text-xs">
                                <MethodIcon className="h-4 w-4 text-muted-foreground" />
                                <span>{getCountryFlag(shipment.senderCountry)} to {getCountryFlag(shipment.recipientCountry)}</span>
                              </div>
                              <Badge className={cn("mt-2 border-0 text-[10px]", methodMeta.className)}>{methodMeta.label}</Badge>
                            </TableCell>
                            <TableCell>
                              <p className="font-bold"><SarAmount amount={shipment.finalPrice} /></p>
                              <p className="text-xs text-muted-foreground">
                                {shipment.chargeableWeight
                                  ? `${Number(shipment.chargeableWeight).toFixed(2)} ${shipment.chargeableWeightUnit || "KG"}`
                                  : `${Number(shipment.weight || 0).toFixed(1)} ${shipment.weightUnit || "KG"}`}
                              </p>
                            </TableCell>
                            <TableCell>
                              <Badge className={cn("border-0", getAgeBadgeClass(ageText))}>{ageText}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={cn("border-0 capitalize", getStatusBadgeClass(rowStatus))}>
                                {rowStatus.replace("_", " ")}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" onClick={() => setSelectedShipment(shipment)} data-testid={`button-view-abandoned-${shipment.id}`}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {rowStatus !== "recovered" && (
                                  <Button size="sm" onClick={() => setDiscountShipment(shipment)} data-testid={`button-discount-abandoned-${shipment.id}`}>
                                    <Gift className="mr-2 h-4 w-4" />
                                    Send offer
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
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
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog open={!!discountShipment} onOpenChange={(open) => !open && setDiscountShipment(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send discount offer</DialogTitle>
              <DialogDescription>
                {discountShipment
                  ? `${getClientDisplayName(discountShipment, clients)} · ${formatSAR(Number(discountShipment.finalPrice || 0))} · ${getMethodMeta(getShipmentMethod(discountShipment)).label}`
                  : "Create a recovery offer"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Discount type</label>
                  <Select value={discountType} onValueChange={(value) => setDiscountType(value as DiscountType)}>
                    <SelectTrigger data-testid="select-discount-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed amount (SAR)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Value</label>
                  <Input type="number" min="1" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} data-testid="input-discount-value" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Expires in</label>
                  <Select value={discountExpiry} onValueChange={setDiscountExpiry}>
                    <SelectTrigger data-testid="select-discount-expiry"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24 hours">24 hours</SelectItem>
                      <SelectItem value="48 hours">48 hours</SelectItem>
                      <SelectItem value="7 days">7 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Channel</label>
                  <Select value={discountChannel} onValueChange={setDiscountChannel}>
                    <SelectTrigger data-testid="select-discount-channel"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                      <SelectItem value="SMS">SMS</SelectItem>
                      <SelectItem value="Email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/40 p-4">
                <Badge className="mb-3 border-0 bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300">
                  Saves <SarAmount amount={discountAmount} />
                </Badge>
                <div className="text-sm leading-7 text-muted-foreground">
                  <p>مرحبا {discountShipment ? getClientDisplayName(discountShipment, clients).split(" ")[0] : ""}</p>
                  <p>
                    لاحظنا إنك شاهدت سعر شحنتك ولم تكمل الدفع. عندنا لك عرض خاص:
                    {" "}
                    <span className="font-bold text-primary">
                      {discountType === "percent" ? `خصم ${Number(discountValue) || 0}%` : `خصم ${formatSAR(Number(discountValue) || 0)}`}
                    </span>
                    .
                  </p>
                  <p>
                    السعر بعد الخصم: <span className="font-bold text-primary">{formatSAR(discountFinalPrice)}</span>.
                    العرض ساري لمدة <span className="font-bold text-primary">{discountExpiry}</span>.
                  </p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDiscountShipment(null)}>Cancel</Button>
              <Button onClick={() => discountShipment && sendDiscountForShipments([discountShipment])} data-testid="button-send-discount-offer">
                <Send className="mr-2 h-4 w-4" />
                Send via {discountChannel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Sheet open={!!selectedShipment} onOpenChange={() => setSelectedShipment(null)}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Abandoned Shipment Details
              </SheetTitle>
            </SheetHeader>
            {selectedShipment && (
              <div className="mt-6 space-y-4">
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Shipment ID</p>
                  <p className="font-mono font-bold text-primary">{selectedShipment.trackingNumber}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-4">
                  <p className="font-bold">{getClientDisplayName(selectedShipment, clients)}</p>
                  <p className="text-sm text-muted-foreground">{getClientPhone(selectedShipment, clients)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-xs text-muted-foreground">From</p>
                    <p className="font-medium">{selectedShipment.senderCity}, {selectedShipment.senderCountry}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-xs text-muted-foreground">To</p>
                    <p className="font-medium">{selectedShipment.recipientCity}, {selectedShipment.recipientCountry}</p>
                  </div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-bold"><SarAmount amount={selectedShipment.finalPrice} /></span>
                  </div>
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="text-muted-foreground">Payment status</span>
                    <StatusBadge status={selectedShipment.paymentStatus || "pending"} />
                  </div>
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="text-muted-foreground">Abandoned</span>
                    <span>{formatAbandonedAge(selectedShipment.createdAt)}</span>
                  </div>
                </div>
                <Button className="w-full" onClick={() => setDiscountShipment(selectedShipment)}>
                  <Gift className="mr-2 h-4 w-4" />
                  Send offer
                </Button>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{abandonedOnly ? "Abandoned Shipments" : "Shipments"}</h1>
            <p className="text-muted-foreground">
              {abandonedOnly
                ? "Review checkouts that were created but never completed with online payment"
                : "Track and manage all shipments across clients"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh">
            <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{total.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{abandonedOnly ? "Abandoned Shipments" : "Total Shipments"}</p>
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
                  placeholder="Search by shipment ID, name, or city..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
              {!abandonedOnly && <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="created">Created</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="awaiting_review">Awaiting Review</SelectItem>
                  <SelectItem value="booked">Booked</SelectItem>
                  <SelectItem value="supplier_pickup">Supplier Pickup</SelectItem>
                  <SelectItem value="in_transit">In Transit</SelectItem>
                  <SelectItem value="customs_clearance">Customs Clearance</SelectItem>
                  <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="carrier_error">Carrier Error</SelectItem>
                </SelectContent>
              </Select>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {shipments.length > 0 ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Shipment ID</TableHead>
                      <TableHead>Origin</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead>Status</TableHead>
                      {abandonedOnly && <TableHead>Payment</TableHead>}
                      <TableHead>Weight</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shipments.map((shipment) => (
                      <TableRow key={shipment.id} data-testid={`row-shipment-${shipment.id}`}>
                        <TableCell className="font-mono text-sm font-medium">{shipment.trackingNumber}</TableCell>
                        <TableCell>
                          <span className="text-sm">{shipment.senderCity}, {shipment.senderCountry}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{shipment.recipientCity}, {shipment.recipientCountry}</span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={shipment.status} />
                        </TableCell>
                        {abandonedOnly && (
                          <TableCell>
                            <StatusBadge status={shipment.paymentStatus || "pending"} />
                          </TableCell>
                        )}
                        <TableCell className="text-sm">{Number(shipment.weight).toFixed(1)} kg</TableCell>
                        <TableCell className="text-right font-medium"><SarAmount amount={shipment.finalPrice} /></TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => setSelectedShipment(shipment)} data-testid={`button-view-${shipment.id}`}>
                            <Eye className="h-4 w-4" />
                          </Button>
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
              <NoShipments />
            )}
          </CardContent>
        </Card>
      </div>

      <Sheet open={!!selectedShipment} onOpenChange={() => setSelectedShipment(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Shipment Details
            </SheetTitle>
          </SheetHeader>
          {selectedShipment && (
            <div className="mt-6 space-y-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm text-muted-foreground">Shipment ID</p>
                  <p className="font-mono font-medium">{selectedShipment.trackingNumber}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedShipment.taxScenario && (
                    <Badge variant="outline">{formatTaxScenarioLabel(selectedShipment)}</Badge>
                  )}
                  <StatusBadge status={selectedShipment.status} />
                </div>
              </div>
              {selectedShipment.carrierTrackingNumber && (
                <div>
                  <p className="text-sm text-muted-foreground">Carrier Tracking #</p>
                  <p className="font-mono font-medium">{selectedShipment.carrierTrackingNumber}</p>
                </div>
              )}
              {(selectedShipment as any).carrierLabelBase64 && (
                <Button
                  variant="outline"
                  className="w-full"
                  data-testid="button-download-label"
                  onClick={() => window.open(`/api/admin/shipments/${selectedShipment.id}/label.pdf`, "_blank")}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Label (PDF)
                </Button>
              )}
              {selectedShipment.itemsData && (
                <Button
                  variant="outline"
                  className="w-full"
                  data-testid="button-download-commercial-invoice"
                  onClick={() => window.open(`/api/admin/shipments/${selectedShipment.id}/commercial-invoice.pdf`, "_blank")}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Commercial Invoice (PDF)
                </Button>
              )}
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Origin</span>
                </div>
                <p className="font-medium">{selectedShipment.senderName}</p>
                <p className="text-sm text-muted-foreground">{selectedShipment.senderAddress}</p>
                <p className="text-sm text-muted-foreground">{selectedShipment.senderCity}, {selectedShipment.senderCountry}</p>
                <p className="text-sm text-muted-foreground">{selectedShipment.senderPhone}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Destination</span>
                </div>
                <p className="font-medium">{selectedShipment.recipientName}</p>
                <p className="text-sm text-muted-foreground">{selectedShipment.recipientAddress}</p>
                <p className="text-sm text-muted-foreground">{selectedShipment.recipientCity}, {selectedShipment.recipientCountry}</p>
                <p className="text-sm text-muted-foreground">{selectedShipment.recipientPhone}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">
                    {(selectedShipment.numberOfPackages || 1) === 1 ? "Package" : `${selectedShipment.numberOfPackages} Packages`}
                  </span>
                  <span className="text-xs text-muted-foreground capitalize">({selectedShipment.packageType})</span>
                </div>
                {selectedShipment.packagesData ? (
                  (() => {
                    const packages = JSON.parse(selectedShipment.packagesData);

                    return (
                      <div className="space-y-2">
                        {packages.map((pkg: any, i: number) => (
                          <div key={i} className="flex items-center justify-between gap-2 text-sm px-2 py-1.5 rounded bg-background">
                            <span className="font-medium">Pkg {i + 1}</span>
                            <span className="font-medium">
                              Billable: {Number(pkg.chargeableWeight || pkg.weight).toFixed(3)} {pkg.chargeableWeightUnit || selectedShipment.chargeableWeightUnit || selectedShipment.weightUnit || "KG"}
                            </span>
                            <span className="text-muted-foreground">
                              {pkg.usesDimensionalWeight ? "Dimensional" : "Actual"} basis
                            </span>
                            <span className="text-muted-foreground">{pkg.length} x {pkg.width} x {pkg.height} {selectedShipment.dimensionUnit || "CM"}</span>
                          </div>
                        ))}
                        {selectedShipment.chargeableWeight && (
                          <div className="flex justify-between text-sm pt-1 border-t">
                            <span className="text-muted-foreground">Billable Weight</span>
                            <span className="font-medium">
                              {Number(selectedShipment.chargeableWeight).toFixed(3)} {selectedShipment.chargeableWeightUnit || selectedShipment.weightUnit || "KG"}
                            </span>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">{formatChargeablePackageCounts(packages)}</p>
                      </div>
                    );
                  })()
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Weight</p>
                      <p className="font-medium">{Number(selectedShipment.weight).toFixed(1)} {selectedShipment.weightUnit || "KG"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Dimensions</p>
                      <p className="font-medium">{selectedShipment.length} x {selectedShipment.width} x {selectedShipment.height} {selectedShipment.dimensionUnit || "CM"}</p>
                    </div>
                  </div>
                )}
              </div>
              {selectedShipment.itemsData && (() => {
                try {
                  const items = JSON.parse(selectedShipment.itemsData) as ShipmentItem[];
                  if (items.length === 0) return null;
                  return (
                    <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Items ({items.length})</span>
                      </div>
                      <div className="space-y-2">
                        {items.map((item, i) => (
                          <div key={i} className="px-3 py-2 rounded bg-background space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{item.itemName}</span>
                              <div className="flex items-center gap-2">
                                {item.hsCode ? (
                                  <Badge variant="outline" className="text-xs" data-testid={`badge-hs-${i}`}>
                                    HS: {item.hsCode}
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive" className="text-xs">No HS</Badge>
                                )}
                                {item.hsCodeConfidence && (
                                  <Badge className={
                                    item.hsCodeConfidence === "HIGH" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs" :
                                    item.hsCodeConfidence === "MEDIUM" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 text-xs" :
                                    item.hsCodeConfidence === "LOW" ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 text-xs" :
                                    "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 text-xs"
                                  }>
                                    {item.hsCodeConfidence}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground flex gap-3">
                              <span>{item.category}</span>
                              <span>Origin: {item.countryOfOrigin}</span>
                              <span>Qty: {item.quantity}</span>
                              <span><SarAmount amount={item.price} /> each</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                } catch { return null; }
              })()}
              <div className="p-4 rounded-lg border">
                <div className="flex items-center gap-2 mb-3">
                  <SarSymbol size="xs" className="text-muted-foreground" />
                  <span className="text-sm font-medium">Pricing Breakdown</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Base Rate</span>
                    <span><SarAmount amount={selectedShipment.baseRate} /></span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Margin</span>
                    <span className="text-green-600 dark:text-green-400">+<SarAmount amount={selectedShipment.margin} /></span>
                  </div>
                  {hasAccountingSnapshot(selectedShipment) ? (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Sell Subtotal</span>
                      <span><SarAmount amount={selectedShipment.sellSubtotalAmountSar || 0} /></span>
                    </div>
                  ) : null}
                  <div className="border-t pt-2 flex justify-between font-medium">
                    <span>Client Total</span>
                    <span><SarAmount amount={selectedShipment.finalPrice} /></span>
                  </div>
                </div>
              </div>
              <div className="p-4 rounded-lg border space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <SarSymbol size="xs" className="text-muted-foreground" />
                    <span className="text-sm font-medium">Accounting Snapshot</span>
                  </div>
                  {selectedShipment.accountingCurrency && (
                    <Badge variant="secondary">{selectedShipment.accountingCurrency}</Badge>
                  )}
                </div>
                {hasAccountingSnapshot(selectedShipment) ? (
                  <>
                    <p className="text-xs text-muted-foreground">{getAccountingNote(selectedShipment)}</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Cost Amount</span>
                        <span><SarAmount amount={selectedShipment.costAmountSar || 0} /></span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Cost Tax (System Only)</span>
                        <span><SarAmount amount={selectedShipment.costTaxAmountSar || 0} /></span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">System Cost Total</span>
                        <span><SarAmount amount={selectedShipment.systemCostTotalAmountSar || 0} /></span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Sell Subtotal</span>
                        <span><SarAmount amount={selectedShipment.sellSubtotalAmountSar || 0} /></span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Sell Tax</span>
                        <span><SarAmount amount={selectedShipment.sellTaxAmountSar || 0} /></span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Revenue Excl. Tax</span>
                        <span><SarAmount amount={selectedShipment.revenueExcludingTaxAmountSar || 0} /></span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Net Tax Payable</span>
                        <span><SarAmount amount={selectedShipment.taxPayableAmountSar || 0} /></span>
                      </div>
                      <div className="border-t pt-2 flex justify-between font-medium">
                        <span>Client Total</span>
                        <span><SarAmount amount={selectedShipment.clientTotalAmountSar || selectedShipment.finalPrice} /></span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">
                    This shipment does not have a frozen accounting snapshot yet.
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Created {format(new Date(selectedShipment.createdAt), "MMM d, yyyy 'at' h:mm a")}
              </div>
              {selectedShipment.status === "carrier_error" && (
                <div className="p-4 rounded-lg border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    <span className="text-sm font-medium text-orange-800 dark:text-orange-300">Carrier Error</span>
                  </div>
                  {(selectedShipment as any).carrierErrorCode && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Error Code: </span>
                      <span className="font-mono">{(selectedShipment as any).carrierErrorCode}</span>
                    </div>
                  )}
                  {(selectedShipment as any).carrierErrorMessage && (
                    <p className="text-sm text-muted-foreground">{(selectedShipment as any).carrierErrorMessage}</p>
                  )}
                  {(selectedShipment as any).carrierAttempts > 0 && (
                    <p className="text-xs text-muted-foreground">Attempts: {(selectedShipment as any).carrierAttempts}</p>
                  )}
                  {canRetryCarrier && (
                    <Button
                      className="w-full"
                      onClick={() => retryCarrierMutation.mutate(selectedShipment.id)}
                      disabled={retryCarrierMutation.isPending}
                      data-testid="button-retry-carrier"
                    >
                      {retryCarrierMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                      Retry Carrier Submission
                    </Button>
                  )}
                </div>
              )}
              {canCancelShipment(selectedShipment) &&
                (canUpdateShipments || canCancelShipments) && (
                <div className="p-4 rounded-lg border space-y-4">
                  <p className="text-sm font-medium">Update Status</p>
                  {canUpdateShipments && (
                    <div className="flex items-center gap-3">
                      <Select
                        value={selectedShipment.status}
                        onValueChange={(status) => updateStatusMutation.mutate({ id: selectedShipment.id, status })}
                        disabled={updateStatusMutation.isPending}
                      >
                        <SelectTrigger className="flex-1" data-testid="select-status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="created">Created</SelectItem>
                          <SelectItem value="processing">Processing</SelectItem>
                          {selectedShipment.fulfillmentType === "ddp_manual" && <>
                            <SelectItem value="awaiting_review">Awaiting Review</SelectItem>
                            <SelectItem value="booked">Booked</SelectItem>
                            <SelectItem value="supplier_pickup">Supplier Pickup</SelectItem>
                          </>}
                          <SelectItem value="in_transit">In Transit</SelectItem>
                          {selectedShipment.fulfillmentType === "ddp_manual" && <>
                            <SelectItem value="customs_clearance">Customs Clearance</SelectItem>
                            <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                          </>}
                          <SelectItem value="delivered">Delivered</SelectItem>
                        </SelectContent>
                      </Select>
                      {updateStatusMutation.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>
                  )}
                  {canCancelShipments && (
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={() => cancelMutation.mutate(selectedShipment.id)}
                      disabled={cancelMutation.isPending}
                      data-testid="button-cancel-shipment"
                    >
                      {cancelMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
                      Cancel Shipment
                    </Button>
                  )}
                </div>
              )}
              {selectedShipment.fulfillmentType === "ddp_manual" && canUpdateShipments && (
                <div className="rounded-lg border p-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium">Add DDP Adjustment</p>
                    <p className="text-xs text-muted-foreground">Creates a separate payable client invoice for this manual shipment.</p>
                  </div>
                  <div className="space-y-1">
                    <Label>Amount (SAR)</Label>
                    <Input type="number" min="0" value={ddpAdjustmentAmount} onChange={(event) => setDdpAdjustmentAmount(event.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Description</Label>
                    <Textarea value={ddpAdjustmentDescription} onChange={(event) => setDdpAdjustmentDescription(event.target.value)} />
                  </div>
                  <Button
                    className="w-full"
                    disabled={createDdpAdjustmentMutation.isPending || Number(ddpAdjustmentAmount) <= 0 || ddpAdjustmentDescription.trim().length < 3}
                    onClick={() => createDdpAdjustmentMutation.mutate({ id: selectedShipment.id, description: ddpAdjustmentDescription, amount: Number(ddpAdjustmentAmount) })}
                  >
                    Create adjustment invoice
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}
