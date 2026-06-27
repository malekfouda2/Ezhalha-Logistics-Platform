import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  DollarSign,
  FileText,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Package,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Truck,
  Users,
} from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { OperationsLayout } from "@/components/operations-layout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { apiRequest, queryClient, readJsonResponse } from "@/lib/queryClient";

type ViewKey = "d2d" | "express" | "attention" | "special" | "delivered";
type NoteVisibility = "INTERNAL" | "CLIENT";
type CommunicationChannel = "whatsapp" | "sms" | "email";
type OpsSelectOption = {
  value: string;
  label: string;
};

interface OperationSummary {
  ddpCount: number;
  expressCount: number;
  attentionCount: number;
  specialHandlingCount: number;
  deliveredCount: number;
  operationsUserCount: number;
}

interface OperationParty {
  name: string;
  city: string;
  country: string;
  phone: string;
  address: string;
}

interface OperationTask {
  id: string;
  taskKey?: string | null;
  title: string;
  description?: string | null;
  stageKey: string;
  status: string;
  completedAt?: string | null;
  metadata?: string | null;
}

interface OperationEvent {
  id: string;
  title: string;
  description?: string | null;
  eventType: string;
  createdAt: string;
}

interface OperationNote {
  id: string;
  body: string;
  visibility: string;
  authorName?: string | null;
  createdAt: string;
}

interface AttentionFlag {
  id: string;
  issueType: string;
  severity: string;
  details?: string | null;
  detectedAt: string;
}

interface SpecialHandling {
  id: string;
  priority: string;
  reason: string;
  notes?: string | null;
  status: string;
  assignedToUserId?: string | null;
  assignedToName?: string | null;
}

interface AssignedTeamMember {
  userId: string;
  username: string;
  email: string;
  displayName: string;
  level?: string | null;
  assignedAt?: string | null;
  isPrimary: boolean;
}

interface OperationShipmentSummary {
  id: string;
  trackingNumber: string;
  clientName: string;
  shipmentKind: "DDP" | "EXPRESS";
  ddpCurrentStage?: number | null;
  status: string;
  carrierStatus?: string | null;
  carrierCode?: string | null;
  carrierName?: string | null;
  carrierTrackingNumber?: string | null;
  finalPrice: string;
  currency?: string | null;
  paymentStatus?: string | null;
  assignedToUserId?: string | null;
  assignedToName?: string | null;
  assignedTeam: AssignedTeamMember[];
  specialHandlingPriority?: string | null;
  specialHandling?: SpecialHandling | null;
  attentionFlags?: AttentionFlag[];
  attentionCount: number;
  carrierStatusRepeatCount?: number;
  duplicateStatus?: boolean;
  statusChangedAt?: string | null;
  sender: OperationParty;
  recipient: OperationParty;
  serviceType?: string | null;
  estimatedDelivery?: string | null;
  actualDelivery?: string | null;
  updatedAt: string;
  createdAt: string;
}

interface OperationShipmentDetail extends OperationShipmentSummary {
  operationTasks: OperationTask[];
  operationEvents: OperationEvent[];
  operationNotes: OperationNote[];
  ddpChargeConfig?: {
    billingUnit: "KG" | "CBM";
    chargeLabel: string;
    currentBillableQuantity: string;
    currentRawQuantity: string;
    currentMeasuredQuantity: string;
    currentRatePerUnitSar: string;
    extraWeightQuantity: string;
    extraWeightAmountSar: string;
    extraCostAmountSar: string;
    customChargesAmountSar: string;
    totalAdjustmentsAmountSar: string;
  };
  financialBreakdown?: Record<string, string | null>;
}

interface OperationUser {
  id: string;
  username: string;
  email: string;
  isActive: boolean;
  operationProfile?: { level?: string; canReceiveAssignments?: boolean } | null;
}

interface UploadedAsset {
  name: string;
  path: string;
  size?: number;
  contentType?: string;
}

interface ExtraWeightPreview {
  billingUnit: "KG" | "CBM";
  baseMeasuredQuantity: number;
  currentMeasuredQuantity: number;
  targetMeasuredQuantity: number;
  currentExtraWeightQuantity: number;
  targetExtraWeightQuantity: number;
  currentExtraWeightAmountSar: number;
  amountSar: number;
  deltaAmountSar: number;
  rateSarPerUnit: number;
}

interface OperationsHubProps {
  layout?: "admin" | "operations";
}

const views: Record<ViewKey, {
  title: string;
  sub: string;
  short: string;
  queue: string;
  countKey: keyof OperationSummary;
  icon: typeof Package;
}> = {
  d2d: {
    title: "D2D Shipment Operations",
    sub: "Track every stage from planning to proof of delivery",
    short: "Door to Door",
    queue: "ddp",
    countKey: "ddpCount",
    icon: Package,
  },
  express: {
    title: "Express Shipment Operations",
    sub: "Full carrier-integrated tracking - Received, Transit, Last Mile, Customs",
    short: "Express shipments",
    queue: "express",
    countKey: "expressCount",
    icon: Truck,
  },
  attention: {
    title: "Operations - Needs Attention",
    sub: "Shipments with stale updates, repeated statuses, carrier errors, or stage delays",
    short: "Needs attention",
    queue: "attention",
    countKey: "attentionCount",
    icon: AlertTriangle,
  },
  special: {
    title: "Operations - Special Handling",
    sub: "Urgent and priority shipments requiring close monitoring",
    short: "Special handling",
    queue: "special",
    countKey: "specialHandlingCount",
    icon: Sparkles,
  },
  delivered: {
    title: "Operations - Delivered Shipments",
    sub: "Completed DDP and Express shipments kept visible for follow-up, proof, and record keeping",
    short: "Delivered",
    queue: "delivered",
    countKey: "deliveredCount",
    icon: CheckCircle2,
  },
};

const d2dStages = ["Planning", "Warehouse", "Billing", "Shipping", "Delivery"] as const;
const d2dStageStatus: Record<number, string> = {
  1: "booked",
  2: "processing",
  3: "awaiting_payment",
  4: "in_transit",
  5: "out_for_delivery",
  6: "delivered",
};

const expressTabs = [
  { key: "all", label: "All" },
  { key: "received", label: "Received" },
  { key: "transit", label: "In Transit" },
  { key: "customs", label: "Customs" },
  { key: "lastmile", label: "Last Mile" },
] as const;

const statusOptions = [
  "awaiting_review",
  "booked",
  "created",
  "processing",
  "picked_up",
  "in_transit",
  "customs_clearance",
  "out_for_delivery",
  "delivered",
  "carrier_error",
  "cancelled",
];

const issueLabels: Record<string, string> = {
  carrier_error: "Carrier error",
  no_recent_update: "No update >36h",
  no_operations_agent: "No operator assigned",
  no_update: "No update >24h",
  qc_exception: "QC issue",
  stage_delay: "Stage delay",
  repeat_update: "Repeated status",
};

const specialHandlingReasons = [
  "VIP client — white-glove delivery required",
  "Urgent deadline — time-sensitive delivery",
  "Perishable / temperature-sensitive goods",
  "High-value shipment — extra security",
  "Fragile items — special packaging required",
  "Medical / pharmaceutical goods",
] as const;

const communicationTemplateOptions = [
  { value: "payment", label: "Payment request" },
  { value: "update", label: "General update" },
  { value: "delay", label: "Delay notification" },
  { value: "customs", label: "Customs required action" },
  { value: "delivery", label: "Out for delivery" },
  { value: "custom", label: "Custom message" },
] as const;

const OPS_SELECT_EMPTY_VALUE = "__ops_empty__";

function getCommunicationChannelLabel(channel: CommunicationChannel) {
  if (channel === "sms") return "SMS";
  if (channel === "email") return "Email";
  return "WhatsApp";
}

function OperationsSelect({
  value,
  onChange,
  placeholder,
  options,
  triggerClassName,
  includeEmptyOption = false,
  emptyOptionLabel,
}: {
  value?: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: OpsSelectOption[];
  triggerClassName?: string;
  includeEmptyOption?: boolean;
  emptyOptionLabel?: string;
}) {
  const normalizedValue = value && value.length > 0 ? value : includeEmptyOption ? OPS_SELECT_EMPTY_VALUE : undefined;

  return (
    <Select value={normalizedValue} onValueChange={(next) => onChange(next === OPS_SELECT_EMPTY_VALUE ? "" : next)}>
      <SelectTrigger className={triggerClassName || "!h-6 w-auto rounded-full px-2.5 py-0 text-[10px] font-semibold gap-1 shadow-none [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-60"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeEmptyOption && <SelectItem value={OPS_SELECT_EMPTY_VALUE}>{emptyOptionLabel || placeholder}</SelectItem>}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const operationsCss = `
.ops-ref{--pr:hsl(var(--primary));--pr-lt:hsl(var(--primary) / .12);--pr-dk:color-mix(in srgb,hsl(var(--primary)) 86%,#000);--pr-bd:hsl(var(--primary) / .32);--g25:hsl(var(--background));--g50:hsl(var(--card));--g100:hsl(var(--muted));--g200:hsl(var(--border));--g300:hsl(var(--input));--g400:hsl(var(--muted-foreground) / .8);--g500:hsl(var(--muted-foreground));--g700:hsl(var(--foreground) / .8);--g800:hsl(var(--foreground) / .9);--g900:hsl(var(--foreground));--wh:hsl(var(--background));--shadow:0 1px 2px rgba(15,23,42,.04);--green:#16A34A;--green-lt:#F0FDF4;--green-bd:#BBF7D0;--blue:#1D4ED8;--blue-lt:#EFF6FF;--blue-bd:#BFDBFE;--amber:#D97706;--amber-lt:#FFFBEB;--amber-bd:#FDE68A;--red:#B91C1C;--red-lt:#FEF2F2;--red-bd:#FECACA;--purple:#7C3AED;--purple-lt:#F5F3FF;--purple-bd:#DDD6FE;--r:var(--radius);--rlg:calc(var(--radius) + 4px);display:flex;flex-direction:column;height:100%;min-height:calc(100vh - 4rem);background:var(--g50);color:var(--g900);font-family:inherit;overflow:hidden}
.dark .ops-ref{--shadow:0 1px 2px rgba(0,0,0,.24);--green:#4ADE80;--green-lt:rgba(74,222,128,.12);--green-bd:rgba(74,222,128,.28);--blue:#60A5FA;--blue-lt:rgba(96,165,250,.12);--blue-bd:rgba(96,165,250,.28);--amber:#FBBF24;--amber-lt:rgba(251,191,36,.12);--amber-bd:rgba(251,191,36,.28);--red:#F87171;--red-lt:rgba(248,113,113,.12);--red-bd:rgba(248,113,113,.28);--purple:#C084FC;--purple-lt:rgba(192,132,252,.12);--purple-bd:rgba(192,132,252,.28)}
.ops-ref *{box-sizing:border-box}
.ops-ref button,.ops-ref input,.ops-ref select,.ops-ref textarea{font:inherit}
.ops-ref button:focus-visible,.ops-ref a.btn:focus-visible{outline:2px solid hsl(var(--ring));outline-offset:1px;border-radius:var(--r)}
.ops-topbar{background:var(--wh);border-bottom:1px solid var(--g200);padding:9px 18px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-shrink:0}
.ops-title{font-size:15px;font-weight:800;color:var(--g900);line-height:1.2}
.ops-sub{font-size:11px;color:var(--g400);margin-top:2px}
.ops-topbar-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ops-split{display:flex;flex:1;overflow:hidden;min-width:0;min-height:0}
.list-col{width:296px;min-width:296px;flex-shrink:0;border-right:1px solid var(--g200);background:var(--wh);display:flex;flex-direction:column;overflow:hidden}
.detail-col{flex:1;min-width:0;overflow-y:auto;overflow-x:hidden;background:var(--g50)}
.lp-head{padding:11px;border-bottom:1px solid var(--g200)}
.lp-title{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:var(--g900)}
.lp-title svg{width:15px;height:15px;color:var(--pr)}
.lp-sub{font-size:11px;color:var(--g400);margin-top:4px}
.view-count{color:var(--g400);font-weight:500}
.lp-search{position:relative;margin-top:8px}
.lp-search svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);width:14px;height:14px;color:var(--g400)}
.lp-search input{width:100%;height:36px;border:1px solid var(--g200);border-radius:var(--r);padding:0 12px 0 34px;background:var(--g50);font-size:12px;color:var(--g900);outline:none}
.lp-search input:focus,.field-input:focus,.field-select:focus,.field-textarea:focus,.note-input:focus,.filter-select:focus{border-color:var(--pr);box-shadow:0 0 0 2px var(--pr-lt)}
.chip-row{display:flex;gap:6px;padding:7px 11px;border-bottom:1px solid var(--g200);overflow-x:auto}
.chip-row::-webkit-scrollbar,.tab-bar::-webkit-scrollbar{height:0}
.chip{padding:3px 8px;border-radius:9999px;font-size:10px;font-weight:600;cursor:pointer;white-space:nowrap;border:1px solid var(--g200);color:var(--g500);background:var(--wh);transition:.15s;line-height:1.2}
.chip.active,.chip:hover{background:var(--pr-lt);color:var(--pr);border-color:var(--pr)}
.filter-bar{padding:6px 11px;border-bottom:1px solid var(--g200);display:flex;flex-wrap:wrap;align-items:center;gap:6px;background:var(--g50)}
.filter-bar .chip{height:24px;padding:0 11px;display:inline-flex;align-items:center}
.filter-select{height:27px;border:1px solid var(--g200);border-radius:20px;padding:0 26px 0 10px;font-size:10px;font-weight:600;background:var(--wh);color:var(--g700);outline:none;max-width:135px}
.ship-list{flex:1;overflow-y:auto}
.si{padding:10px 11px;border-bottom:1px solid var(--g100);cursor:pointer;transition:background .15s;text-align:left;background:transparent;width:100%;min-width:0}
.si:hover{background:var(--g50)}
.si.active{background:var(--pr-lt);border-right:3px solid var(--pr)}
.si-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px;min-width:0;flex-wrap:wrap}
.si-id{font-size:11px;font-weight:700;color:var(--pr);line-height:1.2;overflow-wrap:anywhere}
.si-name{font-size:12px;font-weight:700;color:var(--g900);line-height:1.35;overflow-wrap:anywhere;word-break:break-word}
.si-meta{font-size:10px;color:var(--g400);margin-top:3px;line-height:1.45;overflow-wrap:anywhere;word-break:break-word}
.si-money{font-size:11px;font-weight:700;color:var(--g900);margin-top:8px;text-align:right;line-height:1.2}
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 24px;color:var(--g400);gap:10px;font-size:12px}
.dp-header{background:var(--wh);border-bottom:1px solid var(--g200);padding:10px 16px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;position:sticky;top:0;z-index:8}
.dp-id{font-size:12px;font-weight:700;color:var(--pr);margin-bottom:2px;line-height:1.2;overflow-wrap:anywhere}
.dp-name{font-size:17px;font-weight:800;color:var(--g900);line-height:1.18;overflow-wrap:anywhere;word-break:break-word}
.dp-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;min-width:0}
.dp-actions{display:flex;gap:8px;flex-wrap:wrap}
.dp-body{padding:12px 16px}
.dp-grid{display:grid;grid-template-columns:minmax(0,1fr) 296px;gap:12px;align-items:start;min-width:0}
.dp-side{display:flex;flex-direction:column;min-width:0}
.card{background:var(--wh);border:1px solid var(--g200);border-radius:var(--rlg);padding:12px;margin-bottom:10px;box-shadow:var(--shadow);min-width:0}
.card-title{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--g700);margin-bottom:10px;line-height:1.3;min-width:0}
.card-title svg{width:14px;height:14px;color:var(--pr)}
.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700;white-space:nowrap;max-width:100%}
.b-green{background:var(--green-lt);color:var(--green);border:1px solid var(--green-bd)}
.b-blue{background:var(--blue-lt);color:var(--blue);border:1px solid var(--blue-bd)}
.b-amber{background:var(--amber-lt);color:var(--amber);border:1px solid var(--amber-bd)}
.b-red{background:var(--red-lt);color:var(--red);border:1px solid var(--red-bd)}
.b-gray{background:var(--g100);color:var(--g500)}
.b-purple{background:var(--purple-lt);color:var(--purple);border:1px solid var(--purple-bd)}
.b-pr{background:var(--pr-lt);color:var(--pr);border:1px solid var(--pr-bd)}
.btn{border:none;border-radius:var(--r);padding:7px 13px;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:.15s;text-decoration:none;line-height:1.2;min-width:0;box-shadow:var(--shadow)}
.btn svg{width:14px;height:14px}
.btn:disabled{opacity:.55;cursor:not-allowed;box-shadow:none}
.btn:active:not(:disabled){transform:translateY(.5px)}
.btn-sm{padding:5px 10px;font-size:11px}
.btn-xs{padding:3px 8px;font-size:10px;box-shadow:none}
.btn-pr{background:var(--pr);color:hsl(var(--primary-foreground))}.btn-pr:hover{background:var(--pr-dk)}
.btn-gh{background:var(--wh);border:1px solid var(--g200);color:var(--g700)}.btn-gh:hover{background:var(--g100)}
.btn-outline{background:transparent;border:1px solid var(--g200);color:var(--g700)}.btn-outline:hover{background:var(--g50)}
.btn-green{background:var(--green-lt);color:var(--green);border:1px solid var(--green-bd)}
.btn-blue{background:var(--blue-lt);color:var(--blue);border:1px solid var(--blue-bd)}
.btn-amber{background:var(--amber-lt);color:var(--amber);border:1px solid var(--amber-bd)}
.btn-red{background:var(--red-lt);color:var(--red);border:1px solid var(--red-bd)}
.btn-purple{background:var(--purple-lt);color:var(--purple);border:1px solid var(--purple-bd)}
.progress-rail{position:relative;display:flex;align-items:flex-start;justify-content:space-between;padding:0 8px}
.progress-rail::before{content:"";position:absolute;left:8%;right:8%;top:16px;height:2px;background:var(--g200);z-index:0}
.progress-line{position:absolute;left:8%;top:16px;height:2px;background:var(--green);z-index:0;transition:width .3s ease}
.progress-step{display:flex;flex-direction:column;align-items:center;flex:1;position:relative;z-index:1}
.progress-step-dot{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;background:var(--g100);color:var(--g400);border:2px solid var(--g200)}
.progress-step.done .progress-step-dot{background:var(--green);border-color:var(--green);color:#fff}
.progress-step.active .progress-step-dot{background:var(--pr);border-color:var(--pr);color:#fff;box-shadow:0 0 0 4px var(--pr-lt)}
.progress-step-label{font-size:10px;font-weight:600;color:var(--g400);text-align:center;margin-top:6px;max-width:72px;line-height:1.3;overflow-wrap:anywhere}
.progress-step.done .progress-step-label{color:var(--green)}
.progress-step.active .progress-step-label{color:var(--pr)}
.stage-card{background:var(--wh);border:1px solid var(--g200);border-radius:var(--rlg);padding:0;overflow:hidden;margin-bottom:10px}
.stage-head{padding:10px 12px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;gap:10px;min-width:0}
.stage-card.locked .stage-head{cursor:not-allowed;opacity:.72}
.stage-card.active .stage-head{background:var(--pr-lt)}
.stage-left{display:flex;align-items:center;gap:10px;min-width:0}
.stage-num{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;background:var(--g100);color:var(--g400)}
.stage-card.done .stage-num{background:var(--green);color:#fff}
.stage-card.active .stage-num{background:var(--pr);color:#fff}
.stage-title{font-size:12px;font-weight:700;color:var(--g900);line-height:1.35;overflow-wrap:anywhere;word-break:break-word}
.stage-sub{font-size:10px;color:var(--g400);margin-top:2px;line-height:1.35}
.stage-body{padding:12px;border-top:1px solid var(--g100);background:var(--wh)}
.task-item{display:flex;align-items:flex-start;gap:10px;padding:9px 11px;background:var(--g50);border:1px solid var(--g200);border-radius:var(--r);margin-bottom:8px;min-width:0}
.task-item.done{background:var(--green-lt);border-color:var(--green-bd)}
.task-dot{width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;background:var(--wh);border:2px solid var(--g300)}
.task-item.done .task-dot{background:var(--green);border-color:var(--green);color:#fff}
.task-main{font-size:12px;font-weight:600;color:var(--g900);line-height:1.35;overflow-wrap:anywhere}
.task-meta{font-size:10px;color:var(--g400);margin-top:2px;line-height:1.45;overflow-wrap:anywhere}
.checkpoint-stack{display:flex;flex-direction:column;gap:12px;margin-bottom:12px}
.checkpoint-card{border:1px solid var(--g200);border-radius:var(--r);background:var(--g50);padding:12px;min-width:0}
.checkpoint-card.done{background:var(--green-lt);border-color:var(--green-bd)}
.checkpoint-card.locked{opacity:.7}
.checkpoint-head{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px}
.checkpoint-copy{flex:1;min-width:0}
.checkpoint-summary{margin-top:8px;padding:8px 10px;border-radius:var(--r);background:var(--blue-lt);border:1px solid var(--blue-bd);font-size:11px;color:var(--blue);line-height:1.5}
.checkpoint-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.field-hint{font-size:11px;color:var(--g400);line-height:1.45}
.upload-list{display:flex;flex-direction:column;gap:8px;margin-top:10px}
.upload-chip{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--g200);border-radius:var(--r);background:var(--wh)}
.upload-name{font-size:11px;font-weight:600;color:var(--g800);line-height:1.35;overflow-wrap:anywhere;word-break:break-word}
.upload-meta{font-size:10px;color:var(--g500)}
.alert{border-radius:var(--r);padding:9px 11px;font-size:11px;display:flex;align-items:flex-start;gap:8px;margin-bottom:12px;line-height:1.55;min-width:0}
.alert svg{width:14px;height:14px;flex-shrink:0;margin-top:1px}
.alert-amber{background:var(--amber-lt);border:1px solid var(--amber-bd);color:var(--amber)}
.alert-red{background:var(--red-lt);border:1px solid var(--red-bd);color:var(--red)}
.alert-green{background:var(--green-lt);border:1px solid var(--green-bd);color:var(--green)}
.alert-blue{background:var(--blue-lt);border:1px solid var(--blue-bd);color:var(--blue)}
.alert-purple{background:var(--purple-lt);border:1px solid var(--purple-bd);color:var(--purple)}
.sc-row{display:grid;grid-template-columns:minmax(72px,90px) minmax(0,1fr);align-items:flex-start;gap:10px;padding:6px 9px;border-bottom:1px solid var(--g100);font-size:11px;min-width:0}
.sc-row:last-child{border-bottom:none}
.sc-key{color:var(--g400);line-height:1.45;overflow-wrap:anywhere}
.sc-val{font-weight:600;color:var(--g900);text-align:right;line-height:1.45;overflow-wrap:anywhere;word-break:break-word;min-width:0}
.sc-val.orange{color:var(--pr)}.sc-val.green{color:var(--green)}.sc-val.red{color:var(--red)}.sc-val.amber{color:var(--amber)}
.timeline{display:flex;flex-direction:column}
.tl-item{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--g100)}
.tl-item:last-child{border-bottom:none}
.tl-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:4px;background:var(--pr)}
.tl-dot.green{background:var(--green)}.tl-dot.blue{background:var(--blue)}.tl-dot.red{background:var(--red)}.tl-dot.orange{background:var(--pr)}
.tl-msg{font-size:11px;color:var(--g700);font-weight:600;line-height:1.45;overflow-wrap:anywhere}
.tl-time{font-size:10px;color:var(--g400);margin-top:2px}
.track-wrap{display:flex;flex-direction:column;gap:0}
.track-step{display:flex;align-items:flex-start;gap:12px;padding:10px 0;position:relative;min-width:0}
.track-step:not(:last-child)::after{content:"";position:absolute;left:11px;top:28px;width:2px;bottom:-10px;background:var(--g200)}
.track-step.done::after{background:var(--green)}
.track-dot{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;font-weight:700}
.track-dot.done{background:var(--green);color:#fff}
.track-dot.active-step{background:var(--pr);color:#fff;box-shadow:0 0 0 3px var(--pr-lt)}
.track-dot.pending{background:var(--g200);color:var(--g400)}
.track-info{flex:1;min-width:0}
.track-title{font-size:12px;font-weight:600;color:var(--g900);line-height:1.35;overflow-wrap:anywhere}
.track-step.pending .track-title{color:var(--g400)}
.track-sub{font-size:10px;color:var(--g400);margin-top:2px;line-height:1.4}
.tab-bar{display:flex;border-bottom:1px solid var(--g200);margin-bottom:14px;overflow-x:auto}
.tab-btn{padding:9px 12px;font-size:11px;font-weight:600;color:var(--g500);cursor:pointer;border:none;border-bottom:2px solid transparent;margin-bottom:-1px;transition:.15s;white-space:nowrap;display:flex;align-items:center;gap:6px;background:none}
.tab-btn.active{color:var(--pr);border-bottom-color:var(--pr);font-weight:700}
.tab-content{display:block}
.note-box{background:var(--g50);border:1px solid var(--g200);border-radius:var(--r);padding:9px 11px;margin-bottom:8px}
.note-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;gap:8px;flex-wrap:wrap}
.note-author{font-size:11px;font-weight:700;color:var(--g700)}
.note-time{font-size:10px;color:var(--g400)}
.note-text{font-size:11px;color:var(--g700);line-height:1.55;white-space:pre-wrap}
.mention{color:var(--blue);font-weight:700}
.note-input-wrap{display:flex;flex-direction:column;gap:8px;margin-top:10px}
.mention-list{display:flex;gap:6px;flex-wrap:wrap}
.mention-chip{background:var(--blue-lt);color:var(--blue);font-size:11px;font-weight:600;padding:3px 8px;border-radius:20px;cursor:pointer;border:1px solid var(--blue-bd);transition:.15s}
.mention-chip.selected,.mention-chip:hover{background:var(--blue);color:#fff}
.team-stack{display:flex;flex-direction:column;gap:8px}
.team-member{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:flex-start;gap:10px;padding:9px 10px;border:1px solid var(--g200);border-radius:var(--r);background:var(--g50);min-width:0}
.team-copy{flex:1;min-width:0}
.team-name{font-size:12px;font-weight:700;color:var(--g800);line-height:1.35;overflow-wrap:anywhere;word-break:break-word}
.team-meta{font-size:10px;color:var(--g500);line-height:1.45;overflow-wrap:anywhere;word-break:break-word}
.team-member .badge{flex-shrink:0;align-self:flex-start}
.team-selector{display:grid;grid-template-columns:1fr;gap:8px;max-height:220px;overflow-y:auto;padding-right:2px}
.team-toggle{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:flex-start;justify-content:space-between;gap:10px;min-width:0;width:100%;padding:7px 9px;border:1px solid var(--g200);border-radius:var(--r);background:var(--wh);color:var(--g800);font-size:11px;font-weight:600;cursor:pointer;transition:.15s;text-align:left}
.team-toggle.selected{border-color:var(--pr);background:var(--pr-lt);color:var(--pr)}
.team-toggle-name{flex:1;min-width:0;line-height:1.35;overflow-wrap:anywhere;word-break:break-word}
.team-toggle-meta{font-size:10px;font-weight:700;color:var(--g500);text-transform:uppercase;letter-spacing:.04em;flex-shrink:0;align-self:flex-start}
.note-input,.field-textarea{width:100%;min-height:70px;resize:vertical;border:1px solid var(--g200);border-radius:var(--r);padding:8px 10px;font-size:12px;color:var(--g900);background:var(--wh);outline:none}
.field-input,.field-select{width:100%;height:34px;border:1px solid var(--g200);border-radius:var(--r);padding:0 10px;font-size:12px;font-family:inherit;color:var(--g900);background:var(--wh);outline:none}
.field-group{display:flex;flex-direction:column;gap:4px;margin-bottom:12px}
.field-label{font-size:10px;font-weight:700;color:var(--g500);text-transform:uppercase;letter-spacing:.04em}
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;align-items:center;justify-content:center;padding:20px}
.modal-overlay.open{display:flex}
.modal{background:var(--wh);border-radius:var(--rlg);padding:18px;width:100%;max-width:460px;max-height:90vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.25)}
.modal-title{font-size:15px;font-weight:800;margin-bottom:4px;color:var(--g900)}
.modal-sub{font-size:11px;color:var(--g500);margin-bottom:16px}
.modal-body{color:var(--g900)}
.modal-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:18px;padding-top:14px;border-top:1px solid var(--g100)}
.wa-preview{background:#E7FFDB;border:1px solid #C3E6BE;border-radius:var(--r);padding:9px 11px;font-size:11px;color:#111;line-height:1.6}
.dark .wa-preview{background:rgba(74,222,128,.1);border-color:rgba(74,222,128,.25);color:var(--g900)}
.metric-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:12px}
.metric-grid .card{padding:10px}
.action-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
@media(max-width:1280px){.dp-grid{grid-template-columns:minmax(0,1fr) 272px}.list-col{width:280px;min-width:280px}}
@media(max-width:1100px){.ops-ref{overflow:auto}.ops-topbar{padding:12px 14px;align-items:flex-start;flex-direction:column}.ops-split{flex-direction:column;overflow:visible}.list-col{width:100%;min-width:0;border-right:0;border-bottom:1px solid var(--g200);max-height:420px}.detail-col{overflow:visible}.dp-grid{grid-template-columns:1fr}.dp-header{position:static}.dp-actions{width:100%}}
@media(max-width:760px){.metric-grid,.checkpoint-grid{grid-template-columns:1fr}.sc-row{grid-template-columns:1fr}.sc-val{text-align:left}.team-member,.team-toggle,.upload-chip{grid-template-columns:1fr}.team-member .badge,.team-toggle-meta{justify-self:flex-start}.tab-btn{padding:9px 11px}}
@media(max-width:640px){.dp-body{padding:12px}.dp-header{padding:12px 14px}.dp-name{font-size:16px}.ops-topbar{padding:14px}.dp-grid{gap:12px}.dp-actions .btn{flex:1}}
`;

function isViewKey(value: string | null): value is ViewKey {
  return value === "d2d" || value === "express" || value === "attention" || value === "special" || value === "delivered";
}

function listPath(queue: string) {
  return `/api/operations/shipments?queue=${queue}&limit=200`;
}

function getShipmentView(shipment: OperationShipmentSummary | OperationShipmentDetail): ViewKey {
  if (shipment.status?.toLowerCase() === "delivered") {
    return "delivered";
  }
  if (shipment.specialHandling && shipment.specialHandling.status?.toLowerCase() === "open") {
    return "special";
  }
  if (shipment.status === "carrier_error" || (shipment.attentionCount || 0) > 0) {
    return "attention";
  }
  return shipment.shipmentKind === "DDP" ? "d2d" : "express";
}

function invalidateOperations() {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = String(query.queryKey[0] || "");
      return key.startsWith("/api/operations/shipments")
        || key.startsWith("/api/operations/summary");
    },
  });
}

function formatStatus(value?: string | null) {
  if (!value) return "Not set";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return "Pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Pending";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function money(amount?: string | null, currency?: string | null) {
  return `${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || "SAR"}`;
}

function quantity(value?: string | null) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function getMethod(shipment: OperationShipmentSummary) {
  if (shipment.shipmentKind === "DDP") return shipment.serviceType || "Door to Door";
  const direction = shipment.sender.country === "SA" || shipment.sender.country?.toLowerCase().includes("saudi") ? "Express Export" : "Express Import";
  return shipment.serviceType || direction;
}

function getRoute(shipment: OperationShipmentSummary) {
  return `${shipment.sender.country || shipment.sender.city || "Origin"} -> ${shipment.recipient.country || shipment.recipient.city || "Destination"}`;
}

function getD2DStage(shipment: OperationShipmentSummary) {
  if (shipment.ddpCurrentStage && shipment.ddpCurrentStage >= 1 && shipment.ddpCurrentStage <= d2dStages.length) {
    return shipment.ddpCurrentStage;
  }
  const status = shipment.status?.toLowerCase();
  if (status === "delivered") return 5;
  if (["out_for_delivery"].includes(status)) return 5;
  if (["in_transit", "customs_clearance"].includes(status)) return 4;
  if (["awaiting_payment", "payment_pending"].includes(status)) return 3;
  if (["processing", "supplier_pickup"].includes(status)) return 2;
  return 1;
}

function getExpressTab(shipment: OperationShipmentSummary): "received" | "transit" | "customs" | "lastmile" {
  const status = shipment.status?.toLowerCase();
  if (status === "customs_clearance" || status === "carrier_error") return "customs";
  if (status === "out_for_delivery" || status === "delivered") return "lastmile";
  if (status === "picked_up" || status === "in_transit") return "transit";
  return "received";
}

function isShipmentDelivered(shipment: Pick<OperationShipmentSummary, "status"> | Pick<OperationShipmentDetail, "status">) {
  return shipment.status?.toLowerCase() === "delivered";
}

function priorityClass(priority?: string | null) {
  if (priority === "urgent") return "b-red";
  if (priority === "high") return "b-amber";
  return "b-gray";
}

function issueClass(issue?: string | null) {
  if (issue === "carrier_error" || issue === "no_operations_agent") return "b-red";
  return "b-amber";
}

function shortId(shipment: OperationShipmentSummary) {
  return shipment.trackingNumber || shipment.carrierTrackingNumber || shipment.id.slice(0, 8);
}

function taskComplete(task?: OperationTask) {
  return task?.status === "COMPLETED";
}

function findTask(shipment: OperationShipmentDetail, key: string) {
  return shipment.operationTasks.find((task) => task.taskKey === key || task.title.toLowerCase().includes(key));
}

function parseTaskMetadata<T extends Record<string, unknown>>(task?: OperationTask | null): T {
  if (!task?.metadata) {
    return {} as T;
  }
  try {
    const parsed = JSON.parse(task.metadata);
    return parsed && typeof parsed === "object" ? (parsed as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

function getErrorMessage(error: unknown) {
  if (!error) return "Something went wrong.";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return "Something went wrong.";
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function OperationsHubContent() {
  const [location] = useLocation();
  const { toast } = useToast();
  const [currentSearch, setCurrentSearch] = useState(
    typeof window === "undefined" ? location.split("?")[1] || "" : window.location.search,
  );
  const routeParams = useMemo(
    () => new URLSearchParams(currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch),
    [currentSearch],
  );
  const initialViewParam = routeParams.get("view");
  const initialView: ViewKey = isViewKey(initialViewParam) ? initialViewParam : "d2d";
  const [view, setView] = useState<ViewKey>(initialView);
  const requestedShipmentId = routeParams.get("shipmentId");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Record<ViewKey, string | null>>({
    d2d: requestedShipmentId || null,
    express: requestedShipmentId || null,
    attention: requestedShipmentId || null,
    special: requestedShipmentId || null,
    delivered: requestedShipmentId || null,
  });
  const [d2dTab, setD2dTab] = useState<number | "all">("all");
  const [expressTab, setExpressTab] = useState<(typeof expressTabs)[number]["key"]>("all");
  const [deliveredTab, setDeliveredTab] = useState<"all" | "d2d" | "express">("all");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [noteBody, setNoteBody] = useState("");
  const [noteVisibility, setNoteVisibility] = useState<NoteVisibility>("INTERNAL");
  const [mentionUserIds, setMentionUserIds] = useState<string[]>([]);
  const [statusValue, setStatusValue] = useState("");
  const [assignedTeamIds, setAssignedTeamIds] = useState<string[]>([]);
  const [specialModal, setSpecialModal] = useState(false);
  const [specialReason, setSpecialReason] = useState("");
  const [specialCustomReason, setSpecialCustomReason] = useState("");
  const [specialPriority, setSpecialPriority] = useState("high");
  const [specialAssignee, setSpecialAssignee] = useState("");
  const [specialNotes, setSpecialNotes] = useState("");
  const [messageModal, setMessageModal] = useState(false);
  const [messageChannel, setMessageChannel] = useState<CommunicationChannel>("email");
  const [messageTemplate, setMessageTemplate] = useState("update");
  const [messageBody, setMessageBody] = useState("");
  const [chargesModal, setChargesModal] = useState(false);
  const [extraWeightModal, setExtraWeightModal] = useState(false);
  const [customChargeModal, setCustomChargeModal] = useState(false);
  const [extraWeightValue, setExtraWeightValue] = useState("");
  const [extraWeightPreview, setExtraWeightPreview] = useState<ExtraWeightPreview | null>(null);
  const [extraWeightPreviewError, setExtraWeightPreviewError] = useState("");
  const [isExtraWeightPreviewLoading, setIsExtraWeightPreviewLoading] = useState(false);
  const [customChargeDescription, setCustomChargeDescription] = useState("");
  const [customChargeAmount, setCustomChargeAmount] = useState("");
  const [subTab, setSubTab] = useState("track");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateSearch = () => setCurrentSearch(window.location.search);
    window.addEventListener("popstate", updateSearch);
    window.addEventListener("ez-location-change", updateSearch as EventListener);
    return () => {
      window.removeEventListener("popstate", updateSearch);
      window.removeEventListener("ez-location-change", updateSearch as EventListener);
    };
  }, []);

  useEffect(() => {
    if (initialView !== view) {
      setView(initialView);
      setFilters({});
      setSearch("");
    }
  }, [initialView, view]);

  const activeListPath = listPath(views[view].queue);
  const activeListPollMs = view === "express" || view === "attention" ? 60000 : 120000;
  const activeListQuery = useQuery<OperationShipmentSummary[]>({
    queryKey: [activeListPath],
    refetchInterval: activeListPollMs,
  });
  const { data: operationsUsers = [] } = useQuery<OperationUser[]>({ queryKey: ["/api/operations/users"] });

  const lists = useMemo<Record<ViewKey, OperationShipmentSummary[]>>(
    () => ({
      d2d: view === "d2d" ? activeListQuery.data || [] : [],
      express: view === "express" ? activeListQuery.data || [] : [],
      attention: view === "attention" ? activeListQuery.data || [] : [],
      special: view === "special" ? activeListQuery.data || [] : [],
      delivered: view === "delivered" ? activeListQuery.data || [] : [],
    }),
    [activeListQuery.data, view],
  );

  const selectedId = selectedIds[view];
  const detailPollMs = view === "express" || view === "attention" ? 60000 : 120000;
  const { data: detail, isLoading: detailLoading } = useQuery<OperationShipmentDetail>({
    queryKey: [`/api/operations/shipments/${selectedId}`],
    enabled: Boolean(selectedId),
    refetchInterval: selectedId ? detailPollMs : false,
  });

  const activeAgents = useMemo(
    () => operationsUsers.filter((user) => user.isActive && user.operationProfile?.canReceiveAssignments !== false),
    [operationsUsers],
  );

  const viewShipments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lists[view].filter((shipment) => {
      if (q) {
        const text = [
          shipment.trackingNumber,
          shipment.carrierTrackingNumber,
          shipment.clientName,
          shipment.recipient.name,
          shipment.sender.name,
          getRoute(shipment),
        ].filter(Boolean).join(" ").toLowerCase();
        if (!text.includes(q)) return false;
      }
      if (view === "d2d") {
        const stage = getD2DStage(shipment);
        if (d2dTab !== "all" && stage !== d2dTab) return false;
        if (filters.method && getMethod(shipment) !== filters.method) return false;
        if (filters.origin && shipment.sender.country !== filters.origin) return false;
        if (filters.payment && shipment.paymentStatus !== filters.payment) return false;
      }
      if (view === "express") {
        const tab = getExpressTab(shipment);
        if (expressTab !== "all" && tab !== expressTab) return false;
        if (filters.carrier && shipment.carrierName !== filters.carrier) return false;
        if (filters.type && !getMethod(shipment).includes(filters.type)) return false;
        if (filters.duplicate && !shipment.duplicateStatus) return false;
      }
      if (view === "attention") {
        const flag = shipment.attentionFlags?.[0];
        if (filters.issue && flag?.issueType !== filters.issue) return false;
        if (filters.method && getMethod(shipment) !== filters.method) return false;
        if (filters.stale) {
          const hours = (Date.now() - new Date(shipment.updatedAt).getTime()) / 36e5;
          if (hours < Number(filters.stale)) return false;
        }
      }
      if (view === "special") {
        if (filters.priority && shipment.specialHandlingPriority !== filters.priority) return false;
        if (filters.assignee && shipment.specialHandling?.assignedToUserId !== filters.assignee) return false;
      }
      if (view === "delivered") {
        if (!isShipmentDelivered(shipment)) return false;
        if (deliveredTab === "d2d" && shipment.shipmentKind !== "DDP") return false;
        if (deliveredTab === "express" && shipment.shipmentKind !== "EXPRESS") return false;
      }
      return true;
    });
  }, [d2dTab, deliveredTab, expressTab, filters, lists, search, view]);

  useEffect(() => {
    const ids = new Set(viewShipments.map((shipment) => shipment.id));
    if ((!selectedIds[view] || !ids.has(selectedIds[view] || "")) && !requestedShipmentId) {
      setSelectedIds((current) => ({ ...current, [view]: viewShipments[0]?.id || null }));
    }
  }, [requestedShipmentId, selectedIds, view, viewShipments]);

  useEffect(() => {
    if (!requestedShipmentId) return;
    setSelectedIds((current) =>
      current[view] === requestedShipmentId ? current : { ...current, [view]: requestedShipmentId },
    );
  }, [requestedShipmentId, view]);

  useEffect(() => {
    if (!requestedShipmentId || detail?.id !== requestedShipmentId) return;
    const ownerView = getShipmentView(detail);
    if (ownerView !== view) {
      setView(ownerView);
    }
    setSelectedIds((current) =>
      current[ownerView] === requestedShipmentId ? current : { ...current, [ownerView]: requestedShipmentId },
    );
  }, [detail, requestedShipmentId, view]);

  useEffect(() => {
    setStatusValue(detail?.status || "");
    setAssignedTeamIds(detail?.assignedTeam?.map((member) => member.userId) || []);
    setSpecialAssignee(detail?.assignedTeam?.[0]?.userId || detail?.assignedToUserId || "");
    setSubTab("track");
    setNoteBody("");
    setMentionUserIds([]);
    setChargesModal(false);
    setExtraWeightModal(false);
    setCustomChargeModal(false);
    setExtraWeightValue("");
    setExtraWeightPreview(null);
    setExtraWeightPreviewError("");
    setCustomChargeDescription("");
    setCustomChargeAmount("");
  }, [detail?.id, detail?.status, detail?.assignedTeam, detail?.assignedToUserId]);

  useEffect(() => {
    if (!messageModal || !detail) return;
    const firstName = detail.recipient.name?.split(" ")[0] || detail.clientName;
    const templates: Record<string, string> = {
      payment: `Hello ${firstName}, shipment ${shortId(detail)} is ready for payment. Please review the invoice and complete payment so we can move to the next operational step.`,
      update: `Hello ${firstName}, here is a quick update on your shipment ${shortId(detail)}. Our operations team is following it closely and will keep you posted.`,
      delay: `Hello ${firstName}, we are sorry for the delay on shipment ${shortId(detail)}. Our team is actively following up and will update you as soon as we have the next milestone.`,
      customs: `Hello ${firstName}, shipment ${shortId(detail)} currently requires customs-related follow-up. We will notify you right away if any action is needed from your side.`,
      delivery: `Hello ${firstName}, shipment ${shortId(detail)} is moving toward delivery. Please keep your phone available for the delivery team.`,
      custom: "",
    };
    setMessageBody(templates[messageTemplate] || "");
  }, [messageModal, messageTemplate, detail?.id]);

  useEffect(() => {
    if (!extraWeightModal) return;
    const currentMeasuredQuantity = detail?.ddpChargeConfig?.currentMeasuredQuantity;
    if (currentMeasuredQuantity) {
      setExtraWeightValue(String(Number(currentMeasuredQuantity)));
    }
  }, [extraWeightModal, detail?.id, detail?.ddpChargeConfig?.currentMeasuredQuantity]);

  useEffect(() => {
    if (!extraWeightModal || !selectedId) {
      setExtraWeightPreview(null);
      setExtraWeightPreviewError("");
      setIsExtraWeightPreviewLoading(false);
      return;
    }

    const targetMeasuredQuantity = Number(extraWeightValue);
    if (!Number.isFinite(targetMeasuredQuantity) || targetMeasuredQuantity < 0) {
      setExtraWeightPreview(null);
      setExtraWeightPreviewError("");
      setIsExtraWeightPreviewLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setIsExtraWeightPreviewLoading(true);
        setExtraWeightPreviewError("");
        const res = await apiRequest("POST", `/api/operations/shipments/${selectedId}/charges/extra-weight/preview`, {
          targetMeasuredQuantity,
        });
        const payload = await readJsonResponse(res);
        if (!cancelled) {
          setExtraWeightPreview(payload as ExtraWeightPreview);
        }
      } catch (error) {
        if (!cancelled) {
          setExtraWeightPreview(null);
          setExtraWeightPreviewError(getErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setIsExtraWeightPreviewLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [extraWeightModal, extraWeightValue, selectedId]);

  const notify = (title: string, description?: string, variant?: "default" | "destructive") =>
    toast({ title, description, variant });

  const openMessageModal = (options?: { channel?: CommunicationChannel; template?: string }) => {
    setMessageChannel(options?.channel || "email");
    setMessageTemplate(options?.template || "update");
    setMessageModal(true);
  };

  const navigateToView = (nextView: ViewKey, shipmentId?: string | null) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("view", nextView);
    if (shipmentId) {
      params.set("shipmentId", shipmentId);
    } else {
      params.delete("shipmentId");
    }
    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState(null, "", nextUrl);
    window.dispatchEvent(new Event("ez-location-change"));
  };

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      if (!selectedId) return null;
      const res = await apiRequest("PATCH", `/api/operations/shipments/${selectedId}/status`, {
        status,
        notifyClient: true,
      });
      return readJsonResponse(res);
    },
    onSuccess: (updated) => {
      const nextStatus = typeof updated === "object" && updated && "status" in updated ? String((updated as { status?: unknown }).status || "") : "";
      if (selectedId && nextStatus.toLowerCase() === "delivered") {
        setSelectedIds((current) => ({ ...current, delivered: selectedId }));
        navigateToView("delivered", selectedId);
      }
      notify("Shipment status updated", "Client notification was queued successfully.");
      invalidateOperations();
    },
    onError: (error) => notify("Could not update shipment status", getErrorMessage(error), "destructive"),
  });

  const taskMutation = useMutation({
    mutationFn: async (payload: { taskId: string; metadata?: Record<string, unknown> }) => {
      if (!selectedId) return null;
      const res = await apiRequest("POST", `/api/operations/shipments/${selectedId}/tasks/${payload.taskId}/complete`, payload.metadata ? { metadata: payload.metadata } : {});
      return readJsonResponse(res);
    },
    onSuccess: () => {
      notify("Task completed");
      invalidateOperations();
    },
    onError: (error) => notify("Could not complete task", getErrorMessage(error), "destructive"),
  });

  const noteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) return null;
      const res = await apiRequest("POST", `/api/operations/shipments/${selectedId}/notes`, {
        body: noteBody,
        visibility: noteVisibility,
        mentionUserIds,
      });
      return readJsonResponse(res);
    },
    onSuccess: () => {
      notify(
        noteVisibility === "CLIENT" ? "Client update sent" : "Note posted",
        noteVisibility === "CLIENT" ? "The message was added to the shipment timeline." : undefined,
      );
      setNoteBody("");
      setMentionUserIds([]);
      invalidateOperations();
    },
    onError: (error) =>
      notify(
        noteVisibility === "CLIENT" ? "Could not send client update" : "Could not post note",
        getErrorMessage(error),
        "destructive",
      ),
  });

  const reassignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) return null;
      const res = await apiRequest("POST", `/api/operations/shipments/${selectedId}/reassign`, {
        assignedToUserIds: assignedTeamIds,
        reason: "Manual reassignment from Operations Hub",
      });
      return readJsonResponse(res);
    },
    onSuccess: () => {
      notify("Team assignment updated");
      invalidateOperations();
    },
    onError: (error) => notify("Could not update assigned team", getErrorMessage(error), "destructive"),
  });

  const specialMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) return null;
      const reason = specialReason === "custom" ? specialCustomReason : specialReason;
      const res = await apiRequest("POST", `/api/operations/shipments/${selectedId}/special-handling`, {
        priority: specialPriority,
        reason,
        assignedToUserId: specialAssignee || undefined,
        notes: specialNotes || undefined,
      });
      return readJsonResponse(res);
    },
    onSuccess: () => {
      notify("Shipment moved to Special Handling");
      setSpecialModal(false);
      setSpecialReason("");
      setSpecialCustomReason("");
      setSpecialNotes("");
      invalidateOperations();
    },
    onError: (error) => notify("Could not mark special handling", getErrorMessage(error), "destructive"),
  });

  const clientMessageMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) return null;
      const res = await apiRequest("POST", `/api/operations/shipments/${selectedId}/client-message`, {
        message: messageBody,
        template: messageTemplate,
        channel: messageChannel,
      });
      return readJsonResponse(res);
    },
    onSuccess: (result: any) => {
      const channelLabel = getCommunicationChannelLabel((result?.channel as CommunicationChannel) || messageChannel);
      if (result?.deliveryStatus === "sent") {
        notify(
          `${channelLabel} update sent`,
          result?.deliveryMessage || "The shipment timeline was updated and the client received the message.",
        );
      } else {
        notify(
          `${channelLabel} is not configured yet`,
          result?.deliveryMessage || "We saved the update to the shipment timeline, but this channel is not connected yet.",
        );
      }
      setMessageModal(false);
      invalidateOperations();
    },
    onError: (error) =>
      notify(
        `Could not prepare ${getCommunicationChannelLabel(messageChannel)} message`,
        getErrorMessage(error),
        "destructive",
      ),
  });

  const extraWeightChargeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) return null;
      const res = await apiRequest("POST", `/api/operations/shipments/${selectedId}/charges/extra-weight`, {
        targetMeasuredQuantity: extraWeightValue,
      });
      return readJsonResponse(res);
    },
    onSuccess: (result: any) => {
      const billingUnit = result?.billingUnit || detail?.ddpChargeConfig?.billingUnit || "KG";
      notify(
        "Extra weight updated",
        `Shipment ${billingUnit} is now ${quantity(String(result?.targetMeasuredQuantity || extraWeightValue))} ${billingUnit}, and the invoice was refreshed.`,
      );
      setChargesModal(false);
      setExtraWeightModal(false);
      setExtraWeightValue("");
      setExtraWeightPreview(null);
      setExtraWeightPreviewError("");
      invalidateOperations();
    },
    onError: (error) => notify("Could not add extra weight charge", getErrorMessage(error), "destructive"),
  });

  const customChargeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) return null;
      const res = await apiRequest("POST", `/api/operations/shipments/${selectedId}/charges/custom`, {
        description: customChargeDescription,
        amount: customChargeAmount,
      });
      return readJsonResponse(res);
    },
    onSuccess: () => {
      notify("Extra charge added", "A separate DDP adjustment invoice was created and the client was notified.");
      setChargesModal(false);
      setCustomChargeModal(false);
      setCustomChargeDescription("");
      setCustomChargeAmount("");
      invalidateOperations();
    },
    onError: (error) => notify("Could not add extra charge", getErrorMessage(error), "destructive"),
  });

  const trackingSyncMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) return null;
      const res = await apiRequest("GET", `/api/shipments/${selectedId}/track`);
      return readJsonResponse(res);
    },
    onSuccess: () => {
      notify("Carrier tracking synced", "The latest tracking milestones were refreshed.");
      invalidateOperations();
    },
    onError: (error) => notify("Could not sync carrier tracking", getErrorMessage(error), "destructive"),
  });

  const resolveAttentionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) return null;
      const res = await apiRequest("POST", `/api/operations/shipments/${selectedId}/attention/resolve`, {
        resolutionNote: "Resolved from Operations Hub",
      });
      return readJsonResponse(res);
    },
    onSuccess: () => {
      notify("Attention flags resolved");
      invalidateOperations();
    },
    onError: (error) => notify("Could not resolve attention flags", getErrorMessage(error), "destructive"),
  });

  const resolveSpecialMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) return null;
      const res = await apiRequest("POST", `/api/operations/shipments/${selectedId}/special-handling/resolve`, {
        resolutionNote: "Resolved from Operations Hub",
      });
      return readJsonResponse(res);
    },
    onSuccess: () => {
      notify("Special handling resolved");
      invalidateOperations();
    },
    onError: (error) => notify("Could not resolve special handling", getErrorMessage(error), "destructive"),
  });

  const setFilter = (key: string, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const mentionableTeam = detail?.assignedTeam || [];

  const exportCurrentView = () => {
    const rows = [
      ["Shipment ID", "Client", "Method", "Origin", "Destination", "Status", "Payment", "Amount"],
      ...viewShipments.map((shipment) => [
        shortId(shipment),
        shipment.clientName,
        getMethod(shipment),
        shipment.sender.country || shipment.sender.city,
        shipment.recipient.country || shipment.recipient.city,
        formatStatus(shipment.status),
        formatStatus(shipment.paymentStatus || "pending"),
        money(shipment.finalPrice, shipment.currency),
      ]),
    ];
    downloadCsv(`operations-${view}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    notify("Export downloaded", `${views[view].short} data was exported successfully.`);
  };

  return (
    <div className="ops-ref">
      <style>{operationsCss}</style>
      <header className="ops-topbar">
        <div>
          <div className="ops-title">{views[view].title}</div>
          <div className="ops-sub">{views[view].sub}</div>
        </div>
        <div className="ops-topbar-actions">
          <button className="btn btn-gh btn-sm" type="button" onClick={exportCurrentView}>
            <Download /> Export
          </button>
        </div>
      </header>

      <div className="ops-split">
        <aside className="list-col">
          <ListHeader
            view={view}
            count={viewShipments.length}
            search={search}
            setSearch={setSearch}
            d2dTab={d2dTab}
            setD2dTab={setD2dTab}
            expressTab={expressTab}
            setExpressTab={setExpressTab}
            deliveredTab={deliveredTab}
            setDeliveredTab={setDeliveredTab}
            filters={filters}
            setFilter={setFilter}
            shipments={lists[view]}
            users={activeAgents}
          />
          <div className="ship-list">
            {viewShipments.length === 0 ? (
              <div className="empty">No matching shipments found.</div>
            ) : (
              viewShipments.map((shipment) => (
                <ShipmentListItem
                  key={shipment.id}
                  shipment={shipment}
                  view={view}
                  active={selectedId === shipment.id}
                  onClick={() => setSelectedIds((current) => ({ ...current, [view]: shipment.id }))}
                />
              ))
            )}
          </div>
        </aside>

        <main className="detail-col" aria-live="polite">
          {detailLoading ? (
            <div className="empty" style={{ margin: 24 }}>Loading shipment...</div>
          ) : !detail ? (
            <div className="empty" style={{ margin: 24 }}>Select a shipment to start operating.</div>
          ) : (
            <>
              <DetailHeader shipment={detail} onMessage={openMessageModal} onSpecial={() => setSpecialModal(true)} />
              <div className="dp-body">
                {(view === "d2d" || (view === "delivered" && detail.shipmentKind === "DDP")) && (
                  <D2DDetail
                    shipment={detail}
                    onCompleteTask={(taskId, metadata) => taskMutation.mutate({ taskId, metadata })}
                    onAdvance={(stage) => statusMutation.mutate(d2dStageStatus[stage] || "processing")}
                    onMessage={openMessageModal}
                    onSpecial={() => setSpecialModal(true)}
                    onOpenCharges={() => setChargesModal(true)}
                    pendingTaskId={taskMutation.isPending ? taskMutation.variables?.taskId || null : null}
                    teamCard={
                      <TeamAssignedCard
                        shipment={detail}
                        users={activeAgents}
                        selectedUserIds={assignedTeamIds}
                        setSelectedUserIds={setAssignedTeamIds}
                        onSave={() => reassignMutation.mutate()}
                        pending={reassignMutation.isPending}
                      />
                    }
                    noteCard={<NotesCard
                      shipment={detail}
                      users={mentionableTeam}
                      body={noteBody}
                      setBody={setNoteBody}
                      visibility={noteVisibility}
                      setVisibility={setNoteVisibility}
                      mentionUserIds={mentionUserIds}
                      setMentionUserIds={setMentionUserIds}
                      onSubmit={() => noteMutation.mutate()}
                      pending={noteMutation.isPending}
                    />}
                  />
                )}
                {(view === "express" || (view === "delivered" && detail.shipmentKind === "EXPRESS")) && (
                  <ExpressDetail
                    shipment={detail}
                    subTab={subTab}
                    setSubTab={setSubTab}
                    onMessage={openMessageModal}
                    onSyncTracking={() => trackingSyncMutation.mutate()}
                    syncPending={trackingSyncMutation.isPending}
                    teamCard={
                      <TeamAssignedCard
                        shipment={detail}
                        users={activeAgents}
                        selectedUserIds={assignedTeamIds}
                        setSelectedUserIds={setAssignedTeamIds}
                        onSave={() => reassignMutation.mutate()}
                        pending={reassignMutation.isPending}
                      />
                    }
                    noteCard={<NotesCard
                      shipment={detail}
                      users={mentionableTeam}
                      body={noteBody}
                      setBody={setNoteBody}
                      visibility={noteVisibility}
                      setVisibility={setNoteVisibility}
                      mentionUserIds={mentionUserIds}
                      setMentionUserIds={setMentionUserIds}
                      onSubmit={() => noteMutation.mutate()}
                      pending={noteMutation.isPending}
                    />}
                  />
                )}
                {view === "attention" && (
                  <AttentionDetail
                    shipment={detail}
                    onMessage={openMessageModal}
                    onSpecial={() => setSpecialModal(true)}
                    onResolve={() => resolveAttentionMutation.mutate()}
                    teamCard={
                      <TeamAssignedCard
                        shipment={detail}
                        users={activeAgents}
                        selectedUserIds={assignedTeamIds}
                        setSelectedUserIds={setAssignedTeamIds}
                        onSave={() => reassignMutation.mutate()}
                        pending={reassignMutation.isPending}
                      />
                    }
                    noteCard={<NotesCard
                      shipment={detail}
                      users={mentionableTeam}
                      body={noteBody}
                      setBody={setNoteBody}
                      visibility={noteVisibility}
                      setVisibility={setNoteVisibility}
                      mentionUserIds={mentionUserIds}
                      setMentionUserIds={setMentionUserIds}
                      onSubmit={() => noteMutation.mutate()}
                      pending={noteMutation.isPending}
                    />}
                  />
                )}
                {view === "special" && (
                  <SpecialDetail
                    shipment={detail}
                    users={activeAgents}
                    subTab={subTab}
                    setSubTab={setSubTab}
                    onMessage={openMessageModal}
                    onResolve={() => resolveSpecialMutation.mutate()}
                    teamCard={
                      <TeamAssignedCard
                        shipment={detail}
                        users={activeAgents}
                        selectedUserIds={assignedTeamIds}
                        setSelectedUserIds={setAssignedTeamIds}
                        onSave={() => reassignMutation.mutate()}
                        pending={reassignMutation.isPending}
                      />
                    }
                    noteCard={<NotesCard
                      shipment={detail}
                      users={mentionableTeam}
                      body={noteBody}
                      setBody={setNoteBody}
                      visibility={noteVisibility}
                      setVisibility={setNoteVisibility}
                      mentionUserIds={mentionUserIds}
                      setMentionUserIds={setMentionUserIds}
                      onSubmit={() => noteMutation.mutate()}
                      pending={noteMutation.isPending}
                    />}
                  />
                )}
              </div>
            </>
          )}
        </main>
      </div>

      <SpecialHandlingModal
        open={specialModal}
        shipment={detail}
        users={activeAgents}
        reason={specialReason}
        setReason={setSpecialReason}
        customReason={specialCustomReason}
        setCustomReason={setSpecialCustomReason}
        priority={specialPriority}
        setPriority={setSpecialPriority}
        assignee={specialAssignee}
        setAssignee={setSpecialAssignee}
        notes={specialNotes}
        setNotes={setSpecialNotes}
        pending={specialMutation.isPending}
        onClose={() => setSpecialModal(false)}
        onConfirm={() => specialMutation.mutate()}
      />

      <ClientMessageModal
        open={messageModal}
        shipment={detail}
        channel={messageChannel}
        setChannel={setMessageChannel}
        template={messageTemplate}
        setTemplate={setMessageTemplate}
        message={messageBody}
        setMessage={setMessageBody}
        pending={clientMessageMutation.isPending}
        onClose={() => setMessageModal(false)}
        onSend={() => clientMessageMutation.mutate()}
      />

      <ChargeTypeModal
        open={chargesModal}
        shipment={detail}
        onClose={() => setChargesModal(false)}
        onSelectExtraWeight={() => {
          setChargesModal(false);
          setExtraWeightModal(true);
        }}
        onSelectCustomCharge={() => {
          setChargesModal(false);
          setCustomChargeModal(true);
        }}
      />

      <ExtraWeightChargeModal
        open={extraWeightModal}
        shipment={detail}
        value={extraWeightValue}
        setValue={setExtraWeightValue}
        preview={extraWeightPreview}
        previewError={extraWeightPreviewError}
        previewLoading={isExtraWeightPreviewLoading}
        pending={extraWeightChargeMutation.isPending}
        onClose={() => setExtraWeightModal(false)}
        onSubmit={() => extraWeightChargeMutation.mutate()}
      />

      <CustomChargeModal
        open={customChargeModal}
        shipment={detail}
        description={customChargeDescription}
        setDescription={setCustomChargeDescription}
        amount={customChargeAmount}
        setAmount={setCustomChargeAmount}
        pending={customChargeMutation.isPending}
        onClose={() => setCustomChargeModal(false)}
        onSubmit={() => customChargeMutation.mutate()}
      />
    </div>
  );
}

function ListHeader(props: {
  view: ViewKey;
  count: number;
  search: string;
  setSearch: (value: string) => void;
  d2dTab: number | "all";
  setD2dTab: (value: number | "all") => void;
  expressTab: string;
  setExpressTab: (value: any) => void;
  deliveredTab: "all" | "d2d" | "express";
  setDeliveredTab: (value: "all" | "d2d" | "express") => void;
  filters: Record<string, string>;
  setFilter: (key: string, value: string) => void;
  shipments: OperationShipmentSummary[];
  users: OperationUser[];
}) {
  const methods = Array.from(new Set(props.shipments.map(getMethod).filter(Boolean)));
  const origins = Array.from(new Set(props.shipments.map((shipment) => shipment.sender.country).filter(Boolean)));
  const carriers = Array.from(new Set(props.shipments.map((shipment) => shipment.carrierName).filter(Boolean))) as string[];
  const issues = Array.from(new Set(props.shipments.flatMap((shipment) => shipment.attentionFlags || []).map((flag) => flag.issueType)));

  return (
    <div className="lp-head">
      <div className="lp-title">
        {props.view === "d2d" ? "D2D Shipments" : props.view === "express" ? "Express Shipments" : props.view === "attention" ? "Needs Attention" : props.view === "special" ? "Special Handling" : "Delivered Shipments"}{" "}
        <span className="view-count">({props.count})</span>
      </div>
      <div className="lp-search">
        <Search />
        <input value={props.search} onChange={(event) => props.setSearch(event.target.value)} placeholder="Search..." />
      </div>

      {props.view === "d2d" && (
        <>
          <div className="chip-row">
            <button className={`chip ${props.d2dTab === "all" ? "active" : ""}`} onClick={() => props.setD2dTab("all")}>All</button>
            {d2dStages.map((stage, index) => (
              <button key={stage} className={`chip ${props.d2dTab === index + 1 ? "active" : ""}`} onClick={() => props.setD2dTab(index + 1)}>
                {stage}
              </button>
            ))}
          </div>
          <div className="filter-bar">
            <PillSelect value={props.filters.method || ""} onChange={(value) => props.setFilter("method", value)} placeholder="Method" options={methods} />
            <PillSelect value={props.filters.origin || ""} onChange={(value) => props.setFilter("origin", value)} placeholder="Origin" options={origins} />
            <PillSelect value={props.filters.payment || ""} onChange={(value) => props.setFilter("payment", value)} placeholder="Payment" options={["paid", "unpaid"]} />
            <button className="chip" onClick={() => ["method", "origin", "payment"].forEach((key) => props.setFilter(key, ""))}>Clear</button>
          </div>
        </>
      )}

      {props.view === "express" && (
        <>
          <div className="chip-row">
            {expressTabs.map((tab) => (
              <button key={tab.key} className={`chip ${props.expressTab === tab.key ? "active" : ""}`} onClick={() => props.setExpressTab(tab.key)}>
                {tab.label}
              </button>
            ))}
          </div>
          <div className="filter-bar">
            <PillSelect value={props.filters.carrier || ""} onChange={(value) => props.setFilter("carrier", value)} placeholder="Carrier" options={carriers} />
            <PillSelect value={props.filters.type || ""} onChange={(value) => props.setFilter("type", value)} placeholder="Type" options={["Import", "Export"]} />
            <button
              className={`chip ${props.filters.duplicate ? "active" : ""}`}
              onClick={() => props.setFilter("duplicate", props.filters.duplicate ? "" : "1")}
            >
              Duplicate Status
            </button>
            <button className="chip" onClick={() => ["carrier", "type", "duplicate"].forEach((key) => props.setFilter(key, ""))}>Clear</button>
          </div>
        </>
      )}

      {props.view === "attention" && (
        <div className="filter-bar">
          <PillSelect value={props.filters.issue || ""} onChange={(value) => props.setFilter("issue", value)} placeholder="Issue" options={issues} labelFor={(value) => issueLabels[value] || formatStatus(value)} />
          <PillSelect value={props.filters.method || ""} onChange={(value) => props.setFilter("method", value)} placeholder="Method" options={methods} />
          <PillSelect value={props.filters.stale || ""} onChange={(value) => props.setFilter("stale", value)} placeholder="Stale" options={["24", "36", "48"]} labelFor={(value) => `${value}+ hours`} />
          <button className="chip" onClick={() => ["issue", "method", "stale"].forEach((key) => props.setFilter(key, ""))}>Clear</button>
        </div>
      )}

      {props.view === "special" && (
        <div className="filter-bar">
          <PillSelect value={props.filters.priority || ""} onChange={(value) => props.setFilter("priority", value)} placeholder="Priority" options={["urgent", "high", "normal"]} labelFor={formatStatus} />
          <PillSelect value={props.filters.assignee || ""} onChange={(value) => props.setFilter("assignee", value)} placeholder="Assignee" options={props.users.map((user) => user.id)} labelFor={(value) => props.users.find((user) => user.id === value)?.username || value} />
          <button className="chip" onClick={() => ["priority", "assignee"].forEach((key) => props.setFilter(key, ""))}>Clear</button>
        </div>
      )}

      {props.view === "delivered" && (
        <div className="chip-row">
          <button className={`chip ${props.deliveredTab === "all" ? "active" : ""}`} onClick={() => props.setDeliveredTab("all")}>All</button>
          <button className={`chip ${props.deliveredTab === "d2d" ? "active" : ""}`} onClick={() => props.setDeliveredTab("d2d")}>Door to Door</button>
          <button className={`chip ${props.deliveredTab === "express" ? "active" : ""}`} onClick={() => props.setDeliveredTab("express")}>Express</button>
        </div>
      )}
    </div>
  );
}

function PillSelect({ value, onChange, placeholder, options, labelFor = String }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: string[];
  labelFor?: (value: string) => string;
}) {
  return (
    <OperationsSelect
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      includeEmptyOption
      emptyOptionLabel={placeholder}
      triggerClassName="h-[34px] min-w-[120px] rounded-full text-[12px] shadow-none"
      options={options.map((option) => ({ value: option, label: labelFor(option) }))}
    />
  );
}

function ShipmentListItem({ shipment, view, active, onClick }: {
  shipment: OperationShipmentSummary;
  view: ViewKey;
  active: boolean;
  onClick: () => void;
}) {
  const stage = getD2DStage(shipment);
  const expressTab = getExpressTab(shipment);
  const flag = shipment.attentionFlags?.[0];
  const stageBadge = view === "delivered"
    ? <span className="badge b-green">Delivered</span>
    : view === "d2d"
    ? <span className="badge b-pr">Stage {stage}: {d2dStages[stage - 1]}</span>
    : view === "express"
      ? <span className={`badge ${expressTab === "customs" ? "b-amber" : expressTab === "lastmile" ? "b-purple" : expressTab === "transit" ? "b-blue" : "b-green"}`}>{formatStatus(expressTab)}</span>
      : view === "attention"
        ? <span className={`badge ${issueClass(flag?.issueType)}`}>{issueLabels[flag?.issueType || ""] || "Needs attention"}</span>
        : <span className={`badge ${priorityClass(shipment.specialHandlingPriority)}`}>{formatStatus(shipment.specialHandlingPriority || "normal")}</span>;

  return (
    <button className={`si ${active ? "active" : ""}`} type="button" onClick={onClick}>
      <div className="si-top">
        <div className="si-id">{shortId(shipment)}</div>
        {stageBadge}
      </div>
      <div className="si-name">{shipment.clientName}</div>
      <div className="si-meta">{getMethod(shipment)} · {getRoute(shipment)}{shipment.assignedToName ? ` · ${shipment.assignedToName}` : ""}</div>
      {view === "attention" && <div className="si-meta">{flag?.details || "Operational review required"}</div>}
      {view === "special" && <div className="si-meta">{shipment.specialHandling?.reason || "Priority monitoring"}</div>}
      <div className="si-money">{money(shipment.finalPrice, shipment.currency)}</div>
    </button>
  );
}

function DetailHeader({ shipment, onMessage, onSpecial }: {
  shipment: OperationShipmentDetail;
  onMessage: (options?: { channel?: CommunicationChannel; template?: string }) => void;
  onSpecial: () => void;
}) {
  const badge = shipment.shipmentKind === "DDP"
    ? isShipmentDelivered(shipment)
      ? <span className="badge b-green">Delivered</span>
      : <span className="badge b-pr">Stage {getD2DStage(shipment)} · {d2dStages[getD2DStage(shipment) - 1]}</span>
    : isShipmentDelivered(shipment)
      ? <span className="badge b-green">Delivered</span>
      : <span className="badge b-blue">{formatStatus(getExpressTab(shipment))}</span>;

  return (
    <div className="dp-header">
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="dp-id">{shortId(shipment)}</div>
        <div className="dp-name">{shipment.clientName}</div>
        <div className="dp-meta">
          <span className="badge b-gray">{getMethod(shipment)}</span>
          <span className="badge b-gray">{getRoute(shipment)}</span>
          {badge}
          {shipment.carrierName && <span className="badge b-gray">{shipment.carrierName}</span>}
        </div>
      </div>
      <div className="dp-actions">
        <button className="btn btn-gh btn-sm" type="button" onClick={() => onMessage({ channel: "whatsapp", template: "update" })}>
          <MessageCircle /> WhatsApp
        </button>
        <button className="btn btn-blue btn-sm" type="button" onClick={() => onMessage({ channel: "email", template: "update" })}>
          <Mail /> Email
        </button>
        <button className="btn btn-purple btn-sm" type="button" onClick={() => onMessage({ channel: "sms", template: "update" })}>
          <Smartphone /> SMS
        </button>
        <button className="btn btn-amber btn-sm" type="button" onClick={onSpecial}>
          <ShieldCheck /> Special handling
        </button>
      </div>
    </div>
  );
}

function D2DDetail({ shipment, onCompleteTask, onAdvance, onMessage, onSpecial, onOpenCharges, teamCard, noteCard, pendingTaskId }: {
  shipment: OperationShipmentDetail;
  onCompleteTask: (taskId: string, metadata?: Record<string, unknown>) => void;
  onAdvance: (stage: number) => void;
  onMessage: (options?: { channel?: CommunicationChannel; template?: string }) => void;
  onSpecial: () => void;
  onOpenCharges: () => void;
  pendingTaskId?: string | null;
  teamCard: React.ReactNode;
  noteCard: React.ReactNode;
}) {
  const activeStage = isShipmentDelivered(shipment) ? d2dStages.length + 1 : getD2DStage(shipment);
  const [expandedStage, setExpandedStage] = useState(activeStage);

  useEffect(() => {
    setExpandedStage(activeStage);
  }, [activeStage, shipment.id]);

  return (
    <div className="dp-grid">
      <div>
        <div className="card">
          <div className="card-title"><Package /> Operations progress</div>
          <div className="progress-rail">
            <div className="progress-line" style={{ width: `${Math.min(Math.round(((activeStage - 1) / (d2dStages.length - 1)) * 88), 88)}%` }} />
            {d2dStages.map((label, index) => {
              const stage = index + 1;
              const state = stage < activeStage ? "done" : stage === activeStage ? "active" : "pending";
              return (
                <div key={`progress-${label}`} className={`progress-step ${state}`}>
                  <div className="progress-step-dot">{state === "done" ? "✓" : stage}</div>
                  <div className="progress-step-label">{label}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          {d2dStages.map((label, index) => {
            const stage = index + 1;
            const done = stage < activeStage;
            const active = stage === activeStage;
            const locked = stage > activeStage;
            const expanded = expandedStage === stage;
            return (
              <div key={label} className={`stage-card ${done ? "done" : ""} ${active ? "active" : ""} ${locked ? "locked" : ""}`}>
                <div
                  className="stage-head"
                  onClick={() => {
                    if (locked) return;
                    setExpandedStage((current) => current === stage ? 0 : stage);
                  }}
                >
                  <div className="stage-left">
                    <div className="stage-num">{done ? "✓" : stage}</div>
                    <div>
                      <div className="stage-title">
                        {stage === 1 && "📋 "}
                        {stage === 2 && "🏭 "}
                        {stage === 3 && "💰 "}
                        {stage === 4 && "🚀 "}
                        {stage === 5 && "📦 "}
                        Stage {stage} — {stage === 1 ? "Planning & Coordination" : stage === 2 ? "Warehouse Receipt & QC" : stage === 3 ? "Weight & Invoicing" : stage === 4 ? "Shipping & Tracking" : "Delivery & POD"}
                      </div>
                      <div className="stage-sub">{done ? "Completed" : active ? "In progress" : "Pending"}</div>
                    </div>
                  </div>
                  <div className="stage-sub">{expanded ? "▾" : "▸"}</div>
                </div>
                {expanded && (
                  <div className="stage-body">
                    <D2DStageContent shipment={shipment} stage={stage} onCompleteTask={onCompleteTask} onAdvance={onAdvance} onMessage={onMessage} onOpenCharges={onOpenCharges} pendingTaskId={pendingTaskId} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {noteCard}
      </div>
      <SidePanel shipment={shipment} teamCard={teamCard} />
    </div>
  );
}

function D2DStageContent({ shipment, stage, onCompleteTask, onAdvance, onMessage, onOpenCharges, pendingTaskId }: {
  shipment: OperationShipmentDetail;
  stage: number;
  onCompleteTask: (taskId: string, metadata?: Record<string, unknown>) => void;
  onAdvance: (stage: number) => void;
  onMessage: (options?: { channel?: CommunicationChannel; template?: string }) => void;
  onOpenCharges: () => void;
  pendingTaskId?: string | null;
}) {
  const taskByKey = (key: string) => shipment.operationTasks.find((task) => task.taskKey === key);
  if (stage === 1) {
    const tasks = [
      taskByKey("ddp_review_order"),
      taskByKey("ddp_contact_supplier"),
      taskByKey("ddp_schedule_pickup"),
    ].filter(Boolean) as OperationTask[];
    const canAdvance = tasks.every(taskComplete);
    return (
      <>
        {tasks.map((task) => <TaskItem key={task.id} task={task} onComplete={onCompleteTask} pending={pendingTaskId === task.id} />)}
        <button className="btn btn-pr btn-sm" type="button" disabled={!canAdvance} onClick={() => onAdvance(2)}>Mark complete → Move to Warehouse</button>
      </>
    );
  }
  if (stage === 2) {
    return <D2DWarehouseStage shipment={shipment} onCompleteTask={onCompleteTask} onAdvance={onAdvance} pendingTaskId={pendingTaskId} />;
  }
  if (stage === 3) {
    const chargeConfig = shipment.ddpChargeConfig;
    const billingUnit = chargeConfig?.billingUnit || "KG";
    const totalAdjustments = Number(chargeConfig?.totalAdjustmentsAmountSar || 0);
    return (
      <>
        <div className="metric-grid">
          <div className="card" style={{ margin: 0 }}>
            <div className="sc-key">Current shipment quantity</div>
            <div className="sc-val orange" style={{ textAlign: "left", fontSize: 18 }}>
              {chargeConfig ? `${quantity(chargeConfig.currentMeasuredQuantity)} ${billingUnit}` : "Pending"}
            </div>
          </div>
          <div className="card" style={{ margin: 0 }}>
            <div className="sc-key">Open adjustments</div>
            <div className="sc-val green" style={{ textAlign: "left", fontSize: 18 }}>{money(String(totalAdjustments), "SAR")}</div>
          </div>
        </div>
        {chargeConfig && (
          <div className="alert alert-blue" style={{ marginBottom: 12 }}>
            <Package />
            <div>
              <strong>This lane is billed by {billingUnit}.</strong>{" "}
              Original quantity: {quantity(chargeConfig.currentRawQuantity)} {billingUnit}.{" "}
              Current shipment quantity: {quantity(chargeConfig.currentMeasuredQuantity)} {billingUnit}.{" "}
              Extra billed {billingUnit}: {quantity(chargeConfig.extraWeightQuantity)} {billingUnit} ({money(chargeConfig.extraWeightAmountSar, "SAR")}).
              {Number(chargeConfig.customChargesAmountSar || 0) > 0 ? ` Extra charges: ${money(chargeConfig.customChargesAmountSar, "SAR")}.` : ""}
            </div>
          </div>
        )}
        <div className={shipment.paymentStatus === "paid" ? "alert alert-green" : "alert alert-blue"}>
          <DollarSign /> {shipment.paymentStatus === "paid" ? "Payment confirmed" : "Payment is still pending. Send the client a payment reminder."}
        </div>
        <div className="action-row">
          <button className="btn btn-amber btn-sm" type="button" onClick={onOpenCharges}>Add charges</button>
          <button className="btn btn-green btn-sm" type="button" onClick={() => onMessage({ template: "payment" })}>Send payment request</button>
          <button className="btn btn-pr btn-sm" type="button" disabled={shipment.paymentStatus !== "paid"} onClick={() => onAdvance(4)}>Payment confirmed → Start shipping</button>
        </div>
      </>
    );
  }
  if (stage === 4) {
    const shippingTasks = [
      taskByKey("ddp_origin_warehouse_received"),
      taskByKey("ddp_origin_customs_cleared"),
      taskByKey("ddp_departed_origin"),
      taskByKey("ddp_in_transit"),
      taskByKey("ddp_arrived_destination"),
      taskByKey("ddp_destination_customs_cleared"),
      taskByKey("ddp_last_mile_delivery"),
    ].filter(Boolean) as OperationTask[];
    const canAdvance = shippingTasks.length > 0 && shippingTasks.every(taskComplete);

    return (
      <>
        <div className="checkpoint-stack">
          {shippingTasks.map((task, index) => {
            const done = taskComplete(task);
            const previousDone = index === 0 ? true : taskComplete(shippingTasks[index - 1]);
            const locked = !done && !previousDone;
            return (
              <div key={task.id} className={`checkpoint-card ${done ? "done" : ""} ${locked ? "locked" : ""}`}>
                <div className="checkpoint-head">
                  <div className="task-dot">{done ? "✓" : ""}</div>
                  <div className="checkpoint-copy">
                    <div className="task-main">{task.title}</div>
                    <div className="task-meta">{done ? "Completed" : locked ? "Complete the previous checkpoint first." : "Manual shipping checkpoint"}</div>
                  </div>
                </div>
                {!done && (
                  <button
                    className="btn btn-gh btn-sm"
                    type="button"
                    disabled={locked || pendingTaskId === task.id}
                    onClick={() => onCompleteTask(task.id)}
                  >
                    {pendingTaskId === task.id ? "Saving..." : "Complete"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button
          className="btn btn-pr btn-sm"
          style={{ marginTop: 12 }}
          type="button"
          disabled={!canAdvance}
          onClick={() => onAdvance(5)}
        >
          All shipping checkpoints done → Start delivery
        </button>
      </>
    );
  }
  return (
    <>
      <D2DDeliveryPodStage shipment={shipment} onCompleteTask={onCompleteTask} onMarkDelivered={() => onAdvance(6)} pendingTaskId={pendingTaskId} />
      {shipment.status === "delivered" ? (
        <div className="alert alert-green"><CheckCircle2 /> Delivered. Proof of delivery can be attached from shipment documents.</div>
      ) : (
        <button className="btn btn-green btn-sm" type="button" onClick={() => onMessage({ template: "delivery" })}>Notify client - out for delivery</button>
      )}
    </>
  );
}

function D2DWarehouseStage({
  shipment,
  onCompleteTask,
  onAdvance,
  pendingTaskId,
}: {
  shipment: OperationShipmentDetail;
  onCompleteTask: (taskId: string, metadata?: Record<string, unknown>) => void;
  onAdvance: (stage: number) => void;
  pendingTaskId?: string | null;
}) {
  const { toast } = useToast();
  const receiptTask = findTask(shipment, "ddp_received_warehouse");
  const qcTask = findTask(shipment, "ddp_quality_check");
  const photosTask = findTask(shipment, "ddp_photos_uploaded");
  const manualTrackingTask = findTask(shipment, "ddp_manual_tracking_number");

  const receiptMetadata = parseTaskMetadata<{ receiptDate?: string; receivedPieces?: number; receiptNotes?: string }>(receiptTask);
  const qcMetadata = parseTaskMetadata<{
    packagingStatus?: string;
    quantityStatus?: string;
    damageStatus?: string;
    documentsStatus?: string;
    qcNotes?: string;
  }>(qcTask);
  const photosMetadata = parseTaskMetadata<{ photos?: UploadedAsset[]; photoNotes?: string }>(photosTask);
  const manualTrackingMetadata = parseTaskMetadata<{ carrierTrackingNumber?: string }>(manualTrackingTask);

  const [receiptDate, setReceiptDate] = useState(receiptMetadata.receiptDate || "");
  const [receivedPieces, setReceivedPieces] = useState(receiptMetadata.receivedPieces ? String(receiptMetadata.receivedPieces) : "");
  const [receiptNotes, setReceiptNotes] = useState(receiptMetadata.receiptNotes || "");
  const [packagingStatus, setPackagingStatus] = useState(qcMetadata.packagingStatus || "");
  const [quantityStatus, setQuantityStatus] = useState(qcMetadata.quantityStatus || "");
  const [damageStatus, setDamageStatus] = useState(qcMetadata.damageStatus || "");
  const [documentsStatus, setDocumentsStatus] = useState(qcMetadata.documentsStatus || "");
  const [qcNotes, setQcNotes] = useState(qcMetadata.qcNotes || "");
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedAsset[]>(Array.isArray(photosMetadata.photos) ? photosMetadata.photos : []);
  const [photoNotes, setPhotoNotes] = useState(photosMetadata.photoNotes || "");
  const [manualTrackingNumber, setManualTrackingNumber] = useState(
    manualTrackingMetadata.carrierTrackingNumber || shipment.carrierTrackingNumber || "",
  );

  useEffect(() => {
    setReceiptDate(receiptMetadata.receiptDate || "");
    setReceivedPieces(receiptMetadata.receivedPieces ? String(receiptMetadata.receivedPieces) : "");
    setReceiptNotes(receiptMetadata.receiptNotes || "");
  }, [receiptTask?.id, receiptTask?.metadata]);

  useEffect(() => {
    setPackagingStatus(qcMetadata.packagingStatus || "");
    setQuantityStatus(qcMetadata.quantityStatus || "");
    setDamageStatus(qcMetadata.damageStatus || "");
    setDocumentsStatus(qcMetadata.documentsStatus || "");
    setQcNotes(qcMetadata.qcNotes || "");
  }, [qcTask?.id, qcTask?.metadata]);

  useEffect(() => {
    setUploadedPhotos(Array.isArray(photosMetadata.photos) ? photosMetadata.photos : []);
    setPhotoNotes(photosMetadata.photoNotes || "");
  }, [photosTask?.id, photosTask?.metadata]);

  useEffect(() => {
    setManualTrackingNumber(manualTrackingMetadata.carrierTrackingNumber || shipment.carrierTrackingNumber || "");
  }, [manualTrackingTask?.id, manualTrackingTask?.metadata, shipment.carrierTrackingNumber]);

  const upload = useUpload({
    onSuccess: (response) => {
      setUploadedPhotos((current) => [
        ...current,
        {
          name: response.metadata.name,
          path: response.objectPath,
          size: response.metadata.size,
          contentType: response.metadata.contentType,
        },
      ]);
      toast({ title: "Warehouse photo uploaded" });
    },
    onError: (error) => {
      toast({ title: "Could not upload warehouse photo", description: error.message, variant: "destructive" });
    },
  });

  const receiptDone = taskComplete(receiptTask);
  const qcDone = taskComplete(qcTask);
  const photosDone = taskComplete(photosTask);
  const manualTrackingDone = taskComplete(manualTrackingTask);
  const canCompleteReceipt = !!receiptTask && receiptDate.trim().length > 0 && Number(receivedPieces) > 0;
  const canCompleteQc = !!qcTask && receiptDone && [packagingStatus, quantityStatus, damageStatus, documentsStatus].every((value) => value.trim().length > 0);
  const canCompletePhotos = !!photosTask && qcDone && uploadedPhotos.length > 0;
  const canCompleteManualTracking = !!manualTrackingTask && photosDone && manualTrackingNumber.trim().length > 0;
  const canAdvance = receiptDone && qcDone && photosDone && manualTrackingDone;

  const uploadPhoto = async (file?: File) => {
    if (!file) return;
    await upload.uploadFile(file);
  };

  return (
    <>
      <div className="checkpoint-stack">
        <div className={`checkpoint-card ${receiptDone ? "done" : ""}`}>
          <div className="checkpoint-head">
            <div className="task-dot">{receiptDone ? "✓" : ""}</div>
            <div className="checkpoint-copy">
              <div className="task-main">{receiptTask?.title || "Shipment received at warehouse"}</div>
              <div className="task-meta">{receiptTask?.description || "Log receipt date and pieces"}</div>
            </div>
          </div>
          {!receiptDone && (
            <>
              <div className="checkpoint-grid">
                <div className="field-group">
                  <label className="field-label">Receipt date</label>
                  <input className="field-input" type="date" value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label">Received pieces</label>
                  <input className="field-input" inputMode="numeric" value={receivedPieces} onChange={(event) => setReceivedPieces(event.target.value)} placeholder="0" />
                </div>
              </div>
              <div className="field-group">
                <label className="field-label">Receipt notes</label>
                <textarea className="field-textarea" value={receiptNotes} onChange={(event) => setReceiptNotes(event.target.value)} placeholder="Optional warehouse intake notes" />
              </div>
              <button className="btn btn-gh btn-sm" type="button" disabled={!canCompleteReceipt || pendingTaskId === receiptTask?.id} onClick={() => receiptTask && onCompleteTask(receiptTask.id, { receiptDate, receivedPieces: Number(receivedPieces), receiptNotes })}>
                {pendingTaskId === receiptTask?.id ? "Saving..." : "Complete"}
              </button>
            </>
          )}
          {receiptDone && (
            <div className="checkpoint-summary">
              Received on {receiptMetadata.receiptDate || "Not set"} · {receiptMetadata.receivedPieces || 0} pieces
            </div>
          )}
        </div>

        <div className={`checkpoint-card ${receiptDone ? "" : "locked"} ${qcDone ? "done" : ""}`}>
          <div className="checkpoint-head">
            <div className="task-dot">{qcDone ? "✓" : ""}</div>
            <div className="checkpoint-copy">
              <div className="task-main">{qcTask?.title || "QC completed"}</div>
              <div className="task-meta">{qcTask?.description || "Packaging, quantity, damage, documents"}</div>
            </div>
          </div>
          {!receiptDone && <div className="field-hint">Complete the warehouse receipt checkpoint first.</div>}
          {receiptDone && !qcDone && (
            <>
              <div className="checkpoint-grid">
                <div className="field-group">
                  <label className="field-label">Packaging status</label>
                  <OperationsSelect
                    value={packagingStatus}
                    onChange={setPackagingStatus}
                    placeholder="Select packaging status"
                    triggerClassName="h-[34px] text-[12px] shadow-none"
                    options={[
                      { value: "sealed_good", label: "Sealed / good condition" },
                      { value: "repacked", label: "Repacked" },
                      { value: "damaged", label: "Damaged / needs action" },
                    ]}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">Quantity check</label>
                  <OperationsSelect
                    value={quantityStatus}
                    onChange={setQuantityStatus}
                    placeholder="Select quantity result"
                    triggerClassName="h-[34px] text-[12px] shadow-none"
                    options={[
                      { value: "matched", label: "Matched order / invoice" },
                      { value: "mismatch", label: "Mismatch found" },
                    ]}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">Damage check</label>
                  <OperationsSelect
                    value={damageStatus}
                    onChange={setDamageStatus}
                    placeholder="Select damage result"
                    triggerClassName="h-[34px] text-[12px] shadow-none"
                    options={[
                      { value: "clear", label: "No damage" },
                      { value: "minor", label: "Minor damage" },
                      { value: "major", label: "Major damage" },
                    ]}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">Documents check</label>
                  <OperationsSelect
                    value={documentsStatus}
                    onChange={setDocumentsStatus}
                    placeholder="Select document result"
                    triggerClassName="h-[34px] text-[12px] shadow-none"
                    options={[
                      { value: "complete", label: "Complete" },
                      { value: "missing", label: "Missing items" },
                      { value: "correction_needed", label: "Needs correction" },
                    ]}
                  />
                </div>
              </div>
              <div className="field-group">
                <label className="field-label">QC notes</label>
                <textarea className="field-textarea" value={qcNotes} onChange={(event) => setQcNotes(event.target.value)} placeholder="Optional QC remarks" />
              </div>
              <button className="btn btn-gh btn-sm" type="button" disabled={!canCompleteQc || pendingTaskId === qcTask?.id} onClick={() => qcTask && onCompleteTask(qcTask.id, { packagingStatus, quantityStatus, damageStatus, documentsStatus, qcNotes })}>
                {pendingTaskId === qcTask?.id ? "Saving..." : "Complete"}
              </button>
            </>
          )}
          {qcDone && (
            <div className="checkpoint-summary">
              Packaging: {formatStatus(qcMetadata.packagingStatus)} · Quantity: {formatStatus(qcMetadata.quantityStatus)} · Damage: {formatStatus(qcMetadata.damageStatus)} · Documents: {formatStatus(qcMetadata.documentsStatus)}
            </div>
          )}
        </div>

        <div className={`checkpoint-card ${qcDone ? "" : "locked"} ${photosDone ? "done" : ""}`}>
          <div className="checkpoint-head">
            <div className="task-dot">{photosDone ? "✓" : ""}</div>
            <div className="checkpoint-copy">
              <div className="task-main">{photosTask?.title || "Photos uploaded"}</div>
              <div className="task-meta">{photosTask?.description || "Warehouse condition photos"}</div>
            </div>
          </div>
          {!qcDone && <div className="field-hint">Complete the QC checkpoint first.</div>}
          {qcDone && !photosDone && (
            <>
              <div className="field-group">
                <label className="field-label">Warehouse photo files</label>
                <label className="btn btn-gh btn-sm" style={{ width: "fit-content" }}>
                  {upload.isUploading ? "Uploading..." : "Upload photo"}
                  <input className="hidden" type="file" accept="image/*,.pdf" onChange={(event) => uploadPhoto(event.target.files?.[0])} />
                </label>
                <div className="field-hint">Upload at least one warehouse condition photo or supporting file.</div>
              </div>
              {uploadedPhotos.length > 0 && (
                <div className="upload-list">
                  {uploadedPhotos.map((photo) => (
                    <div className="upload-chip" key={photo.path}>
                      <div>
                        <div className="upload-name">{photo.name}</div>
                        <div className="upload-meta">{photo.path}</div>
                      </div>
                      <button className="btn btn-red btn-xs" type="button" onClick={() => setUploadedPhotos((current) => current.filter((item) => item.path !== photo.path))}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="field-group">
                <label className="field-label">Photo notes</label>
                <textarea className="field-textarea" value={photoNotes} onChange={(event) => setPhotoNotes(event.target.value)} placeholder="Optional note about warehouse condition photos" />
              </div>
              <button className="btn btn-gh btn-sm" type="button" disabled={!canCompletePhotos || pendingTaskId === photosTask?.id} onClick={() => photosTask && onCompleteTask(photosTask.id, { photos: uploadedPhotos, photoNotes })}>
                {pendingTaskId === photosTask?.id ? "Saving..." : "Complete"}
              </button>
            </>
          )}
          {photosDone && (
            <div className="checkpoint-summary">
              {(photosMetadata.photos || []).length || uploadedPhotos.length} warehouse photo{((photosMetadata.photos || []).length || uploadedPhotos.length) === 1 ? "" : "s"} uploaded
            </div>
          )}
        </div>

        <div className={`checkpoint-card ${photosDone ? "" : "locked"} ${manualTrackingDone ? "done" : ""}`}>
          <div className="checkpoint-head">
            <div className="task-dot">{manualTrackingDone ? "✓" : ""}</div>
            <div className="checkpoint-copy">
              <div className="task-main">{manualTrackingTask?.title || "Add manual tracking number"}</div>
              <div className="task-meta">{manualTrackingTask?.description || "Save the external tracking number for DDP follow-up"}</div>
            </div>
          </div>
          {!photosDone && <div className="field-hint">Complete the warehouse photo checkpoint first.</div>}
          {photosDone && !manualTrackingDone && (
            <>
              <div className="field-group">
                <label className="field-label">Manual tracking number</label>
                <input
                  className="field-input"
                  value={manualTrackingNumber}
                  onChange={(event) => setManualTrackingNumber(event.target.value)}
                  placeholder="Enter external tracking number"
                />
                <div className="field-hint">This number becomes shipment tracking reference across operations, client, and admin views.</div>
              </div>
              <button
                className="btn btn-gh btn-sm"
                type="button"
                disabled={!canCompleteManualTracking || pendingTaskId === manualTrackingTask?.id}
                onClick={() => manualTrackingTask && onCompleteTask(manualTrackingTask.id, {
                  carrierTrackingNumber: manualTrackingNumber.trim(),
                })}
              >
                {pendingTaskId === manualTrackingTask?.id ? "Saving..." : "Save tracking number"}
              </button>
            </>
          )}
          {manualTrackingDone && (
            <div className="checkpoint-summary">
              Tracking number saved: {manualTrackingMetadata.carrierTrackingNumber || shipment.carrierTrackingNumber || "Not set"}
            </div>
          )}
        </div>
      </div>
      {canAdvance && <div className="alert alert-green"><CheckCircle2 /> Warehouse checks and manual tracking are complete — ready for billing.</div>}
      <button className="btn btn-pr btn-sm" type="button" disabled={!canAdvance} onClick={() => onAdvance(3)}>QC Complete → Move to Billing</button>
    </>
  );
}

function D2DDeliveryPodStage({
  shipment,
  onCompleteTask,
  onMarkDelivered,
  pendingTaskId,
}: {
  shipment: OperationShipmentDetail;
  onCompleteTask: (taskId: string, metadata?: Record<string, unknown>) => void;
  onMarkDelivered: () => void;
  pendingTaskId?: string | null;
}) {
  const { toast } = useToast();
  const deliveryTask = findTask(shipment, "ddp_delivery_confirmation") || shipment.operationTasks[shipment.operationTasks.length - 1];
  const deliveryMetadata = parseTaskMetadata<{ photos?: UploadedAsset[]; podNotes?: string }>(deliveryTask);
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedAsset[]>(
    Array.isArray(deliveryMetadata.photos) ? deliveryMetadata.photos : [],
  );
  const [podNotes, setPodNotes] = useState(deliveryMetadata.podNotes || "");

  useEffect(() => {
    setUploadedPhotos(Array.isArray(deliveryMetadata.photos) ? deliveryMetadata.photos : []);
    setPodNotes(deliveryMetadata.podNotes || "");
  }, [deliveryTask?.id, deliveryTask?.metadata]);

  const upload = useUpload({
    onSuccess: (response) => {
      setUploadedPhotos((current) => [
        ...current,
        {
          name: response.metadata.name,
          path: response.objectPath,
          size: response.metadata.size,
          contentType: response.metadata.contentType,
        },
      ]);
      toast({ title: "POD file uploaded" });
    },
    onError: (error) => {
      toast({ title: "Could not upload POD file", description: error.message, variant: "destructive" });
    },
  });

  const done = taskComplete(deliveryTask);
  const canComplete = !!deliveryTask && uploadedPhotos.length > 0;

  const uploadPhoto = async (file?: File) => {
    if (!file) return;
    await upload.uploadFile(file);
  };

  if (!deliveryTask) return null;

  return (
    <div className={`checkpoint-card ${done ? "done" : ""}`}>
      <div className="checkpoint-head">
        <div className="task-dot">{done ? "✓" : ""}</div>
        <div className="checkpoint-copy">
          <div className="task-main">{deliveryTask.title || "Upload photo / POD"}</div>
          <div className="task-meta">{deliveryTask.description || "Upload proof of delivery photos or signed POD files"}</div>
        </div>
      </div>
      {!done && (
        <>
          <div className="field-group">
            <label className="field-label">POD photo files</label>
            <label className="btn btn-gh btn-sm" style={{ width: "fit-content" }}>
              {upload.isUploading ? "Uploading..." : "Upload photo"}
              <input className="hidden" type="file" accept="image/*,.pdf" onChange={(event) => uploadPhoto(event.target.files?.[0])} />
            </label>
            <div className="field-hint">Upload at least one proof-of-delivery photo or signed POD file.</div>
          </div>
          {uploadedPhotos.length > 0 && (
            <div className="upload-list">
              {uploadedPhotos.map((photo) => (
                <div className="upload-chip" key={photo.path}>
                  <div>
                    <div className="upload-name">{photo.name}</div>
                    <div className="upload-meta">{photo.path}</div>
                  </div>
                  <button className="btn btn-red btn-xs" type="button" onClick={() => setUploadedPhotos((current) => current.filter((item) => item.path !== photo.path))}>Remove</button>
                </div>
              ))}
            </div>
          )}
          <div className="field-group">
            <label className="field-label">POD notes</label>
            <textarea className="field-textarea" value={podNotes} onChange={(event) => setPodNotes(event.target.value)} placeholder="Optional delivery notes" />
          </div>
          <button
            className="btn btn-gh btn-sm"
            type="button"
            disabled={!canComplete || pendingTaskId === deliveryTask.id}
            onClick={() => onCompleteTask(deliveryTask.id, { photos: uploadedPhotos, podNotes })}
          >
            {pendingTaskId === deliveryTask.id ? "Saving..." : "Upload photo"}
          </button>
        </>
      )}
      {done && (
        <>
          <div className="checkpoint-summary">
            {(deliveryMetadata.photos || []).length || uploadedPhotos.length} POD file{((deliveryMetadata.photos || []).length || uploadedPhotos.length) === 1 ? "" : "s"} uploaded
          </div>
          {shipment.status !== "delivered" && (
            <button className="btn btn-pr btn-sm" type="button" style={{ marginTop: 12 }} onClick={onMarkDelivered}>
              POD uploaded → Mark delivered
            </button>
          )}
        </>
      )}
    </div>
  );
}

function TaskItem({ task, onComplete, pending = false }: { task?: OperationTask; onComplete: (taskId: string, metadata?: Record<string, unknown>) => void; pending?: boolean }) {
  if (!task) return null;
  const done = taskComplete(task);
  return (
    <div className={`task-item ${done ? "done" : ""}`}>
      <div className="task-dot">{done ? "✓" : ""}</div>
      <div style={{ flex: 1 }}>
        <div className="task-main">{task.title}</div>
        <div className="task-meta">{task.description || formatStatus(task.stageKey)}</div>
      </div>
      {!done && <button className="btn btn-gh btn-xs" type="button" disabled={pending} onClick={() => onComplete(task.id)}>{pending ? "Saving..." : "Complete"}</button>}
    </div>
  );
}

function ExpressDetail({ shipment, subTab, setSubTab, onMessage, onSyncTracking, syncPending, teamCard, noteCard }: {
  shipment: OperationShipmentDetail;
  subTab: string;
  setSubTab: (value: string) => void;
  onMessage: (options?: { channel?: CommunicationChannel; template?: string }) => void;
  onSyncTracking: () => void;
  syncPending: boolean;
  teamCard: React.ReactNode;
  noteCard: React.ReactNode;
}) {
  const tab = getExpressTab(shipment);
  return (
    <div className="dp-grid">
      <div>
        {tab === "customs" && <div className="alert alert-amber"><AlertTriangle /> Customs or carrier attention is required. Review the tracking and update the client with a friendly milestone.</div>}
        {tab === "received" && <div className="alert alert-green"><CheckCircle2 /> Received by carrier or prepared for carrier monitoring.</div>}
        {tab === "lastmile" && <div className="alert alert-purple"><MapPin /> Shipment is in the last-mile phase. Keep the recipient updated.</div>}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="tab-bar">
            {["track", "details", "notes"].map((tabKey) => (
              <button key={tabKey} className={`tab-btn ${subTab === tabKey ? "active" : ""}`} type="button" onClick={() => setSubTab(tabKey)}>
                {tabKey === "track" ? <MapPin /> : tabKey === "details" ? <FileText /> : <MessageSquare />} {tabKey === "track" ? "Tracking" : tabKey === "details" ? "Details" : "Notes & mentions"}
              </button>
            ))}
          </div>
          <div className="tab-content">
            {subTab === "track" && (
              <>
                <div className="alert alert-blue">
                  <MapPin />
                  <span>{shipment.carrierTrackingNumber || shipment.trackingNumber} via {shipment.carrierName || "carrier"}</span>
                  <button className="btn btn-blue btn-xs" style={{ marginLeft: "auto" }} type="button" onClick={onSyncTracking} disabled={syncPending}>
                    <RefreshCw className={syncPending ? "animate-spin" : ""} />
                    {syncPending ? "Syncing..." : "Sync now"}
                  </button>
                </div>
                <TrackingSteps shipment={shipment} variant="express" />
              </>
            )}
            {subTab === "details" && <ShipmentInfoRows shipment={shipment} />}
            {subTab === "notes" && noteCard}
          </div>
        </div>
      </div>
      <SidePanel shipment={shipment} teamCard={teamCard} />
    </div>
  );
}

function AttentionDetail({ shipment, onMessage, onSpecial, onResolve, teamCard, noteCard }: {
  shipment: OperationShipmentDetail;
  onMessage: (options?: { channel?: CommunicationChannel; template?: string }) => void;
  onSpecial: () => void;
  onResolve: () => void;
  teamCard: React.ReactNode;
  noteCard: React.ReactNode;
}) {
  const flag = shipment.attentionFlags?.[0];
  const hoursStale = Math.max(0, Math.round((Date.now() - new Date(shipment.updatedAt).getTime()) / 36e5));
  return (
    <div className="dp-grid">
      <div>
        <div className="card" style={{ borderColor: "var(--amber-bd)", background: "var(--amber-lt)" }}>
          <div className="card-title"><AlertTriangle /> {issueLabels[flag?.issueType || ""] || "Needs attention"}</div>
          <div className="sc-row"><span className="sc-key">Current stage</span><span className="sc-val">{formatStatus(shipment.status)}</span></div>
          <div className="sc-row"><span className="sc-key">Hours since update</span><span className="sc-val red">{hoursStale}h</span></div>
          <div className="sc-row"><span className="sc-key">Details</span><span className="sc-val red">{flag?.details || shipment.carrierStatus || "Operational follow-up required"}</span></div>
        </div>
        <TimelineCard shipment={shipment} />
        {noteCard}
      </div>
      <div>
        <div className="card">
          <div className="card-title"><ShieldCheck /> Quick actions</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button className="btn btn-amber btn-sm" type="button" onClick={() => onMessage({ template: "delay" })}>Contact client - explain delay</button>
            <button className="btn btn-blue btn-sm" type="button">Call carrier for update</button>
            <button className="btn btn-purple btn-sm" type="button" onClick={onSpecial}>Escalate to Special Handling</button>
            <button className="btn btn-green btn-sm" type="button" onClick={onResolve}>Mark as resolved</button>
          </div>
        </div>
        <ShipmentInfoCard shipment={shipment} />
        {teamCard}
      </div>
    </div>
  );
}

function SpecialDetail({ shipment, users, subTab, setSubTab, onMessage, onResolve, teamCard, noteCard }: {
  shipment: OperationShipmentDetail;
  users: OperationUser[];
  subTab: string;
  setSubTab: (value: string) => void;
  onMessage: (options?: { channel?: CommunicationChannel; template?: string }) => void;
  onResolve: () => void;
  teamCard: React.ReactNode;
  noteCard: React.ReactNode;
}) {
  const special = shipment.specialHandling;
  return (
    <div className="dp-grid">
      <div>
        <div className={`alert ${special?.priority === "urgent" ? "alert-red" : "alert-amber"}`}>
          <ShieldCheck /> <div><strong>Special handling reason:</strong> {special?.reason || "Priority monitoring"}</div>
        </div>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="tab-bar">
            {["track", "actions", "notes"].map((tabKey) => (
              <button key={tabKey} className={`tab-btn ${subTab === tabKey ? "active" : ""}`} type="button" onClick={() => setSubTab(tabKey)}>
                {tabKey === "track" ? <MapPin /> : tabKey === "actions" ? <ShieldCheck /> : <MessageSquare />} {formatStatus(tabKey)}
              </button>
            ))}
          </div>
          <div className="tab-content">
            {subTab === "track" && <TrackingSteps shipment={shipment} variant={shipment.shipmentKind === "DDP" ? "d2d" : "express"} />}
            {subTab === "actions" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button className="btn btn-amber btn-sm" type="button" onClick={() => onMessage({ template: "update" })}>Send priority update to client</button>
                <button className="btn btn-blue btn-sm" type="button">Schedule follow-up call</button>
                <button className="btn btn-gh btn-sm" type="button">Add to daily ops report</button>
                <button className="btn btn-green btn-sm" type="button" onClick={onResolve}>Mark issue resolved</button>
              </div>
            )}
            {subTab === "notes" && noteCard}
          </div>
        </div>
      </div>
      <div>
        <ShipmentInfoCard shipment={shipment} />
        {teamCard}
      </div>
    </div>
  );
}

function SidePanel({ shipment, teamCard }: {
  shipment: OperationShipmentDetail;
  teamCard: React.ReactNode;
}) {
  return (
    <div className="dp-side">
      <ShipmentInfoCard shipment={shipment} />
      {teamCard}
      <PricingCard shipment={shipment} />
      <AccountingCard shipment={shipment} />
      <TimelineCard shipment={shipment} compact />
    </div>
  );
}

function ShipmentInfoCard({ shipment }: { shipment: OperationShipmentDetail }) {
  return (
    <div className="card">
      <div className="card-title"><FileText /> Shipment info</div>
      <ShipmentInfoRows shipment={shipment} />
    </div>
  );
}

function ShipmentInfoRows({ shipment }: { shipment: OperationShipmentDetail }) {
  return (
    <>
      <div className="sc-row"><span className="sc-key">Client</span><span className="sc-val">{shipment.clientName}</span></div>
      <div className="sc-row"><span className="sc-key">Phone</span><span className="sc-val">{shipment.recipient.phone || "Not set"}</span></div>
      <div className="sc-row"><span className="sc-key">Method</span><span className="sc-val">{getMethod(shipment)}</span></div>
      <div className="sc-row"><span className="sc-key">Origin</span><span className="sc-val">{shipment.sender.city || shipment.sender.country}</span></div>
      <div className="sc-row"><span className="sc-key">Destination</span><span className="sc-val">{shipment.recipient.city || shipment.recipient.country}</span></div>
      <div className="sc-row"><span className="sc-key">Carrier</span><span className="sc-val">{shipment.carrierName || "Manual"}</span></div>
      <div className="sc-row"><span className="sc-key">Tracking no.</span><span className="sc-val">{shipment.carrierTrackingNumber || shipment.trackingNumber}</span></div>
      <div className="sc-row"><span className="sc-key">Status</span><span className="sc-val">{formatStatus(shipment.status)}</span></div>
      <div className="sc-row"><span className="sc-key">ETA</span><span className="sc-val green">{formatDate(shipment.estimatedDelivery)}</span></div>
    </>
  );
}

function TeamAssignedCard({
  shipment,
  users,
  selectedUserIds,
  setSelectedUserIds,
  onSave,
  pending,
}: {
  shipment: OperationShipmentDetail;
  users: OperationUser[];
  selectedUserIds: string[];
  setSelectedUserIds: (value: string[]) => void;
  onSave: () => void;
  pending: boolean;
}) {
  const currentAssignedIds = shipment.assignedTeam.map((member) => member.userId);
  const isDirty = currentAssignedIds.join("|") !== selectedUserIds.join("|");

  const toggleUser = (userId: string) => {
    setSelectedUserIds(
      selectedUserIds.includes(userId)
        ? selectedUserIds.filter((id) => id !== userId)
        : [...selectedUserIds, userId],
    );
  };

  return (
    <div className="card">
      <div className="card-title"><Users /> Team Assigned</div>
      {shipment.assignedTeam.length === 0 ? (
        <div className="empty" style={{ marginBottom: 12 }}>No team members are currently assigned.</div>
      ) : (
        <div className="team-stack">
          {shipment.assignedTeam.map((member) => (
            <div className="team-member" key={member.userId}>
              <div className="team-copy">
                <div className="team-name" title={member.displayName || member.username}>
                  {member.displayName || member.username}
                </div>
                <div className="team-meta">
                  @{member.username} · {member.level ? formatStatus(member.level) : "Operations"}{member.assignedAt ? ` · ${formatDate(member.assignedAt)}` : ""}
                </div>
              </div>
              <span className={`badge ${member.isPrimary ? "b-blue" : "b-gray"}`}>
                {member.isPrimary ? "Primary" : "Assigned"}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="field-label" style={{ marginTop: 12 }}>Update assigned team</div>
      <div className="team-selector">
        {users.map((user) => (
          <button
            key={user.id}
            type="button"
            className={`team-toggle ${selectedUserIds.includes(user.id) ? "selected" : ""}`}
            onClick={() => toggleUser(user.id)}
            title={`@${user.username}`}
          >
            <span className="team-toggle-name">@{user.username}</span>
            <span className="team-toggle-meta">{user.operationProfile?.level ? formatStatus(user.operationProfile.level) : "Agent"}</span>
          </button>
        ))}
      </div>

      <button
        className="btn btn-pr btn-sm"
        type="button"
        style={{ width: "100%", marginTop: 12 }}
        disabled={pending || selectedUserIds.length === 0 || !isDirty}
        onClick={onSave}
      >
        <Users /> {pending ? "Saving..." : "Save team assignment"}
      </button>
    </div>
  );
}

function PricingCard({ shipment }: { shipment: OperationShipmentDetail }) {
  const finalPrice = Number(shipment.finalPrice || 0);
  const baseRate = Number(shipment.financialBreakdown?.baseRate || 0);
  const markup = Math.max(0, finalPrice - baseRate);
  const adjustments = Number(shipment.ddpChargeConfig?.totalAdjustmentsAmountSar || 0);
  return (
    <div className="card">
      <div className="card-title"><DollarSign /> Pricing breakdown</div>
      {shipment.financialBreakdown ? (
        <>
          <div className="sc-row"><span className="sc-key">Base rate</span><span className="sc-val">{money(String(baseRate), shipment.currency)}</span></div>
          <div className="sc-row"><span className="sc-key">Markup</span><span className="sc-val green">+{money(String(markup), shipment.currency)}</span></div>
          <div className="sc-row"><span className="sc-key">Client total</span><span className="sc-val">{money(shipment.finalPrice, shipment.currency)}</span></div>
          {adjustments > 0 && <div className="sc-row"><span className="sc-key">Open adjustments</span><span className="sc-val amber">+{money(String(adjustments), "SAR")}</span></div>}
        </>
      ) : (
        <>
          <div className="sc-row"><span className="sc-key">Client total</span><span className="sc-val">{money(shipment.finalPrice, shipment.currency)}</span></div>
          {adjustments > 0 && <div className="sc-row"><span className="sc-key">Open adjustments</span><span className="sc-val amber">+{money(String(adjustments), "SAR")}</span></div>}
        </>
      )}
    </div>
  );
}

function AccountingCard({ shipment }: { shipment: OperationShipmentDetail }) {
  if (!shipment.financialBreakdown) {
    return (
      <div className="card">
        <div className="card-title"><DollarSign /> Accounting snapshot</div>
        <div className="alert alert-blue" style={{ marginBottom: 0 }}><ShieldCheck /> Operations users see final price only. Financial breakdown is restricted to Super Admin.</div>
      </div>
    );
  }
  const entries = [
    ["Cost amount", shipment.financialBreakdown.costAmountSar],
    ["Sell tax", shipment.financialBreakdown.sellTaxAmountSar],
    ["Revenue excl. tax", shipment.financialBreakdown.revenueExcludingTaxAmountSar],
    ["System cost total", shipment.financialBreakdown.systemCostTotalAmountSar],
    ["Client total", shipment.financialBreakdown.clientTotalAmountSar],
  ];
  return (
    <div className="card">
      <div className="card-title"><DollarSign /> Accounting snapshot</div>
      {entries.map(([label, value]) => (
        <div className="sc-row" key={label}><span className="sc-key">{label}</span><span className="sc-val">{value || "0.00"}</span></div>
      ))}
    </div>
  );
}

function TimelineCard({ shipment, compact = false }: { shipment: OperationShipmentDetail; compact?: boolean }) {
  const events = shipment.operationEvents.slice(0, compact ? 5 : 12);
  return (
    <div className="card">
      <div className="card-title"><Clock3 /> Activity log</div>
      {events.length === 0 ? (
        <div className="empty">No activity yet.</div>
      ) : (
        <div className="timeline">
          {events.map((event) => (
            <div className="tl-item" key={event.id}>
              <div className={`tl-dot ${event.eventType.includes("error") ? "red" : event.eventType.includes("assigned") ? "blue" : "orange"}`} />
              <div>
                <div className="tl-msg">{event.title}</div>
                {event.description && <div className="si-meta">{event.description}</div>}
                <div className="tl-time">{formatDate(event.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrackingSteps({ shipment, variant }: { shipment: OperationShipmentDetail; variant: "d2d" | "express" }) {
  const labels = variant === "d2d"
    ? ["Received at origin warehouse", "Customs clearance - origin", "Departed origin", "In transit", "Arrived destination", "Customs clearance - destination", "Last-mile delivery"]
    : ["Order created and booked", "Picked up from sender", "Received at carrier origin facility", "Departed origin", "In transit", "Arrived destination facility", "Customs clearance", "Out for delivery", "Delivered"];
  const active = variant === "d2d" ? getD2DStage(shipment) + 1 : expressTabs.findIndex((tab) => tab.key === getExpressTab(shipment)) + 3;
  return (
    <div className="track-wrap">
      {labels.map((label, index) => {
        const state = shipment.status === "delivered" || index < active - 1 ? "done" : index === active - 1 ? "active-step" : "pending";
        return (
          <div className="track-step" key={label}>
            <div className={`track-dot ${state}`}>{state === "done" ? "✓" : state === "active-step" ? "●" : "○"}</div>
            <div className="track-info">
              <div className="track-title">{label}</div>
              <div className="track-sub">{state === "done" ? "Completed" : state === "active-step" ? "In progress" : "Pending"}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NotesCard({ shipment, users, body, setBody, visibility, setVisibility, mentionUserIds, setMentionUserIds, onSubmit, pending }: {
  shipment: OperationShipmentDetail;
  users: AssignedTeamMember[];
  body: string;
  setBody: (value: string) => void;
  visibility: NoteVisibility;
  setVisibility: (value: NoteVisibility) => void;
  mentionUserIds: string[];
  setMentionUserIds: (value: string[]) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  const toggleMention = (user: AssignedTeamMember) => {
    const active = mentionUserIds.includes(user.userId);
    setMentionUserIds(active ? mentionUserIds.filter((id) => id !== user.userId) : [...mentionUserIds, user.userId]);
    if (!active && !body.includes(`@${user.username}`)) {
      setBody(`@${user.username} ${body}`.trim());
    }
  };
  return (
    <div className="card">
      <div className="card-title"><MessageSquare /> Notes & mentions</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {shipment.operationNotes.length === 0 ? (
          <div className="empty">No notes yet.</div>
        ) : (
          shipment.operationNotes.map((note) => (
            <div className="note-box" key={note.id}>
              <div className="note-header">
                <span className="note-author">{note.authorName || "Operations"}</span>
                <span className="note-time">{formatDate(note.createdAt)}</span>
              </div>
              <div className="note-text">{note.body}</div>
              <div className="dp-meta"><span className={`badge ${note.visibility === "CLIENT" ? "b-blue" : "b-gray"}`}>{note.visibility === "CLIENT" ? "Client update" : "Internal"}</span></div>
            </div>
          ))
        )}
      </div>
      <div className="note-input-wrap">
        <div className="field-label">Mention team member</div>
        <div className="mention-list">
          {users.length === 0 ? (
            <div className="team-meta">Assign team members first to mention them here.</div>
          ) : users.map((user) => (
            <button key={user.userId} type="button" className={`mention-chip ${mentionUserIds.includes(user.userId) ? "selected" : ""}`} onClick={() => toggleMention(user)}>
              @{user.username}
            </button>
          ))}
        </div>
        <textarea className="note-input" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Add a note... Only assigned team members can be mentioned" />
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
          <div style={{ width: 150, maxWidth: 150 }}>
            <OperationsSelect
              value={visibility}
              onChange={(value) => setVisibility(value as NoteVisibility)}
              placeholder="Visibility"
              triggerClassName="h-[34px] text-[12px] shadow-none"
              options={[
                { value: "INTERNAL", label: "Internal" },
                { value: "CLIENT", label: "Client update" },
              ]}
            />
          </div>
          <button className="btn btn-pr btn-sm" type="button" disabled={!body.trim() || pending} onClick={onSubmit}>
            <Send /> {visibility === "CLIENT" ? "Send update" : "Post note"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChargeTypeModal(props: {
  open: boolean;
  shipment?: OperationShipmentDetail;
  onClose: () => void;
  onSelectExtraWeight: () => void;
  onSelectCustomCharge: () => void;
}) {
  const billingUnit = props.shipment?.ddpChargeConfig?.billingUnit || "KG";

  return (
    <div className={`modal-overlay ${props.open ? "open" : ""}`} onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Add shipment charges">
        <div className="modal-title">Add Charges</div>
        <div className="modal-sub">{props.shipment ? `${props.shipment.clientName} · ${shortId(props.shipment)}` : "DDP shipment"}</div>
        <div className="modal-body">
          <div className="alert alert-blue">
            <DollarSign />
            This DDP lane is currently billed by <strong>{billingUnit}</strong>. Choose the charge type you want to add.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <button className="btn btn-pr" type="button" style={{ minHeight: 120, justifyContent: "flex-start", alignItems: "flex-start", textAlign: "left", flexDirection: "column", gap: 8 }} onClick={props.onSelectExtraWeight}>
              <strong>{billingUnit === "CBM" ? "Adjust Shipment Volume" : "Adjust Shipment Weight"}</strong>
              <span style={{ fontWeight: 500, opacity: 0.85 }}>Update the shipment quantity, preview the lane-based billing impact, and refresh the invoice.</span>
            </button>
            <button className="btn btn-amber" type="button" style={{ minHeight: 120, justifyContent: "flex-start", alignItems: "flex-start", textAlign: "left", flexDirection: "column", gap: 8 }} onClick={props.onSelectCustomCharge}>
              <strong>Extra Charges</strong>
              <span style={{ fontWeight: 500, opacity: 0.85 }}>Create a separate DDP adjustment invoice for any manual charge you need to add.</span>
            </button>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-gh" type="button" onClick={props.onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function ExtraWeightChargeModal(props: {
  open: boolean;
  shipment?: OperationShipmentDetail;
  value: string;
  setValue: (value: string) => void;
  preview: ExtraWeightPreview | null;
  previewError: string;
  previewLoading: boolean;
  pending: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const chargeConfig = props.shipment?.ddpChargeConfig;
  const billingUnit = chargeConfig?.billingUnit || "KG";
  const canSubmit = Number(props.value) >= 0 && !props.previewLoading && !props.previewError;

  return (
    <div className={`modal-overlay ${props.open ? "open" : ""}`} onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Adjust shipment weight">
        <div className="modal-title">{billingUnit === "CBM" ? "Adjust Shipment Volume" : "Adjust Shipment Weight"}</div>
        <div className="modal-sub">{props.shipment ? `${props.shipment.clientName} · ${shortId(props.shipment)}` : "DDP shipment"}</div>
        <div className="modal-body">
          <div className="alert alert-blue">
            <Package />
            This shipment is billed by <strong>{billingUnit}</strong>. Increase or decrease the measured quantity and we will recalculate the invoice using the configured lane formula for this shipment.
          </div>
          {chargeConfig && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="card" style={{ margin: 0 }}>
                <div className="sc-key">Original lane quantity</div>
                <div className="sc-val" style={{ textAlign: "left", fontSize: 18 }}>{quantity(chargeConfig.currentRawQuantity)} {billingUnit}</div>
              </div>
              <div className="card" style={{ margin: 0 }}>
                <div className="sc-key">Current shipment quantity</div>
                <div className="sc-val" style={{ textAlign: "left", fontSize: 18 }}>{quantity(chargeConfig.currentMeasuredQuantity)} {billingUnit}</div>
              </div>
              <div className="card" style={{ margin: 0 }}>
                <div className="sc-key">Current extra invoice</div>
                <div className="sc-val green" style={{ textAlign: "left", fontSize: 18 }}>{money(chargeConfig.extraWeightAmountSar, "SAR")}</div>
              </div>
              <div className="card" style={{ margin: 0 }}>
                <div className="sc-key">Current extra billed {billingUnit}</div>
                <div className="sc-val" style={{ textAlign: "left", fontSize: 18 }}>{quantity(chargeConfig.extraWeightQuantity)} {billingUnit}</div>
              </div>
            </div>
          )}
          <div className="field-group">
            <label className="field-label">Updated shipment quantity ({billingUnit})</label>
            <input
              className="field-input"
              value={props.value}
              onChange={(event) => props.setValue(event.target.value)}
              inputMode="decimal"
              placeholder={`Enter updated ${billingUnit}`}
            />
            <div className="field-hint">Set the full shipment quantity the warehouse recorded. We will derive the extra billed amount automatically.</div>
          </div>
          {props.previewLoading && <div className="alert alert-blue"><RefreshCw className="animate-spin" /> Recalculating lane pricing...</div>}
          {props.previewError && <div className="alert alert-red"><AlertTriangle /> {props.previewError}</div>}
          {props.preview && (
            <div className="checkpoint-grid">
              <div className="card" style={{ margin: 0 }}>
                <div className="sc-key">Adjustment</div>
                <div className="sc-val" style={{ textAlign: "left", fontSize: 18 }}>
                  {props.preview.deltaAmountSar >= 0 ? "+" : ""}{money(String(props.preview.deltaAmountSar), "SAR")}
                </div>
              </div>
              <div className="card" style={{ margin: 0 }}>
                <div className="sc-key">Projected extra invoice</div>
                <div className="sc-val green" style={{ textAlign: "left", fontSize: 18 }}>{money(String(props.preview.amountSar), "SAR")}</div>
              </div>
              <div className="card" style={{ margin: 0 }}>
                <div className="sc-key">New extra billed {billingUnit}</div>
                <div className="sc-val" style={{ textAlign: "left", fontSize: 18 }}>{quantity(String(props.preview.targetExtraWeightQuantity))} {billingUnit}</div>
              </div>
              <div className="card" style={{ margin: 0 }}>
                <div className="sc-key">Effective rate</div>
                <div className="sc-val" style={{ textAlign: "left", fontSize: 18 }}>{money(String(props.preview.rateSarPerUnit), "SAR")} / {billingUnit}</div>
              </div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-gh" type="button" onClick={props.onClose}>Cancel</button>
          <button className="btn btn-pr" type="button" disabled={!canSubmit || props.pending} onClick={props.onSubmit}>
            {props.pending ? "Updating..." : "Update invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomChargeModal(props: {
  open: boolean;
  shipment?: OperationShipmentDetail;
  description: string;
  setDescription: (value: string) => void;
  amount: string;
  setAmount: (value: string) => void;
  pending: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const canSubmit = props.description.trim().length >= 3 && Number(props.amount) > 0;

  return (
    <div className={`modal-overlay ${props.open ? "open" : ""}`} onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Add extra charge">
        <div className="modal-title">Add Extra Charges</div>
        <div className="modal-sub">{props.shipment ? `${props.shipment.clientName} · ${shortId(props.shipment)}` : "DDP shipment"}</div>
        <div className="modal-body">
          <div className="alert alert-amber">
            <DollarSign />
            This will create a separate DDP adjustment invoice for the client.
          </div>
          <div className="field-group">
            <label className="field-label">Charge description</label>
            <input
              className="field-input"
              value={props.description}
              onChange={(event) => props.setDescription(event.target.value)}
              placeholder="e.g. Handling surcharge, re-packing, documentation fee"
            />
          </div>
          <div className="field-group">
            <label className="field-label">Amount (SAR)</label>
            <input
              className="field-input"
              value={props.amount}
              onChange={(event) => props.setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
            />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-gh" type="button" onClick={props.onClose}>Cancel</button>
          <button className="btn btn-amber" type="button" disabled={!canSubmit || props.pending} onClick={props.onSubmit}>
            {props.pending ? "Creating..." : "Create extra charge"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SpecialHandlingModal(props: {
  open: boolean;
  shipment?: OperationShipmentDetail;
  users: OperationUser[];
  reason: string;
  setReason: (value: string) => void;
  customReason: string;
  setCustomReason: (value: string) => void;
  priority: string;
  setPriority: (value: string) => void;
  assignee: string;
  setAssignee: (value: string) => void;
  notes: string;
  setNotes: (value: string) => void;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const reason = props.reason === "custom" ? props.customReason : props.reason;
  return (
    <div className={`modal-overlay ${props.open ? "open" : ""}`} onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Move to Special Handling">
        <div className="modal-title">⭐ Mark as Special Handling</div>
        <div className="modal-sub">{props.shipment ? `${props.shipment.clientName} · ${shortId(props.shipment)}` : "Shipment"}</div>
        <div className="modal-body">
          <div className="field-group">
            <label className="field-label">Reason</label>
            <OperationsSelect
              value={props.reason}
              onChange={props.setReason}
              placeholder="— Select reason —"
              triggerClassName="h-[34px] text-[12px] shadow-none"
              options={[
                ...specialHandlingReasons.map((option) => ({ value: option, label: option })),
                { value: "custom", label: "Other (enter manually)" },
              ]}
            />
          </div>
          {props.reason === "custom" && (
            <div className="field-group">
              <label className="field-label">Custom reason</label>
              <textarea
                className="note-input"
                value={props.customReason}
                onChange={(event) => props.setCustomReason(event.target.value)}
                placeholder="Describe why this shipment needs special handling..."
                style={{ minHeight: 60 }}
              />
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field-group">
              <label className="field-label">Priority</label>
              <OperationsSelect
                value={props.priority}
                onChange={props.setPriority}
                placeholder="Select priority"
                triggerClassName="h-[34px] text-[12px] shadow-none"
                options={[
                  { value: "urgent", label: "🔴 Urgent" },
                  { value: "high", label: "🟡 High" },
                  { value: "normal", label: "⚪ Normal" },
                ]}
              />
            </div>
            <div className="field-group">
              <label className="field-label">Assign to</label>
              <OperationsSelect
                value={props.assignee}
                onChange={props.setAssignee}
                placeholder="Assign operator"
                includeEmptyOption
                emptyOptionLabel="Keep current owner"
                triggerClassName="h-[34px] text-[12px] shadow-none"
                options={props.users.map((user) => ({ value: user.id, label: user.username }))}
              />
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">
              Additional notes <span style={{ color: "var(--g400)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
            </label>
            <textarea
              className="note-input"
              value={props.notes}
              onChange={(event) => props.setNotes(event.target.value)}
              placeholder="Any additional instructions for the team..."
              style={{ minHeight: 60 }}
            />
          </div>
          <div className="alert alert-amber">
            <AlertTriangle />
            This shipment will be moved to the Special Handling queue and the assigned team member will be notified.
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-gh" type="button" onClick={props.onClose}>Cancel</button>
          <button className="btn btn-amber" type="button" disabled={!reason.trim() || props.pending} onClick={props.onConfirm}>
            <ShieldCheck /> {props.pending ? "Saving..." : "Confirm special handling"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ClientMessageModal(props: {
  open: boolean;
  shipment?: OperationShipmentDetail;
  channel: CommunicationChannel;
  setChannel: (value: CommunicationChannel) => void;
  template: string;
  setTemplate: (value: string) => void;
  message: string;
  setMessage: (value: string) => void;
  pending: boolean;
  onClose: () => void;
  onSend: () => void;
}) {
  const channelLabel = getCommunicationChannelLabel(props.channel);

  return (
    <div className={`modal-overlay ${props.open ? "open" : ""}`} onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Send client update">
        <div className="modal-title">Send Client Update</div>
        <div className="modal-sub">To: {props.shipment?.recipient.name || props.shipment?.clientName || "Client"}</div>
        <div className="modal-body">
          <div className="field-group">
            <label className="field-label">Channel</label>
            <div className="action-row">
              <button
                className={`btn btn-sm ${props.channel === "whatsapp" ? "btn-gh" : "btn-outline"}`}
                type="button"
                onClick={() => props.setChannel("whatsapp")}
              >
                <MessageCircle /> WhatsApp
              </button>
              <button
                className={`btn btn-sm ${props.channel === "email" ? "btn-blue" : "btn-outline"}`}
                type="button"
                onClick={() => props.setChannel("email")}
              >
                <Mail /> Email
              </button>
              <button
                className={`btn btn-sm ${props.channel === "sms" ? "btn-purple" : "btn-outline"}`}
                type="button"
                onClick={() => props.setChannel("sms")}
              >
                <Smartphone /> SMS
              </button>
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">Template</label>
            <OperationsSelect
              value={props.template}
              onChange={props.setTemplate}
              placeholder="Select template"
              triggerClassName="h-[34px] text-[12px] shadow-none"
              options={communicationTemplateOptions.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
          </div>
          <div className="field-group">
            <label className="field-label">Message</label>
            <textarea className="note-input" value={props.message} onChange={(event) => props.setMessage(event.target.value)} style={{ minHeight: 90 }} />
          </div>
          {props.channel !== "email" && (
            <div className="alert alert-amber">
              <AlertTriangle />
              {channelLabel} is not configured yet. If you continue, we will save this update to the shipment timeline and notify the operator with a friendly reminder.
            </div>
          )}
          <div className="wa-preview">{props.message || `Your ${channelLabel.toLowerCase()} preview will appear here.`}</div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-gh" type="button" onClick={props.onClose}>Cancel</button>
          <button className="btn btn-pr" type="button" disabled={!props.message.trim() || props.pending} onClick={props.onSend}>
            {props.pending ? "Sending..." : props.channel === "email" ? "Send email" : props.channel === "sms" ? "Send SMS" : "Send WhatsApp"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OperationsHub({ layout = "operations" }: OperationsHubProps) {
  const content = <OperationsHubContent />;
  return layout === "admin" ? <AdminLayout>{content}</AdminLayout> : <OperationsLayout>{content}</OperationsLayout>;
}
