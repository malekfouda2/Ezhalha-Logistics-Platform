import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Ban,
  CheckCircle,
  ChevronDown,
  Clock,
  Filter,
  Landmark,
  Package,
  PencilLine,
  Receipt,
  RefreshCw,
  Search,
  TrendingUp,
  WalletCards,
  X,
  XCircle,
} from "lucide-react";

import { AdminLayout } from "@/components/admin-layout";
import { LoadingScreen } from "@/components/loading-spinner";
import { PaginationControls } from "@/components/pagination-controls";
import { SarAmount, SarSymbol } from "@/components/sar-symbol";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { useToast } from "@/hooks/use-toast";
import { queryClient, readJsonResponse } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { Payment, Shipment } from "@shared/schema";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const statusIcons: Record<string, typeof Clock> = {
  pending: Clock,
  completed: CheckCircle,
  failed: XCircle,
};

interface PaginatedPaymentsResponse {
  payments: Payment[];
  total: number;
  page: number;
  totalPages: number;
}

interface AccountingSummary {
  totalShipments: number;
  costAmountSar: number;
  costTaxAmountSar: number;
  sellSubtotalAmountSar: number;
  sellTaxAmountSar: number;
  clientTotalAmountSar: number;
  systemCostTotalAmountSar: number;
  taxPayableAmountSar: number;
  revenueExcludingTaxAmountSar: number;
  marginAmountSar: number;
  netProfitAmountSar: number;
  scenarioCounts: Record<string, number>;
}

interface MonthlyStatement extends AccountingSummary {
  month: number;
  year: number;
  label: string;
}

type FinancialShipment = Omit<
  Shipment,
  | "costAmountSar"
  | "costTaxAmountSar"
  | "sellSubtotalAmountSar"
  | "sellTaxAmountSar"
  | "clientTotalAmountSar"
  | "systemCostTotalAmountSar"
  | "taxPayableAmountSar"
  | "revenueExcludingTaxAmountSar"
  | "extraFeesAmountSar"
  | "extraFeesType"
  | "extraFeesWeightValue"
  | "extraFeesCostAmountSar"
  | "extraWeightAmountSar"
  | "extraFeesAddedAt"
  | "extraFeesEmailSentAt"
> & {
  clientName: string;
  clientAccountNumber: string | null;
  costAmountSar: number;
  costTaxAmountSar: number;
  sellSubtotalAmountSar: number;
  sellTaxAmountSar: number;
  clientTotalAmountSar: number;
  systemCostTotalAmountSar: number;
  taxPayableAmountSar: number;
  revenueExcludingTaxAmountSar: number;
  netProfitAmountSar: number;
  extraFeesAmountSar: number;
  extraFeesType: "EXTRA_WEIGHT" | "EXTRA_COST" | "COMBINED" | null;
  extraFeesWeightValue: number;
  extraFeesCostAmountSar: number;
  extraWeightAmountSar: number;
  extraFeesRateSarPerWeight: number;
  extraFeesAddedAt: string | null;
  extraFeesEmailSentAt: string | null;
  extraWeightInvoiceStatus: "paid" | "pending" | "failed" | null;
  isExtraWeightPaid: boolean;
  weightValue: number;
  carrierTrackingId: string | null;
  carrierPaymentAmountSar: number;
  carrierPaymentReference: string | null;
  carrierPaymentNote: string | null;
  isCancelledFinancially: boolean;
  isClientPaid: boolean;
  isCarrierPaid: boolean;
  canMarkPaid: boolean;
  canMarkCarrierPaid: boolean;
  canViewCarrierPayment: boolean;
  canCancel: boolean;
};

interface CarrierTransaction {
  shipmentId: string;
  trackingNumber: string;
  carrierTrackingId: string | null;
  clientName: string;
  clientAccountNumber: string | null;
  carrierCode: string | null;
  carrierName: string;
  taxScenario: string | null;
  carrierCostAmountSar: number;
  carrierTaxAmountSar: number;
  carrierPaymentAmountSar: number;
  carrierPaymentReference: string | null;
  carrierPaymentNote: string | null;
  carrierPaidAt: string | null;
  createdAt: string;
}

interface FinancialStatementsResponse {
  month: number;
  year: number;
  startDate: string | null;
  endDate: string | null;
  clientPaymentStatus: string;
  carrierPaymentStatus: string;
  carrierName: string | null;
  page: number;
  total: number;
  totalPages: number;
  excludedLegacyShipmentCount: number;
  summary: AccountingSummary;
  monthlyStatements: MonthlyStatement[];
  carrierTransactions: CarrierTransaction[];
  shipments: FinancialShipment[];
}

type PaymentFilterValue = "all" | "paid" | "not_paid";
type CarrierPaymentDialogMode = "pay" | "view";

function formatScenarioLabel(value: string | null | undefined) {
  if (value === "DDP") return "DDP Import";
  if (value === "DCE") return "DCE Domestic";
  if (value === "IMPORT") return "Import";
  if (value === "EXPORT") return "Export";
  return "Unknown";
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getExtraFeesRate(shipment: FinancialShipment): number {
  if (!shipment.weightValue || shipment.weightValue <= 0) {
    return 0;
  }

  return roundMoney((shipment.clientTotalAmountSar || 0) / shipment.weightValue);
}

function formatExtraFeesTypeLabel(type: FinancialShipment["extraFeesType"]) {
  if (type === "COMBINED") return "Weight + Cost";
  if (type === "EXTRA_WEIGHT") return "Extra Weight";
  if (type === "EXTRA_COST") return "Extra Cost";
  return "Extra Fees";
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });

  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(text);
  }

  return readJsonResponse<T>(res);
}

async function patchJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });

  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(text);
  }

  return readJsonResponse<T>(res);
}

async function refreshFinancialQueries() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["/api/admin/financial-statements"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/admin/payments"] }),
  ]);
}

export default function AdminPayments() {
  const { toast } = useToast();
  const { hasPermission } = useAdminAccess();
  const [paymentTransactionsOpen, setPaymentTransactionsOpen] = useState(true);
  const [carrierTransactionsOpen, setCarrierTransactionsOpen] = useState(true);

  const [financialSearchInput, setFinancialSearchInput] = useState("");
  const [financialSubmittedSearch, setFinancialSubmittedSearch] = useState("");
  const [carrierNameFilter, setCarrierNameFilter] = useState("");
  const [financialDebouncedCarrierName, setFinancialDebouncedCarrierName] = useState("");
  const [scenarioFilter, setScenarioFilter] = useState("all");
  const [clientPaymentFilter, setClientPaymentFilter] = useState<PaymentFilterValue>("all");
  const [carrierPaymentFilter, setCarrierPaymentFilter] = useState<PaymentFilterValue>("all");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [financialPage, setFinancialPage] = useState(1);
  const [financialPageSize, setFinancialPageSize] = useState(25);
  const [isMonthlySummaryOpen, setIsMonthlySummaryOpen] = useState(true);

  const [paymentSearchQuery, setPaymentSearchQuery] = useState("");
  const [paymentDebouncedSearch, setPaymentDebouncedSearch] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentPageSize, setPaymentPageSize] = useState(25);

  const [extraFeesDialogShipment, setExtraFeesDialogShipment] = useState<FinancialShipment | null>(null);
  const [extraWeightInput, setExtraWeightInput] = useState("");
  const [extraCostInput, setExtraCostInput] = useState("");
  const [carrierPaymentDialogShipment, setCarrierPaymentDialogShipment] = useState<FinancialShipment | null>(null);
  const [carrierPaymentDialogMode, setCarrierPaymentDialogMode] = useState<CarrierPaymentDialogMode>("pay");
  const [carrierPaymentReferenceInput, setCarrierPaymentReferenceInput] = useState("");
  const [carrierPaymentNoteInput, setCarrierPaymentNoteInput] = useState("");

  const canManageClientPayments = hasPermission("payments", "create");
  const canUpdateShipments = hasPermission("shipments", "update");
  const canCancelShipments = hasPermission("shipments", "cancel");

  useEffect(() => {
    const timer = setTimeout(() => {
      setFinancialDebouncedCarrierName(carrierNameFilter);
      setFinancialPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [carrierNameFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPaymentDebouncedSearch(paymentSearchQuery);
      setPaymentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [paymentSearchQuery]);

  const hasInvalidFinancialDateRange = Boolean(
    startDateFilter && endDateFilter && startDateFilter > endDateFilter,
  );

  const buildFinancialQueryString = () => {
    const params = new URLSearchParams();
    params.set("page", String(financialPage));
    params.set("limit", String(financialPageSize));
    if (financialSubmittedSearch) params.set("search", financialSubmittedSearch);
    if (financialDebouncedCarrierName) params.set("carrierName", financialDebouncedCarrierName);
    if (scenarioFilter !== "all") params.set("scenario", scenarioFilter);
    if (clientPaymentFilter !== "all") params.set("clientPaymentStatus", clientPaymentFilter);
    if (carrierPaymentFilter !== "all") params.set("carrierPaymentStatus", carrierPaymentFilter);
    if (startDateFilter) params.set("startDate", startDateFilter);
    if (endDateFilter) params.set("endDate", endDateFilter);
    return params.toString();
  };

  const buildPaymentsQueryString = () => {
    const params = new URLSearchParams();
    params.set("page", String(paymentPage));
    params.set("limit", String(paymentPageSize));
    if (paymentDebouncedSearch) params.set("search", paymentDebouncedSearch);
    if (paymentStatusFilter !== "all") params.set("status", paymentStatusFilter);
    return params.toString();
  };

  const {
    data: financialData,
    isLoading: financialLoading,
    isFetching: financialFetching,
    refetch: refetchFinancial,
  } = useQuery<FinancialStatementsResponse>({
    queryKey: [
      "/api/admin/financial-statements",
      financialPage,
      financialPageSize,
      financialSubmittedSearch,
      financialDebouncedCarrierName,
      scenarioFilter,
      clientPaymentFilter,
      carrierPaymentFilter,
      startDateFilter,
      endDateFilter,
    ],
    enabled: !hasInvalidFinancialDateRange,
    queryFn: async () => {
      const res = await fetch(`/api/admin/financial-statements?${buildFinancialQueryString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch financial statements");
      return readJsonResponse<FinancialStatementsResponse>(res);
    },
  });

  const {
    data: paymentsData,
    isLoading: paymentsLoading,
    isFetching: paymentsFetching,
    refetch: refetchPayments,
  } = useQuery<PaginatedPaymentsResponse>({
    queryKey: [
      "/api/admin/payments",
      paymentPage,
      paymentPageSize,
      paymentDebouncedSearch,
      paymentStatusFilter,
    ],
    queryFn: async () => {
      const res = await fetch(`/api/admin/payments?${buildPaymentsQueryString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch payments");
      return readJsonResponse<PaginatedPaymentsResponse>(res);
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (shipmentId: string) =>
      postJson(`/api/admin/financial-statements/shipments/${shipmentId}/mark-paid`),
    onSuccess: async () => {
      await refreshFinancialQueries();
      toast({ title: "Shipment marked as paid", description: "The client payment status has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to mark shipment as paid", description: error.message, variant: "destructive" });
    },
  });

  const markCarrierPaidMutation = useMutation({
    mutationFn: async (params: {
      shipmentId: string;
      paymentReference: string;
      paymentNote: string;
    }) =>
      postJson(`/api/admin/financial-statements/shipments/${params.shipmentId}/mark-carrier-paid`, {
        paymentReference: params.paymentReference,
        paymentNote: params.paymentNote,
      }),
    onSuccess: async () => {
      await refreshFinancialQueries();
      setCarrierPaymentDialogShipment(null);
      setCarrierPaymentReferenceInput("");
      setCarrierPaymentNoteInput("");
      toast({ title: "Carrier marked as paid", description: "The carrier payment status has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to mark carrier as paid", description: error.message, variant: "destructive" });
    },
  });

  const cancelCarrierPaymentMutation = useMutation({
    mutationFn: async (shipmentId: string) =>
      postJson(`/api/admin/financial-statements/shipments/${shipmentId}/cancel-carrier-payment`),
    onSuccess: async () => {
      await refreshFinancialQueries();
      setCarrierPaymentDialogShipment(null);
      setCarrierPaymentReferenceInput("");
      setCarrierPaymentNoteInput("");
      toast({ title: "Carrier payment cancelled", description: "The shipment can now be paid again." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to cancel carrier payment", description: error.message, variant: "destructive" });
    },
  });

  const cancelShipmentMutation = useMutation({
    mutationFn: async (shipmentId: string) => postJson(`/api/admin/shipments/${shipmentId}/cancel`),
    onSuccess: async () => {
      await refreshFinancialQueries();
      toast({ title: "Shipment cancelled", description: "The shipment remains visible with zero financial effect." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to cancel shipment", description: error.message, variant: "destructive" });
    },
  });

  const updateExtraFeesMutation = useMutation({
    mutationFn: async (params: {
      shipmentId: string;
      extraWeightValue?: string;
      extraCostAmountSar?: string;
      clear?: boolean;
    }) =>
      patchJson(`/api/admin/financial-statements/shipments/${params.shipmentId}/extra-fees`, {
        extraWeightValue: params.extraWeightValue,
        extraCostAmountSar: params.extraCostAmountSar,
        clear: params.clear,
      }),
    onSuccess: async () => {
      await refreshFinancialQueries();
      setExtraFeesDialogShipment(null);
      setExtraWeightInput("");
      setExtraCostInput("");
      toast({
        title: "Extra fees updated",
        description: "The shipment extra fees were saved. Extra weight billing was synced for the client, and any internal-only extra cost stayed on the system side.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update extra fees", description: error.message, variant: "destructive" });
    },
  });

  const clearFinancialFilters = () => {
    setFinancialSearchInput("");
    setFinancialSubmittedSearch("");
    setCarrierNameFilter("");
    setFinancialDebouncedCarrierName("");
    setScenarioFilter("all");
    setClientPaymentFilter("all");
    setCarrierPaymentFilter("all");
    setStartDateFilter("");
    setEndDateFilter("");
    setFinancialPage(1);
  };

  const clearPaymentFilters = () => {
    setPaymentSearchQuery("");
    setPaymentDebouncedSearch("");
    setPaymentStatusFilter("all");
    setPaymentPage(1);
  };

  if (
    (financialLoading && !financialData) ||
    (paymentsLoading && !paymentsData)
  ) {
    return (
      <AdminLayout>
        <LoadingScreen message="Loading financial statements..." />
      </AdminLayout>
    );
  }

  const payments = paymentsData?.payments || [];
  const paymentTotal = paymentsData?.total || 0;
  const paymentTotalPages = paymentsData?.totalPages || 1;
  const paymentCompletedAmount = payments
    .filter((payment) => payment.status === "completed")
    .reduce((sum, payment) => sum + Number(payment.amount), 0);

  const financialSummary = financialData?.summary || {
    totalShipments: 0,
    costAmountSar: 0,
    costTaxAmountSar: 0,
    sellSubtotalAmountSar: 0,
    sellTaxAmountSar: 0,
    clientTotalAmountSar: 0,
    systemCostTotalAmountSar: 0,
    taxPayableAmountSar: 0,
    revenueExcludingTaxAmountSar: 0,
    marginAmountSar: 0,
    netProfitAmountSar: 0,
    scenarioCounts: {},
  };
  const financialShipments = financialData?.shipments || [];
  const carrierTransactions = financialData?.carrierTransactions || [];
  const financialTotal = financialData?.total || 0;
  const financialTotalPages = financialData?.totalPages || 1;
  const monthlyStatements = financialData?.monthlyStatements || [];
  const hasFinancialFilters =
    scenarioFilter !== "all" ||
    financialSubmittedSearch !== "" ||
    financialDebouncedCarrierName !== "" ||
    clientPaymentFilter !== "all" ||
    carrierPaymentFilter !== "all" ||
    startDateFilter !== "" ||
    endDateFilter !== "";
  const hasPaymentFilters = paymentStatusFilter !== "all" || paymentDebouncedSearch !== "";

  const handleOpenExtraFeesDialog = (shipment: FinancialShipment) => {
    setExtraFeesDialogShipment(shipment);
    setExtraWeightInput(shipment.extraFeesWeightValue > 0 ? shipment.extraFeesWeightValue.toFixed(2) : "");
    setExtraCostInput(shipment.extraFeesCostAmountSar > 0 ? shipment.extraFeesCostAmountSar.toFixed(2) : "");
  };

  const resetCarrierPaymentDialog = () => {
    setCarrierPaymentDialogShipment(null);
    setCarrierPaymentDialogMode("pay");
    setCarrierPaymentReferenceInput("");
    setCarrierPaymentNoteInput("");
  };

  const handleOpenPayCarrierDialog = (shipment: FinancialShipment) => {
    setCarrierPaymentDialogShipment(shipment);
    setCarrierPaymentDialogMode("pay");
    setCarrierPaymentReferenceInput(shipment.carrierPaymentReference || "");
    setCarrierPaymentNoteInput(shipment.carrierPaymentNote || "");
  };

  const handleOpenViewCarrierPaymentDialog = (shipment: FinancialShipment) => {
    setCarrierPaymentDialogShipment(shipment);
    setCarrierPaymentDialogMode("view");
    setCarrierPaymentReferenceInput(shipment.carrierPaymentReference || "");
    setCarrierPaymentNoteInput(shipment.carrierPaymentNote || "");
  };

  const handleSubmitFinancialSearch = (event?: FormEvent) => {
    event?.preventDefault();
    setFinancialSubmittedSearch(financialSearchInput.trim());
    setFinancialPage(1);
  };

  const handleRefresh = () => {
    refetchFinancial();
    refetchPayments();
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Financial Statements</h1>
            <p className="text-muted-foreground">
              Review shipment accounting, monthly tax exposure, client and carrier settlement status, and shipment-level adjustments in SAR.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={financialFetching || paymentsFetching}
            data-testid="button-refresh-financials"
          >
            <RefreshCw
              className={cn(
                "h-4 w-4 mr-2",
                (financialFetching || paymentsFetching) && "animate-spin",
              )}
            />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Shipments In Period</p>
                  <p className="text-xl font-bold">{financialSummary.totalShipments}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-950 rounded-lg">
                  <Receipt className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Gross Billed</p>
                  <p className="text-xl font-bold"><SarAmount amount={financialSummary.clientTotalAmountSar} /></p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-950 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-300" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Revenue Excl. Tax</p>
                  <p className="text-xl font-bold"><SarAmount amount={financialSummary.revenueExcludingTaxAmountSar} /></p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-950 rounded-lg">
                  <Landmark className="h-5 w-5 text-amber-600 dark:text-amber-300" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Net Tax Payable</p>
                  <p className="text-xl font-bold"><SarAmount amount={financialSummary.taxPayableAmountSar} /></p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-100 dark:bg-slate-900 rounded-lg">
                  <SarSymbol size="sm" className="text-slate-700 dark:text-slate-200" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Carrier Cost Total</p>
                  <p className="text-xl font-bold"><SarAmount amount={financialSummary.systemCostTotalAmountSar} /></p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-950 rounded-lg">
                  <WalletCards className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Net Profit</p>
                  <p className="text-xl font-bold"><SarAmount amount={financialSummary.netProfitAmountSar} /></p>
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
                Shipment Accounting Filters
              </CardTitle>
              {hasFinancialFilters && (
                <Button variant="ghost" size="sm" onClick={clearFinancialFilters} data-testid="button-clear-financial-filters">
                  <X className="h-4 w-4 mr-1" />
                  Clear All
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="grid gap-4 xl:grid-cols-10">
                <form className="space-y-2 xl:col-span-5" onSubmit={handleSubmitFinancialSearch}>
                  <Label htmlFor="input-search-financial-shipments">Search</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="input-search-financial-shipments"
                        placeholder="Search shipment IDs, tracking IDs, clients, or comma-separated shipment IDs..."
                        value={financialSearchInput}
                        onChange={(e) => setFinancialSearchInput(e.target.value)}
                        className="pl-10"
                        data-testid="input-search-financial-shipments"
                      />
                    </div>
                    <Button type="submit" variant="outline" data-testid="button-submit-financial-search">
                      Search
                    </Button>
                  </div>
                </form>
                <div className="space-y-2 xl:col-span-3">
                  <Label htmlFor="input-financial-carrier-name">Carrier Name</Label>
                  <Input
                    id="input-financial-carrier-name"
                    placeholder="Filter by carrier name..."
                    value={carrierNameFilter}
                    onChange={(e) => setCarrierNameFilter(e.target.value)}
                    data-testid="input-financial-carrier-name"
                  />
                </div>
                <div className="space-y-2 xl:col-span-2">
                  <Label htmlFor="select-financial-scenario">Scenario</Label>
                  <Select
                    value={scenarioFilter}
                    onValueChange={(value) => {
                      setScenarioFilter(value);
                      setFinancialPage(1);
                    }}
                  >
                    <SelectTrigger id="select-financial-scenario" data-testid="select-financial-scenario">
                      <SelectValue placeholder="Scenario" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Scenarios</SelectItem>
                      <SelectItem value="DCE">DCE Domestic</SelectItem>
                      <SelectItem value="IMPORT">Import</SelectItem>
                      <SelectItem value="EXPORT">Export</SelectItem>
                      <SelectItem value="DDP">DDP Import</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-12">
                <div className="space-y-2 xl:col-span-3">
                  <Label htmlFor="select-client-payment-status">Client Payment</Label>
                  <Select
                    value={clientPaymentFilter}
                    onValueChange={(value: PaymentFilterValue) => {
                      setClientPaymentFilter(value);
                      setFinancialPage(1);
                    }}
                  >
                    <SelectTrigger id="select-client-payment-status" data-testid="select-client-payment-status">
                      <SelectValue placeholder="Client payment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Clients</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="not_paid">Not Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 xl:col-span-3">
                  <Label htmlFor="select-carrier-payment-status">Carrier Payment</Label>
                  <Select
                    value={carrierPaymentFilter}
                    onValueChange={(value: PaymentFilterValue) => {
                      setCarrierPaymentFilter(value);
                      setFinancialPage(1);
                    }}
                  >
                    <SelectTrigger id="select-carrier-payment-status" data-testid="select-carrier-payment-status">
                      <SelectValue placeholder="Carrier payment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Carriers</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="not_paid">Not Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 xl:col-span-6">
                  <Label>Date Range</Label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      id="input-financial-start-date"
                      type="date"
                      value={startDateFilter}
                      onChange={(e) => {
                        setStartDateFilter(e.target.value);
                        setFinancialPage(1);
                      }}
                      data-testid="input-financial-start-date"
                    />
                    <Input
                      id="input-financial-end-date"
                      type="date"
                      value={endDateFilter}
                      onChange={(e) => {
                        setEndDateFilter(e.target.value);
                        setFinancialPage(1);
                      }}
                      data-testid="input-financial-end-date"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              Use commas to search multiple shipments at once, then press Search or Enter to apply. When no date range is set, the schedule stays on all matching shipments and the monthly summary spans the matching shipment history.
            </div>
            {hasInvalidFinancialDateRange && (
              <p className="text-xs text-destructive">
                End date must be on or after the start date.
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
              {Object.entries(financialSummary.scenarioCounts).length > 0 ? (
                Object.entries(financialSummary.scenarioCounts).map(([scenario, count]) => (
                  <Badge key={scenario} variant="outline">
                    {formatScenarioLabel(scenario)}: {count}
                  </Badge>
                ))
              ) : (
                <span>No accounting shipments found for the selected filters.</span>
              )}
            </div>
            {financialData && financialData.excludedLegacyShipmentCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {financialData.excludedLegacyShipmentCount} legacy shipment
                {financialData.excludedLegacyShipmentCount === 1 ? "" : "s"} without accounting snapshots are
                excluded from these statements.
              </p>
            )}
          </CardContent>
        </Card>

        <Collapsible open={isMonthlySummaryOpen} onOpenChange={setIsMonthlySummaryOpen}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <CardTitle>Monthly Tax and Revenue Summary</CardTitle>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    data-testid="button-toggle-monthly-summary"
                  >
                    {isMonthlySummaryOpen ? "Hide" : "Show"}
                    <ChevronDown className={cn("ml-2 h-4 w-4 transition-transform", isMonthlySummaryOpen && "rotate-180")} />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="p-0 overflow-x-auto">
                {monthlyStatements.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead>Shipments</TableHead>
                        <TableHead>Gross Billed</TableHead>
                        <TableHead>Revenue Excl. Tax</TableHead>
                        <TableHead>Sell Tax</TableHead>
                        <TableHead>Cost Tax</TableHead>
                        <TableHead>Net Tax Payable</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlyStatements.map((statement) => (
                        <TableRow key={`${statement.year}-${statement.month}`} data-testid={`row-month-${statement.year}-${statement.month}`}>
                          <TableCell className="font-medium">{statement.label}</TableCell>
                          <TableCell>{statement.totalShipments}</TableCell>
                          <TableCell><SarAmount amount={statement.clientTotalAmountSar} /></TableCell>
                          <TableCell><SarAmount amount={statement.revenueExcludingTaxAmountSar} /></TableCell>
                          <TableCell><SarAmount amount={statement.sellTaxAmountSar} /></TableCell>
                          <TableCell><SarAmount amount={statement.costTaxAmountSar} /></TableCell>
                          <TableCell><SarAmount amount={statement.taxPayableAmountSar} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-8 text-center text-muted-foreground">No monthly statement data available yet.</div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Card>
          <CardHeader>
            <CardTitle>Shipment Accounting Detail</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {financialShipments.length > 0 ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Created</TableHead>
                      <TableHead>Shipment ID</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Scenario</TableHead>
                      <TableHead>Carrier Cost</TableHead>
                      <TableHead>Cost Tax</TableHead>
                      <TableHead>Revenue Excl. Tax</TableHead>
                      <TableHead>Tax</TableHead>
                      <TableHead>Gross Total</TableHead>
                      <TableHead>Net Tax</TableHead>
                      <TableHead>Net Profit</TableHead>
                      <TableHead>Extra Fees</TableHead>
                      <TableHead>Weight</TableHead>
                      <TableHead>Carrier Tracking</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {financialShipments.map((shipment) => (
                      <TableRow
                        key={shipment.id}
                        data-testid={`row-financial-shipment-${shipment.id}`}
                        className={shipment.isCancelledFinancially ? "opacity-75" : ""}
                      >
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(shipment.createdAt), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-mono text-sm">{shipment.trackingNumber}</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-xs text-muted-foreground">
                                {shipment.senderCountry} to {shipment.recipientCountry}
                              </p>
                              {shipment.status === "cancelled" && (
                                <Badge variant="destructive">Cancelled</Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="text-sm font-medium">{shipment.clientName}</p>
                            {shipment.clientAccountNumber && (
                              <p className="text-xs text-muted-foreground">{shipment.clientAccountNumber}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{formatScenarioLabel(shipment.taxScenario)}</Badge>
                        </TableCell>
                        <TableCell
                          className={cn(
                            shipment.isCarrierPaid && shipment.costAmountSar > 0 && "text-green-600 dark:text-green-400 font-semibold",
                          )}
                        >
                          <SarAmount amount={shipment.costAmountSar || 0} />
                        </TableCell>
                        <TableCell
                          className={cn(
                            shipment.isCarrierPaid && shipment.costTaxAmountSar > 0 && "text-green-600 dark:text-green-400 font-semibold",
                          )}
                        >
                          <SarAmount amount={shipment.costTaxAmountSar || 0} />
                        </TableCell>
                        <TableCell><SarAmount amount={shipment.revenueExcludingTaxAmountSar || 0} /></TableCell>
                        <TableCell><SarAmount amount={shipment.sellTaxAmountSar || 0} /></TableCell>
                        <TableCell
                          className={cn(
                            shipment.isClientPaid && shipment.clientTotalAmountSar > 0 && "text-green-600 dark:text-green-400 font-semibold",
                          )}
                        >
                          <SarAmount amount={shipment.clientTotalAmountSar || shipment.finalPrice} />
                        </TableCell>
                        <TableCell><SarAmount amount={shipment.taxPayableAmountSar || 0} /></TableCell>
                        <TableCell><SarAmount amount={shipment.netProfitAmountSar || 0} /></TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p
                              className={cn(
                                shipment.extraWeightAmountSar > 0 &&
                                  shipment.isExtraWeightPaid &&
                                  shipment.extraFeesAmountSar > 0 &&
                                  "text-green-600 dark:text-green-400 font-semibold",
                              )}
                            >
                              <SarAmount amount={shipment.extraFeesAmountSar || 0} />
                            </p>
                            <div className="flex flex-wrap items-center gap-1">
                              {shipment.extraFeesType && (
                                <Badge variant="secondary" className="text-[10px]">
                                  {formatExtraFeesTypeLabel(shipment.extraFeesType)}
                                </Badge>
                              )}
                              {shipment.extraFeesType === "EXTRA_WEIGHT" && shipment.isExtraWeightPaid && (
                                <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                  Paid
                                </Badge>
                              )}
                              {(shipment.extraFeesType === "EXTRA_COST" || shipment.extraFeesType === "COMBINED") &&
                                shipment.extraFeesCostAmountSar > 0 && (
                                  <Badge variant="outline" className="text-[10px]">
                                    Internal Cost
                                  </Badge>
                                )}
                            </div>
                            {shipment.extraFeesWeightValue > 0 && (
                              <p
                                className={cn(
                                  "text-[10px] text-muted-foreground",
                                  shipment.isExtraWeightPaid &&
                                    "text-green-600 dark:text-green-400 font-medium",
                                )}
                              >
                                Weight: {shipment.extraFeesWeightValue.toFixed(2)} {shipment.weightUnit || "KG"}
                                {shipment.isExtraWeightPaid ? " · Paid" : ""}
                              </p>
                            )}
                            {shipment.extraFeesCostAmountSar > 0 && (
                              <p className="text-[10px] text-muted-foreground">
                                Internal cost: <SarAmount amount={shipment.extraFeesCostAmountSar} />
                              </p>
                            )}
                            {canUpdateShipments && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2"
                                onClick={() => handleOpenExtraFeesDialog(shipment)}
                                data-testid={`button-edit-extra-fees-${shipment.id}`}
                              >
                                <PencilLine className="mr-1 h-3 w-3" />
                                {shipment.extraFeesType ? "Edit" : "Add"}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {shipment.weightValue > 0 ? `${shipment.weightValue.toFixed(2)} ${shipment.weightUnit || "KG"}` : "-"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {shipment.carrierTrackingId || "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-2">
                            {canManageClientPayments && shipment.canMarkPaid && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => markPaidMutation.mutate(shipment.id)}
                                disabled={markPaidMutation.isPending}
                                data-testid={`button-mark-financial-shipment-paid-${shipment.id}`}
                              >
                                Mark Paid
                              </Button>
                            )}
                            {canManageClientPayments && shipment.canMarkCarrierPaid && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenPayCarrierDialog(shipment)}
                                disabled={markCarrierPaidMutation.isPending}
                                data-testid={`button-mark-financial-shipment-carrier-paid-${shipment.id}`}
                              >
                                Pay Carrier
                              </Button>
                            )}
                            {canManageClientPayments && shipment.canViewCarrierPayment && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleOpenViewCarrierPaymentDialog(shipment)}
                                data-testid={`button-view-financial-shipment-carrier-payment-${shipment.id}`}
                              >
                                View Carrier Payment
                              </Button>
                            )}
                            {canCancelShipments && shipment.canCancel && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  if (window.confirm(`Cancel shipment ${shipment.trackingNumber}?`)) {
                                    cancelShipmentMutation.mutate(shipment.id);
                                  }
                                }}
                                disabled={cancelShipmentMutation.isPending}
                                data-testid={`button-cancel-financial-shipment-${shipment.id}`}
                              >
                                <Ban className="mr-1 h-3 w-3" />
                                Cancel
                              </Button>
                            )}
                            {!shipment.canMarkPaid && !shipment.canMarkCarrierPaid && !shipment.canViewCarrierPayment && !shipment.canCancel && (
                              <span className="text-xs text-muted-foreground">No actions</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <PaginationControls
                  page={financialPage}
                  totalPages={financialTotalPages}
                  total={financialTotal}
                  pageSize={financialPageSize}
                  onPageChange={setFinancialPage}
                  onPageSizeChange={(size) => {
                    setFinancialPageSize(size);
                    setFinancialPage(1);
                  }}
                />
              </>
            ) : (
              <div className="p-8 text-center text-muted-foreground">No shipment accounting records found for the current filters.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Payment Transaction Filters
              </CardTitle>
              {hasPaymentFilters && (
                <Button variant="ghost" size="sm" onClick={clearPaymentFilters} data-testid="button-clear-payment-filters">
                  <X className="h-4 w-4 mr-1" />
                  Clear All
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search payments..."
                  value={paymentSearchQuery}
                  onChange={(e) => setPaymentSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-payments"
                />
              </div>
              <Select
                value={paymentStatusFilter}
                onValueChange={(value) => {
                  setPaymentStatusFilter(value);
                  setPaymentPage(1);
                }}
              >
                <SelectTrigger className="w-[150px]" data-testid="select-payment-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <SarSymbol size="sm" className="text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Payments</p>
                  <p className="text-xl font-bold">{paymentTotal}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Completed In View</p>
                  <p className="text-xl font-bold">{payments.filter((payment) => payment.status === "completed").length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                  <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pending In View</p>
                  <p className="text-xl font-bold">{payments.filter((payment) => payment.status === "pending").length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <Receipt className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Collected In View</p>
                  <p className="text-xl font-bold"><SarAmount amount={paymentCompletedAmount} /></p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Payment Transactions</CardTitle>
          </CardHeader>
          <Collapsible open={paymentTransactionsOpen} onOpenChange={setPaymentTransactionsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between rounded-none border-t px-6 py-4">
                <span className="text-sm font-medium">
                  {paymentTransactionsOpen ? "Hide schedule" : "Show schedule"}
                </span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", paymentTransactionsOpen && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-0 overflow-x-auto">
                {payments.length > 0 ? (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Invoice ID</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Transaction ID</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payments.map((payment) => {
                          const StatusIcon = statusIcons[payment.status] || Clock;
                          return (
                            <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                              <TableCell className="text-sm text-muted-foreground">
                                {format(new Date(payment.createdAt), "MMM d, yyyy HH:mm")}
                              </TableCell>
                              <TableCell className="font-mono text-sm">{payment.invoiceId.slice(0, 8)}...</TableCell>
                              <TableCell className="font-bold"><SarAmount amount={payment.amount} /></TableCell>
                              <TableCell>
                                <Badge variant="outline">{payment.paymentMethod}</Badge>
                              </TableCell>
                              <TableCell>
                                <Badge className={statusColors[payment.status] || ""}>
                                  <StatusIcon className="h-3 w-3 mr-1" />
                                  {payment.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-sm text-muted-foreground">
                                {payment.transactionId || "-"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    <PaginationControls
                      page={paymentPage}
                      totalPages={paymentTotalPages}
                      total={paymentTotal}
                      pageSize={paymentPageSize}
                      onPageChange={setPaymentPage}
                      onPageSizeChange={(size) => {
                        setPaymentPageSize(size);
                        setPaymentPage(1);
                      }}
                    />
                  </>
                ) : (
                  <div className="p-8 text-center text-muted-foreground">No payments found</div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Carrier Payment Transactions</CardTitle>
          </CardHeader>
          <Collapsible open={carrierTransactionsOpen} onOpenChange={setCarrierTransactionsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between rounded-none border-t px-6 py-4">
                <span className="text-sm font-medium">
                  {carrierTransactionsOpen ? "Hide schedule" : "Show schedule"}
                </span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", carrierTransactionsOpen && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-0 overflow-x-auto">
                {carrierTransactions.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Paid At</TableHead>
                        <TableHead>Carrier</TableHead>
                        <TableHead>Shipment</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Carrier Cost</TableHead>
                        <TableHead>Carrier Tax</TableHead>
                        <TableHead>Total Paid</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Tracking</TableHead>
                        <TableHead>Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {carrierTransactions.map((transaction) => (
                        <TableRow
                          key={`${transaction.shipmentId}-${transaction.carrierPaidAt || transaction.createdAt}`}
                          data-testid={`row-carrier-transaction-${transaction.shipmentId}`}
                        >
                          <TableCell className="text-sm text-muted-foreground">
                            {transaction.carrierPaidAt
                              ? format(new Date(transaction.carrierPaidAt), "MMM d, yyyy HH:mm")
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="text-sm font-medium">{transaction.carrierName}</p>
                              {transaction.carrierCode && (
                                <p className="text-xs text-muted-foreground">{transaction.carrierCode}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-mono text-sm">{transaction.trackingNumber}</p>
                              {transaction.taxScenario && (
                                <Badge variant="outline">{formatScenarioLabel(transaction.taxScenario)}</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="text-sm font-medium">{transaction.clientName}</p>
                              {transaction.clientAccountNumber && (
                                <p className="text-xs text-muted-foreground">{transaction.clientAccountNumber}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-green-600 dark:text-green-400 font-semibold">
                            <SarAmount amount={transaction.carrierCostAmountSar} />
                          </TableCell>
                          <TableCell className="text-green-600 dark:text-green-400 font-semibold">
                            <SarAmount amount={transaction.carrierTaxAmountSar} />
                          </TableCell>
                          <TableCell className="font-semibold">
                            <SarAmount amount={transaction.carrierPaymentAmountSar} />
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {transaction.carrierPaymentReference || "-"}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {transaction.carrierTrackingId || "-"}
                          </TableCell>
                          <TableCell className="max-w-[280px] text-sm text-muted-foreground">
                            <div className="line-clamp-2">
                              {transaction.carrierPaymentNote || "No note added."}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    No carrier payment transactions found for the current filters.
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      </div>

      <Dialog
        open={!!carrierPaymentDialogShipment}
        onOpenChange={(open) => {
          if (!open) {
            resetCarrierPaymentDialog();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {carrierPaymentDialogMode === "pay" ? "Pay Carrier" : "Carrier Payment"}
            </DialogTitle>
            <DialogDescription>
              {carrierPaymentDialogMode === "pay"
                ? "Record the carrier settlement details for this shipment. Carrier payment always equals carrier cost plus cost tax."
                : "Review the stored carrier settlement details for this shipment."}
            </DialogDescription>
          </DialogHeader>
          {carrierPaymentDialogShipment && (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label>Shipment</Label>
                <p className="font-mono text-sm">{carrierPaymentDialogShipment.trackingNumber}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3 text-sm">
                  <p className="text-muted-foreground">Carrier Cost</p>
                  <p className="font-semibold">
                    <SarAmount amount={carrierPaymentDialogShipment.costAmountSar || 0} />
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <p className="text-muted-foreground">Cost Tax</p>
                  <p className="font-semibold">
                    <SarAmount amount={carrierPaymentDialogShipment.costTaxAmountSar || 0} />
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <p className="text-muted-foreground">Carrier Payment Total</p>
                  <p className="font-semibold">
                    <SarAmount
                      amount={
                        carrierPaymentDialogMode === "view"
                          ? (carrierPaymentDialogShipment.carrierPaymentAmountSar || carrierPaymentDialogShipment.systemCostTotalAmountSar || 0)
                          : (carrierPaymentDialogShipment.systemCostTotalAmountSar || 0)
                      }
                    />
                  </p>
                </div>
              </div>
              {carrierPaymentDialogMode === "pay" ? (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="input-carrier-payment-reference">Payment Reference</Label>
                    <Input
                      id="input-carrier-payment-reference"
                      value={carrierPaymentReferenceInput}
                      onChange={(e) => setCarrierPaymentReferenceInput(e.target.value)}
                      placeholder="Reference number"
                      data-testid="input-carrier-payment-reference"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="input-carrier-payment-note">Note</Label>
                    <Textarea
                      id="input-carrier-payment-note"
                      value={carrierPaymentNoteInput}
                      onChange={(e) => setCarrierPaymentNoteInput(e.target.value)}
                      placeholder="Add an internal note about this carrier payment..."
                      rows={4}
                      data-testid="input-carrier-payment-note"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid gap-2">
                    <Label>Payment Reference</Label>
                    <p className="text-sm">{carrierPaymentDialogShipment.carrierPaymentReference || "-"}</p>
                  </div>
                  <div className="grid gap-2">
                    <Label>Note</Label>
                    <div className="rounded-lg border p-3 text-sm text-muted-foreground whitespace-pre-wrap">
                      {carrierPaymentDialogShipment.carrierPaymentNote || "No note added."}
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label>Carrier Tracking</Label>
                      <p className="font-mono text-sm">{carrierPaymentDialogShipment.carrierTrackingId || "-"}</p>
                    </div>
                    <div>
                      <Label>Paid At</Label>
                      <p className="text-sm">
                        {carrierPaymentDialogShipment.carrierPaidAt
                          ? format(new Date(carrierPaymentDialogShipment.carrierPaidAt), "MMM d, yyyy 'at' h:mm a")
                          : "-"}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            {carrierPaymentDialogMode === "view" && carrierPaymentDialogShipment && canManageClientPayments && (
              <Button
                variant="destructive"
                onClick={() => cancelCarrierPaymentMutation.mutate(carrierPaymentDialogShipment.id)}
                disabled={cancelCarrierPaymentMutation.isPending}
                data-testid="button-cancel-carrier-payment"
              >
                Cancel Carrier Payment
              </Button>
            )}
            <Button variant="outline" onClick={resetCarrierPaymentDialog}>
              Close
            </Button>
            {carrierPaymentDialogMode === "pay" && carrierPaymentDialogShipment && (
              <Button
                onClick={() =>
                  markCarrierPaidMutation.mutate({
                    shipmentId: carrierPaymentDialogShipment.id,
                    paymentReference: carrierPaymentReferenceInput.trim(),
                    paymentNote: carrierPaymentNoteInput.trim(),
                  })
                }
                disabled={
                  markCarrierPaidMutation.isPending ||
                  carrierPaymentReferenceInput.trim().length === 0 ||
                  carrierPaymentNoteInput.trim().length === 0
                }
                data-testid="button-save-carrier-payment"
              >
                Save Carrier Payment
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!extraFeesDialogShipment}
        onOpenChange={(open) => {
          if (!open) {
            setExtraFeesDialogShipment(null);
            setExtraWeightInput("");
            setExtraCostInput("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Extra Fees</DialogTitle>
            <DialogDescription>
              Add extra weight, manual extra cost, or both for this shipment. Extra weight is billed to the client, while extra cost stays as an internal system cost only.
            </DialogDescription>
          </DialogHeader>
          {extraFeesDialogShipment && (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label>Shipment</Label>
                <p className="font-mono text-sm">{extraFeesDialogShipment.trackingNumber}</p>
              </div>
              <div className="grid gap-2">
                <Label>Current Rate</Label>
                <p className="text-sm text-muted-foreground">
                  <SarAmount amount={getExtraFeesRate(extraFeesDialogShipment)} /> per {extraFeesDialogShipment.weightUnit || "KG"} = gross total / total weight
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="extra-weight-input">Extra Weight</Label>
                <Input
                  id="extra-weight-input"
                  inputMode="decimal"
                  value={extraWeightInput}
                  onChange={(e) => setExtraWeightInput(e.target.value)}
                  placeholder={`0.00 ${extraFeesDialogShipment.weightUnit || "KG"}`}
                  data-testid="input-extra-fees-weight"
                />
                <p className="text-xs text-muted-foreground">
                  Calculated weight-based fees:
                  {" "}
                  <SarAmount
                    amount={roundMoney((Number(extraWeightInput) || 0) * getExtraFeesRate(extraFeesDialogShipment))}
                  />
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="extra-cost-input">Extra Cost</Label>
                <Input
                  id="extra-cost-input"
                  inputMode="decimal"
                  value={extraCostInput}
                  onChange={(e) => setExtraCostInput(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-extra-fees-cost"
                />
                <p className="text-xs text-muted-foreground">
                  Manual extra cost added on top of any weight-based adjustment.
                </p>
              </div>
              <div className="rounded-lg border p-3 text-sm">
                Total extra fees after save:{" "}
                <span className="font-semibold">
                  <SarAmount
                    amount={roundMoney(
                      ((Number(extraWeightInput) || 0) * getExtraFeesRate(extraFeesDialogShipment)) +
                      (Number(extraCostInput) || 0),
                    )}
                  />
                </span>
              </div>
              {extraFeesDialogShipment.extraFeesEmailSentAt && (
                <p className="text-xs text-muted-foreground">
                  Last client email sent {format(new Date(extraFeesDialogShipment.extraFeesEmailSentAt), "MMM d, yyyy 'at' h:mm a")}
                </p>
              )}
              {extraFeesDialogShipment.extraFeesAddedAt && (
                <p className="text-xs text-muted-foreground">
                  Last extra fee update {format(new Date(extraFeesDialogShipment.extraFeesAddedAt), "MMM d, yyyy 'at' h:mm a")}
                </p>
              )}
              {extraFeesDialogShipment.extraFeesAmountSar > 0 && (
                <div className="rounded-lg border p-3 text-sm">
                  Current stored amount: <SarAmount amount={extraFeesDialogShipment.extraFeesAmountSar || 0} />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Saving this will notify the client only when extra weight is billed, create or update the extra-weight invoice when needed, and keep manual extra cost as an internal system charge.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            {extraFeesDialogShipment && extraFeesDialogShipment.extraFeesAmountSar > 0 && (
              <Button
                variant="outline"
                onClick={() =>
                  updateExtraFeesMutation.mutate({
                    shipmentId: extraFeesDialogShipment.id,
                    clear: true,
                  })
                }
                disabled={updateExtraFeesMutation.isPending}
                data-testid="button-clear-extra-fees"
              >
                Clear Extra Fees
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setExtraFeesDialogShipment(null);
                setExtraWeightInput("");
                setExtraCostInput("");
              }}
            >
              Close
            </Button>
            {extraFeesDialogShipment && (
              <Button
                onClick={() =>
                  updateExtraFeesMutation.mutate({
                    shipmentId: extraFeesDialogShipment.id,
                    extraWeightValue: extraWeightInput,
                    extraCostAmountSar: extraCostInput,
                  })
                }
                disabled={updateExtraFeesMutation.isPending}
                data-testid="button-save-extra-fees"
              >
                Save Extra Fees
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
