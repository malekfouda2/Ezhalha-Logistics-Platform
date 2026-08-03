import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LocalCarriersTab } from "@/pages/admin/local-pricing";
import { VirtualCarriersTab } from "@/pages/admin/virtual-carriers";
import { DdpLanesTab } from "@/pages/admin/ddp-pricing";
import { LoadingScreen, LoadingSpinner } from "@/components/loading-spinner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Award,
  BriefcaseBusiness,
  Crown,
  Gem,
  Percent,
  Edit,
  TrendingUp,
  Info,
  Plus,
  Trash2,
  Settings,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  User,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { SarSymbol, SarAmount, formatSAR } from "@/components/sar-symbol";
import type { DdpPricingTier, PricingRule, PricingTier } from "@shared/schema";

interface TierFormData {
  minAmount: string;
  marginPercentage: string;
}
interface DdpTierFormData extends TierFormData {
  billingUnit: "KG" | "CBM";
}

type BadgeStyle = "solid" | "gradient";

interface BadgeDesignState {
  badgeColor: string;
  badgeStyle: BadgeStyle;
  badgeGradientFrom: string;
  badgeGradientTo: string;
  badgeGradientAngle: string;
  badgeIcon: string;
}

const badgeIconOptions: Array<{ key: string; label: string; icon: LucideIcon }> = [
  { key: "sparkles", label: "Sparkles", icon: Sparkles },
  { key: "crown", label: "Crown", icon: Crown },
  { key: "gem", label: "Gem", icon: Gem },
  { key: "rocket", label: "Rocket", icon: Rocket },
  { key: "shield", label: "Shield", icon: ShieldCheck },
  { key: "award", label: "Award", icon: Award },
  { key: "star", label: "Star", icon: Star },
  { key: "briefcase", label: "Briefcase", icon: BriefcaseBusiness },
  { key: "zap", label: "Zap", icon: Zap },
  { key: "user", label: "User", icon: User },
];

const premiumGradientPresets = [
  { name: "Royal Gold", from: "#F97316", to: "#FACC15", angle: "135", icon: "crown" },
  { name: "Sapphire", from: "#2563EB", to: "#7C3AED", angle: "135", icon: "gem" },
  { name: "Emerald", from: "#059669", to: "#22C55E", angle: "125", icon: "shield" },
  { name: "Carbon", from: "#111827", to: "#4B5563", angle: "145", icon: "sparkles" },
  { name: "Sunset", from: "#EF4444", to: "#F59E0B", angle: "120", icon: "rocket" },
];

const defaultBadgeDesign: BadgeDesignState = {
  badgeColor: "#6B7280",
  badgeStyle: "gradient",
  badgeGradientFrom: "#2563EB",
  badgeGradientTo: "#7C3AED",
  badgeGradientAngle: "135",
  badgeIcon: "sparkles",
};

function normalizeHexColor(value: string): string {
  const normalized = value.trim().toUpperCase();
  return /^#([0-9A-F]{6})$/.test(normalized) ? normalized : "#6B7280";
}

function hexToRgb(hex: string) {
  const normalized = normalizeHexColor(hex).slice(1);
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  const safe = [r, g, b].map((channel) =>
    Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0"),
  );
  return `#${safe.join("").toUpperCase()}`;
}

function getReadableTextColor(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#111827" : "#FFFFFF";
}

function getReadableGradientTextColor(from: string, to: string) {
  const fromText = getReadableTextColor(from);
  const toText = getReadableTextColor(to);
  return fromText === "#111827" && toText === "#111827" ? "#111827" : "#FFFFFF";
}

function getBadgePreviewStyle(design: BadgeDesignState) {
  const safeColor = normalizeHexColor(design.badgeColor);
  const safeFrom = normalizeHexColor(design.badgeGradientFrom);
  const safeTo = normalizeHexColor(design.badgeGradientTo);
  const safeAngle = Math.max(0, Math.min(360, Number(design.badgeGradientAngle) || 135));

  if (design.badgeStyle === "gradient") {
    return {
      backgroundImage: `linear-gradient(${safeAngle}deg, ${safeFrom}, ${safeTo})`,
      color: getReadableGradientTextColor(safeFrom, safeTo),
      boxShadow: `0 10px 28px ${safeTo}33`,
    };
  }

  return {
    backgroundColor: safeColor,
    color: getReadableTextColor(safeColor),
  };
}

function getRuleBadgeDesign(rule: PricingRule): BadgeDesignState {
  return {
    badgeColor: rule.badgeColor || defaultBadgeDesign.badgeColor,
    badgeStyle: rule.badgeStyle === "gradient" ? "gradient" : "solid",
    badgeGradientFrom: rule.badgeGradientFrom || defaultBadgeDesign.badgeGradientFrom,
    badgeGradientTo: rule.badgeGradientTo || defaultBadgeDesign.badgeGradientTo,
    badgeGradientAngle: String(rule.badgeGradientAngle ?? defaultBadgeDesign.badgeGradientAngle),
    badgeIcon: rule.badgeIcon || "star",
  };
}

function RgbColorPicker({
  value,
  onChange,
  label,
  disabled,
  testIdPrefix,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  testIdPrefix: string;
}) {
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const safeValue = normalizeHexColor(value);
  const rgb = hexToRgb(safeValue);

  const updateChannel = (channel: "r" | "g" | "b", nextValue: string) => {
    const parsed = Number(nextValue);
    const nextRgb = {
      ...rgb,
      [channel]: Number.isFinite(parsed) ? parsed : 0,
    };
    onChange(rgbToHex(nextRgb.r, nextRgb.g, nextRgb.b));
  };

  const openColorPicker = () => {
    if (!colorInputRef.current || disabled) {
      return;
    }

    if ("showPicker" in colorInputRef.current && typeof colorInputRef.current.showPicker === "function") {
      colorInputRef.current.showPicker();
      return;
    }

    colorInputRef.current.click();
  };

  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <Input
          ref={colorInputRef}
          type="color"
          value={safeValue}
          onChange={(e) => onChange(normalizeHexColor(e.target.value))}
          disabled={disabled}
          className="h-11 w-16 cursor-pointer p-1"
          data-testid={`${testIdPrefix}-swatch`}
        />
        <Input
          value={safeValue}
          onChange={(e) => onChange(normalizeHexColor(e.target.value))}
          disabled={disabled}
          className="font-mono uppercase"
          data-testid={`${testIdPrefix}-hex`}
        />
        <button
          type="button"
          onClick={openColorPicker}
          disabled={disabled}
          className="flex min-w-[140px] items-center justify-center rounded-md border px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: safeValue, color: getReadableTextColor(safeValue) }}
          data-testid={`${testIdPrefix}-preview`}
        >
          Badge Preview
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">R</Label>
          <Input
            type="number"
            min="0"
            max="255"
            value={rgb.r}
            onChange={(e) => updateChannel("r", e.target.value)}
            disabled={disabled}
            data-testid={`${testIdPrefix}-r`}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">G</Label>
          <Input
            type="number"
            min="0"
            max="255"
            value={rgb.g}
            onChange={(e) => updateChannel("g", e.target.value)}
            disabled={disabled}
            data-testid={`${testIdPrefix}-g`}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">B</Label>
          <Input
            type="number"
            min="0"
            max="255"
            value={rgb.b}
            onChange={(e) => updateChannel("b", e.target.value)}
            disabled={disabled}
            data-testid={`${testIdPrefix}-b`}
          />
        </div>
      </div>
    </div>
  );
}

function PricingBadgePreview({
  label,
  design,
  className,
}: {
  label: string;
  design: BadgeDesignState;
  className?: string;
}) {
  const Icon = badgeIconOptions.find((option) => option.key === design.badgeIcon)?.icon || Star;

  return (
    <Badge
      className={`gap-1.5 border-0 px-3 py-1 text-sm font-semibold ${className || ""}`}
      style={getBadgePreviewStyle(design)}
    >
      <Icon className="h-3.5 w-3.5" />
      {label || "Profile Badge"}
    </Badge>
  );
}

function BadgeDesigner({
  label,
  displayName,
  value,
  onChange,
  disabled,
  testIdPrefix,
}: {
  label: string;
  displayName: string;
  value: BadgeDesignState;
  onChange: (next: BadgeDesignState) => void;
  disabled?: boolean;
  testIdPrefix: string;
}) {
  const setField = <K extends keyof BadgeDesignState>(field: K, nextValue: BadgeDesignState[K]) => {
    onChange({ ...value, [field]: nextValue });
  };

  const applyPreset = (preset: (typeof premiumGradientPresets)[number]) => {
    onChange({
      ...value,
      badgeStyle: "gradient",
      badgeGradientFrom: preset.from,
      badgeGradientTo: preset.to,
      badgeGradientAngle: preset.angle,
      badgeIcon: preset.icon,
    });
  };

  return (
    <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Label>{label}</Label>
          <p className="text-xs text-muted-foreground">Design the badge clients will see for this pricing profile.</p>
        </div>
        <PricingBadgePreview label={displayName} design={value} />
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg bg-background/70 p-1">
        {(["solid", "gradient"] as BadgeStyle[]).map((style) => (
          <button
            key={style}
            type="button"
            onClick={() => setField("badgeStyle", style)}
            disabled={disabled}
            className={`rounded-md px-3 py-2 text-sm font-semibold capitalize transition ${
              value.badgeStyle === style
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted"
            }`}
            data-testid={`${testIdPrefix}-style-${style}`}
          >
            {style}
          </button>
        ))}
      </div>

      {value.badgeStyle === "gradient" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
            {premiumGradientPresets.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => applyPreset(preset)}
                disabled={disabled}
                className="h-16 rounded-xl border p-2 text-left text-[11px] font-semibold text-white shadow-sm transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundImage: `linear-gradient(${preset.angle}deg, ${preset.from}, ${preset.to})` }}
                data-testid={`${testIdPrefix}-preset-${preset.name.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {preset.name}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <RgbColorPicker
              label="Gradient Start"
              value={value.badgeGradientFrom}
              onChange={(next) => setField("badgeGradientFrom", next)}
              disabled={disabled}
              testIdPrefix={`${testIdPrefix}-gradient-from`}
            />
            <RgbColorPicker
              label="Gradient End"
              value={value.badgeGradientTo}
              onChange={(next) => setField("badgeGradientTo", next)}
              disabled={disabled}
              testIdPrefix={`${testIdPrefix}-gradient-to`}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={`${testIdPrefix}-angle`}>Gradient Angle</Label>
              <span className="text-sm font-medium text-muted-foreground">{value.badgeGradientAngle || "135"} deg</span>
            </div>
            <Input
              id={`${testIdPrefix}-angle`}
              type="range"
              min="0"
              max="360"
              value={value.badgeGradientAngle}
              onChange={(e) => setField("badgeGradientAngle", e.target.value)}
              disabled={disabled}
              data-testid={`${testIdPrefix}-angle`}
            />
          </div>
        </div>
      ) : (
        <RgbColorPicker
          label="Solid Badge Color"
          value={value.badgeColor}
          onChange={(next) => setField("badgeColor", next)}
          disabled={disabled}
          testIdPrefix={`${testIdPrefix}-solid-color`}
        />
      )}

      <div className="space-y-2">
        <Label>Badge Icon</Label>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
          {badgeIconOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = value.badgeIcon === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setField("badgeIcon", option.key)}
                disabled={disabled}
                className={`flex h-11 items-center justify-center rounded-lg border transition ${
                  isSelected
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
                title={option.label}
                data-testid={`${testIdPrefix}-icon-${option.key}`}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ClientMarkupTab() {
  const { toast } = useToast();
  const adminAccess = useAdminAccess();
  const [selectedRule, setSelectedRule] = useState<PricingRule | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<PricingRule | null>(null);
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);
  
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editMargin, setEditMargin] = useState("");
  const [editDdpMargin, setEditDdpMargin] = useState("");
  const [editBadgeDesign, setEditBadgeDesign] = useState<BadgeDesignState>(defaultBadgeDesign);
  
  const [newProfile, setNewProfile] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newMargin, setNewMargin] = useState("15");
  const [newDdpMargin, setNewDdpMargin] = useState("15");
  const [newBadgeDesign, setNewBadgeDesign] = useState<BadgeDesignState>(defaultBadgeDesign);

  const [newTiers, setNewTiers] = useState<TierFormData[]>([{ minAmount: "0", marginPercentage: "15" }]);
  const [editingTiers, setEditingTiers] = useState<(PricingTier & { isNew?: boolean; isDeleted?: boolean })[]>([]);
  const [newDdpTiers, setNewDdpTiers] = useState<DdpTierFormData[]>([
    { billingUnit: "KG", minAmount: "0", marginPercentage: "15" },
    { billingUnit: "CBM", minAmount: "0", marginPercentage: "15" },
  ]);
  const [editingDdpTiers, setEditingDdpTiers] = useState<(DdpPricingTier & { isNew?: boolean; isDeleted?: boolean })[]>([]);

  const canCreatePricing = adminAccess.hasPermission("pricing-rules", "create");
  const canUpdatePricing = adminAccess.hasPermission("pricing-rules", "update");
  const canDeletePricing = adminAccess.hasPermission("pricing-rules", "delete");

  const { data: pricingRules, isLoading } = useQuery<PricingRule[]>({
    queryKey: ["/api/admin/pricing"],
  });

  const { data: currentTiers, isLoading: tiersLoading } = useQuery<PricingTier[]>({
    queryKey: ["/api/admin/pricing", expandedProfile, "tiers"],
    queryFn: async () => {
      if (!expandedProfile) return [];
      const res = await fetch(`/api/admin/pricing/${expandedProfile}/tiers`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tiers");
      return res.json();
    },
    enabled: !!expandedProfile,
  });

  const { data: currentDdpTiers, isLoading: ddpTiersLoading } = useQuery<DdpPricingTier[]>({
    queryKey: ["/api/admin/pricing", expandedProfile, "ddp-tiers"],
    queryFn: async () => {
      if (!expandedProfile) return [];
      const res = await fetch(`/api/admin/pricing/${expandedProfile}/ddp-tiers`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch Door To Door Freight tiers");
      return res.json();
    },
    enabled: !!expandedProfile,
  });

  useEffect(() => {
    if (currentTiers && expandedProfile) {
      setEditingTiers(currentTiers.map(t => ({ ...t })));
    }
  }, [currentTiers, expandedProfile]);

  useEffect(() => {
    if (currentDdpTiers && expandedProfile) {
      setEditingDdpTiers(currentDdpTiers.map(t => ({ ...t })));
    }
  }, [currentDdpTiers, expandedProfile]);

  const createProfileMutation = useMutation({
    mutationFn: async (data: { profile: string; displayName: string; marginPercentage: string; ddpMarginPercentage: string } & BadgeDesignState) => {
      const res = await apiRequest("POST", "/api/admin/pricing", data);
      return res.json();
    },
    onSuccess: async (newRule) => {
      // Create initial tiers for the new profile
      for (const tier of newTiers) {
        if (tier.minAmount && tier.marginPercentage) {
          await apiRequest("POST", `/api/admin/pricing/${newRule.id}/tiers`, {
            minAmount: parseFloat(tier.minAmount),
            marginPercentage: parseFloat(tier.marginPercentage),
          });
        }
      }
      for (const tier of newDdpTiers) {
        if (tier.minAmount && tier.marginPercentage) {
          await apiRequest("POST", `/api/admin/pricing/${newRule.id}/ddp-tiers`, {
            billingUnit: tier.billingUnit,
            minAmount: parseFloat(tier.minAmount),
            marginPercentage: parseFloat(tier.marginPercentage),
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pricing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile-badges"] });
      setIsCreateOpen(false);
      setNewProfile("");
      setNewDisplayName("");
      setNewMargin("15");
      setNewDdpMargin("15");
      setNewBadgeDesign(defaultBadgeDesign);
      setNewTiers([{ minAmount: "0", marginPercentage: "15" }]);
      setNewDdpTiers([
        { billingUnit: "KG", minAmount: "0", marginPercentage: "15" },
        { billingUnit: "CBM", minAmount: "0", marginPercentage: "15" },
      ]);
      toast({ title: "Profile created", description: "New pricing profile has been created with tiered pricing." });
    },
    onError: (error) => {
      toast({
        title: "Failed to create profile",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async ({ id, displayName, marginPercentage, ddpMarginPercentage, ...badgeDesign }: { id: string; displayName?: string; marginPercentage?: string; ddpMarginPercentage?: string } & Partial<BadgeDesignState>) => {
      const res = await apiRequest("PATCH", `/api/admin/pricing/${id}`, { displayName, marginPercentage, ddpMarginPercentage, ...badgeDesign });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pricing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile-badges"] });
      setIsEditOpen(false);
      toast({ title: "Profile updated", description: "The pricing profile has been updated." });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const deleteProfileMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/pricing/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pricing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile-badges"] });
      setDeleteConfirmOpen(false);
      setRuleToDelete(null);
      toast({ title: "Profile deleted", description: "The pricing profile has been removed." });
    },
    onError: (error) => {
      toast({
        title: "Failed to delete",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const saveTiersMutation = useMutation({
    mutationFn: async ({ profileId, tiers }: { profileId: string; tiers: typeof editingTiers }) => {
      // Delete removed tiers
      for (const tier of tiers.filter(t => t.isDeleted && !t.isNew)) {
        await apiRequest("DELETE", `/api/admin/pricing/tiers/${tier.id}`);
      }
      // Create new tiers
      for (const tier of tiers.filter(t => t.isNew && !t.isDeleted)) {
        await apiRequest("POST", `/api/admin/pricing/${profileId}/tiers`, {
          minAmount: parseFloat(tier.minAmount as any),
          marginPercentage: parseFloat(tier.marginPercentage as any),
        });
      }
      // Update existing tiers
      for (const tier of tiers.filter(t => !t.isNew && !t.isDeleted)) {
        await apiRequest("PATCH", `/api/admin/pricing/tiers/${tier.id}`, {
          minAmount: parseFloat(tier.minAmount as any),
          marginPercentage: parseFloat(tier.marginPercentage as any),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pricing", expandedProfile, "tiers"] });
      toast({ title: "Tiers saved", description: "Pricing tiers have been updated." });
    },
    onError: (error) => {
      toast({
        title: "Failed to save tiers",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const saveDdpTiersMutation = useMutation({
    mutationFn: async ({ profileId, tiers }: { profileId: string; tiers: typeof editingDdpTiers }) => {
      for (const tier of tiers.filter(t => t.isDeleted && !t.isNew)) {
        await apiRequest("DELETE", `/api/admin/pricing/ddp-tiers/${tier.id}`);
      }
      for (const tier of tiers.filter(t => t.isNew && !t.isDeleted)) {
        await apiRequest("POST", `/api/admin/pricing/${profileId}/ddp-tiers`, {
          billingUnit: tier.billingUnit,
          minAmount: parseFloat(tier.minAmount as any),
          marginPercentage: parseFloat(tier.marginPercentage as any),
        });
      }
      for (const tier of tiers.filter(t => !t.isNew && !t.isDeleted)) {
        await apiRequest("PATCH", `/api/admin/pricing/ddp-tiers/${tier.id}`, {
          billingUnit: tier.billingUnit,
          minAmount: parseFloat(tier.minAmount as any),
          marginPercentage: parseFloat(tier.marginPercentage as any),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pricing", expandedProfile, "ddp-tiers"] });
      toast({ title: "Door To Door Freight tiers saved", description: "Door To Door Freight pricing tiers have been updated." });
    },
    onError: (error) => {
      toast({
        title: "Failed to save Door To Door Freight tiers",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleEditProfile = (rule: PricingRule) => {
    setSelectedRule(rule);
    setEditDisplayName(rule.displayName || rule.profile);
    setEditMargin(String(rule.marginPercentage));
    setEditDdpMargin(String(rule.ddpMarginPercentage));
    setEditBadgeDesign(getRuleBadgeDesign(rule));
    setIsEditOpen(true);
  };

  const handleSaveEdit = () => {
    if (selectedRule) {
      updateProfileMutation.mutate({
        id: selectedRule.id,
        displayName: editDisplayName,
        marginPercentage: editMargin,
        ddpMarginPercentage: editDdpMargin,
        ...editBadgeDesign,
      });
    }
  };

  const handleCreateProfile = () => {
    createProfileMutation.mutate({
      profile: newProfile,
      displayName: newDisplayName,
      marginPercentage: newMargin,
      ddpMarginPercentage: newDdpMargin,
      ...newBadgeDesign,
    });
  };

  const handleDeleteClick = (rule: PricingRule) => {
    setRuleToDelete(rule);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (ruleToDelete) {
      deleteProfileMutation.mutate(ruleToDelete.id);
    }
  };

  const toggleExpandProfile = (profileId: string) => {
    if (expandedProfile === profileId) {
      setExpandedProfile(null);
      setEditingTiers([]);
      setEditingDdpTiers([]);
    } else {
      setExpandedProfile(profileId);
    }
  };

  const addNewTierToEdit = () => {
    const maxMin = Math.max(...editingTiers.filter(t => !t.isDeleted).map(t => Number(t.minAmount)), 0);
    setEditingTiers([...editingTiers, {
      id: `new-${Date.now()}`,
      profileId: expandedProfile!,
      minAmount: String(maxMin + 100),
      marginPercentage: "10",
      createdAt: new Date(),
      isNew: true,
    }]);
  };

  const updateEditingTier = (index: number, field: "minAmount" | "marginPercentage", value: string) => {
    const updated = [...editingTiers];
    (updated[index] as any)[field] = value;
    setEditingTiers(updated);
  };

  const markTierForDeletion = (index: number) => {
    const updated = [...editingTiers];
    updated[index].isDeleted = true;
    setEditingTiers(updated);
  };

  const addNewTierToCreate = () => {
    const maxMin = Math.max(...newTiers.map(t => Number(t.minAmount) || 0), 0);
    setNewTiers([...newTiers, { minAmount: String(maxMin + 100), marginPercentage: "10" }]);
  };

  const updateNewTier = (index: number, field: keyof TierFormData, value: string) => {
    const updated = [...newTiers];
    updated[index][field] = value;
    setNewTiers(updated);
  };

  const removeNewTier = (index: number) => {
    if (newTiers.length > 1) {
      setNewTiers(newTiers.filter((_, i) => i !== index));
    }
  };

  const handleSaveTiers = () => {
    if (expandedProfile) {
      saveTiersMutation.mutate({ profileId: expandedProfile, tiers: editingTiers });
    }
  };

  const addNewDdpTierToEdit = () => {
    const billingUnit = "KG";
    const maxMin = Math.max(...editingDdpTiers.filter(t => !t.isDeleted && t.billingUnit === billingUnit).map(t => Number(t.minAmount)), 0);
    setEditingDdpTiers([...editingDdpTiers, {
      id: `new-ddp-${Date.now()}`,
      profileId: expandedProfile!,
      billingUnit,
      minAmount: String(maxMin + 100),
      marginPercentage: "10",
      createdAt: new Date(),
      isNew: true,
    }]);
  };

  const updateEditingDdpTier = (index: number, field: "billingUnit" | "minAmount" | "marginPercentage", value: string) => {
    const updated = [...editingDdpTiers];
    (updated[index] as any)[field] = value;
    setEditingDdpTiers(updated);
  };

  const markDdpTierForDeletion = (index: number) => {
    const updated = [...editingDdpTiers];
    updated[index].isDeleted = true;
    setEditingDdpTiers(updated);
  };

  const handleSaveDdpTiers = () => {
    if (expandedProfile) {
      saveDdpTiersMutation.mutate({ profileId: expandedProfile, tiers: editingDdpTiers });
    }
  };

  const addNewDdpTierToCreate = () => {
    const maxMin = Math.max(...newDdpTiers.filter(t => t.billingUnit === "KG").map(t => Number(t.minAmount) || 0), 0);
    setNewDdpTiers([...newDdpTiers, { billingUnit: "KG", minAmount: String(maxMin + 100), marginPercentage: "10" }]);
  };

  const updateNewDdpTier = (index: number, field: keyof DdpTierFormData, value: string) => {
    const updated = [...newDdpTiers];
    if (field === "billingUnit") {
      updated[index].billingUnit = value as DdpTierFormData["billingUnit"];
    } else {
      updated[index][field] = value;
    }
    setNewDdpTiers(updated);
  };

  const removeNewDdpTier = (index: number) => {
    if (newDdpTiers.length > 1) {
      setNewDdpTiers(newDdpTiers.filter((_, i) => i !== index));
    }
  };

  const sortedRules = pricingRules?.sort((a, b) => {
    const order = ["regular", "mid_level", "vip"];
    const aIndex = order.indexOf(a.profile);
    const bIndex = order.indexOf(b.profile);
    if (aIndex === -1 && bIndex === -1) return a.profile.localeCompare(b.profile);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return 1;
    return aIndex - bIndex;
  });

  if (isLoading) {
    return <LoadingScreen message="Loading pricing rules..." />;
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-muted-foreground text-sm max-w-2xl">
            Per-profile client markup: a default markup %, optional value-based tiers, and the Door To Door Freight markup %.
            The percentages here apply on top of the carrier / lane base rate.
          </p>
          {canCreatePricing && (
            <Button onClick={() => setIsCreateOpen(true)} data-testid="button-add-profile">
              <Plus className="h-4 w-4 mr-2" />
              Add Profile
            </Button>
          )}
        </div>

        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">How tiered pricing works</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Each profile can have multiple pricing tiers based on shipment value.
                  For example: shipments under 100 SAR = 100% markup, 100-500 SAR = 50% markup, over 500 SAR = 25% markup.
                  The system automatically applies the appropriate markup based on the base rate.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {sortedRules?.map((rule) => (
            <Card key={rule.id} className="overflow-visible">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <PricingBadgePreview
                      label={rule.displayName || rule.profile}
                      design={getRuleBadgeDesign(rule)}
                      className="text-base"
                    />
                    <span className="text-xs text-muted-foreground">
                      Key: {rule.profile}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleExpandProfile(rule.id)}
                      data-testid={`button-expand-${rule.profile}`}
                    >
                      {expandedProfile === rule.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                    {canUpdatePricing && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditProfile(rule)}
                        data-testid={`button-edit-${rule.profile}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                    {canDeletePricing && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteClick(rule)}
                        data-testid={`button-delete-${rule.profile}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>

              {expandedProfile === rule.id && (
                <CardContent className="border-t pt-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        Pricing Tiers
                      </h4>
                      {canUpdatePricing && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={addNewTierToEdit}
                          data-testid="button-add-tier"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Tier
                        </Button>
                      )}
                    </div>

                    {tiersLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <LoadingSpinner />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {editingTiers.filter(t => !t.isDeleted).length === 0 ? (
                          <div className="text-center py-4 text-muted-foreground">
                            <p className="text-sm">No pricing tiers defined.</p>
                            <p className="text-xs">Using default markup of {rule.marginPercentage}% for all shipments.</p>
                          </div>
                        ) : (
                          editingTiers.filter(t => !t.isDeleted).map((tier, index) => {
                            const actualIndex = editingTiers.findIndex(t => t.id === tier.id);
                            return (
                              <div key={tier.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                                <div className="flex items-center gap-2 flex-1">
                                  <span className="text-sm text-muted-foreground whitespace-nowrap">Shipments</span>
                                  <SarSymbol size="xs" />
                                  <Input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={tier.minAmount}
                                    onChange={(e) => updateEditingTier(actualIndex, "minAmount", e.target.value)}
                                    className="w-24"
                                    disabled={!canUpdatePricing}
                                    data-testid={`input-tier-min-${index}`}
                                  />
                                  <span className="text-sm text-muted-foreground whitespace-nowrap">and above</span>
                                </div>
                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    max="1000"
                                    step="0.5"
                                    value={tier.marginPercentage}
                                    onChange={(e) => updateEditingTier(actualIndex, "marginPercentage", e.target.value)}
                                    className="w-20"
                                    disabled={!canUpdatePricing}
                                    data-testid={`input-tier-margin-${index}`}
                                  />
                                  <Percent className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm text-muted-foreground">markup</span>
                                </div>
                                {canUpdatePricing && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => markTierForDeletion(actualIndex)}
                                    data-testid={`button-delete-tier-${index}`}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}

                    {canUpdatePricing && (
                      <div className="flex justify-end pt-2">
                        <Button
                          onClick={handleSaveTiers}
                          disabled={saveTiersMutation.isPending}
                          data-testid="button-save-tiers"
                        >
                          {saveTiersMutation.isPending ? "Saving..." : "Save Tiers"}
                        </Button>
                      </div>
                    )}

                    <div className="mt-4 p-4 rounded-lg border bg-background">
                      <p className="text-sm font-medium mb-3">Example Calculations</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        {editingTiers.filter(t => !t.isDeleted).sort((a, b) => Number(a.minAmount) - Number(b.minAmount)).map((tier, i, arr) => {
                          const baseExample = Number(tier.minAmount) + 50;
                          const margin = Number(tier.marginPercentage);
                          const clientPays = baseExample + (baseExample * margin / 100);
                          const nextTier = arr[i + 1];
                          const rangeText = nextTier 
                            ? `${tier.minAmount} - ${Number(nextTier.minAmount) - 0.01} SAR`
                            : `${tier.minAmount}+ SAR`;
                          return (
                            <div key={tier.id} className="p-3 rounded bg-muted/50">
                              <p className="text-muted-foreground mb-2">{rangeText}</p>
                              <div className="space-y-1">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Base Rate</span>
                                  <span><SarAmount amount={baseExample} /></span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Markup ({margin}%)</span>
                                  <span className="text-green-600 dark:text-green-400">+<SarAmount amount={baseExample * margin / 100} /></span>
                                </div>
                                <div className="flex justify-between font-medium border-t pt-1">
                                  <span>Client Pays</span>
                                  <span><SarAmount amount={clientPays} /></span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="border-t pt-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium flex items-center gap-2">
                            <Settings className="h-4 w-4" />
                            Door To Door Freight Pricing Tiers
                          </h4>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Applied to manually fulfilled Door To Door Freight lanes using the billable KG for air or billable CBM for sea.
                          </p>
                        </div>
                        {canUpdatePricing && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={addNewDdpTierToEdit}
                            data-testid="button-add-ddp-tier"
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Door To Door Freight Tier
                          </Button>
                        )}
                      </div>

                      {ddpTiersLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <LoadingSpinner />
                        </div>
                      ) : (
                        <div className="mt-4 space-y-3">
                          {editingDdpTiers.filter(t => !t.isDeleted).length === 0 ? (
                            <div className="text-center py-4 text-muted-foreground">
                              <p className="text-sm">No Door To Door Freight pricing tiers defined.</p>
                              <p className="text-xs">Using the Door To Door Freight fallback markup of {rule.ddpMarginPercentage}% for all Door To Door Freight shipments.</p>
                            </div>
                          ) : (
                            editingDdpTiers.filter(t => !t.isDeleted).map((tier, index) => {
                              const actualIndex = editingDdpTiers.findIndex(t => t.id === tier.id);
                              return (
                                <div key={tier.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                                  <div className="flex items-center gap-2 flex-1">
                                    <span className="text-sm text-muted-foreground whitespace-nowrap">Billable quantity</span>
                                    <Input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={tier.minAmount}
                                      onChange={(e) => updateEditingDdpTier(actualIndex, "minAmount", e.target.value)}
                                      className="w-24"
                                      disabled={!canUpdatePricing}
                                      data-testid={`input-ddp-tier-min-${index}`}
                                    />
                                    <Select value={tier.billingUnit} onValueChange={(value) => updateEditingDdpTier(actualIndex, "billingUnit", value)} disabled={!canUpdatePricing}>
                                      <SelectTrigger className="w-24" data-testid={`select-ddp-tier-unit-${index}`}><SelectValue /></SelectTrigger>
                                      <SelectContent><SelectItem value="KG">KG</SelectItem><SelectItem value="CBM">CBM</SelectItem></SelectContent>
                                    </Select>
                                    <span className="text-sm text-muted-foreground whitespace-nowrap">and above</span>
                                  </div>
                                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                  <div className="flex items-center gap-2">
                                    <Input
                                      type="number"
                                      min="0"
                                      max="1000"
                                      step="0.5"
                                      value={tier.marginPercentage}
                                      onChange={(e) => updateEditingDdpTier(actualIndex, "marginPercentage", e.target.value)}
                                      className="w-20"
                                      disabled={!canUpdatePricing}
                                      data-testid={`input-ddp-tier-margin-${index}`}
                                    />
                                    <Percent className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm text-muted-foreground">markup</span>
                                  </div>
                                  {canUpdatePricing && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => markDdpTierForDeletion(actualIndex)}
                                      data-testid={`button-delete-ddp-tier-${index}`}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}

                      {canUpdatePricing && (
                        <div className="flex justify-end pt-4">
                          <Button
                            onClick={handleSaveDdpTiers}
                            disabled={saveDdpTiersMutation.isPending}
                            data-testid="button-save-ddp-tiers"
                          >
                            {saveDdpTiersMutation.isPending ? "Saving..." : "Save Door To Door Freight Tiers"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <SarSymbol size="sm" />
                Revenue Impact
              </CardTitle>
              <CardDescription>
                How markups affect your revenue
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {sortedRules?.map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{rule.displayName || rule.profile}</Badge>
                      <span className="text-sm text-muted-foreground">clients</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      Tiered pricing active
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Markup Strategy Tips
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">1.</span>
                  <span>Higher markups on lower-value shipments (under 100 SAR)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">2.</span>
                  <span>Lower markups on high-value shipments to stay competitive</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">3.</span>
                  <span>VIP profiles get lower markups across all tiers</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">4.</span>
                  <span>Add more tiers for granular pricing control</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit Pricing Profile</DialogTitle>
            <DialogDescription>
              Update the name for this profile. Manage tiers by expanding the profile card.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editDisplayName">Display Name</Label>
              <Input
                id="editDisplayName"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder="e.g., VIP, Enterprise"
                disabled={!canUpdatePricing}
                data-testid="input-edit-display-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editMargin">Default Markup (fallback)</Label>
              <div className="relative">
                <Input
                  id="editMargin"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={editMargin}
                  onChange={(e) => setEditMargin(e.target.value)}
                  className="pr-10"
                  disabled={!canUpdatePricing}
                  data-testid="input-edit-margin"
                />
                <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">
                Used when no pricing tiers are defined
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editDdpMargin">Door To Door Freight Default Markup (fallback)</Label>
              <div className="relative">
                <Input id="editDdpMargin" type="number" min="0" max="100" step="0.5" value={editDdpMargin} onChange={(e) => setEditDdpMargin(e.target.value)} className="pr-10" disabled={!canUpdatePricing} />
                <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">Used for manual Door To Door Freight lane pricing when no Door To Door Freight pricing tiers are defined.</p>
            </div>
            <BadgeDesigner
              label="Badge Design"
              displayName={editDisplayName}
              value={editBadgeDesign}
              onChange={setEditBadgeDesign}
              disabled={!canUpdatePricing}
              testIdPrefix="designer-edit-badge"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={!canUpdatePricing || updateProfileMutation.isPending || !editDisplayName || !editMargin || !editDdpMargin}
              data-testid="button-save-edit"
            >
              {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canCreatePricing && (
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Create Pricing Profile</DialogTitle>
            <DialogDescription>
              Add a new pricing profile with tiered markups
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="newDisplayName">Display Name</Label>
                <Input
                  id="newDisplayName"
                  value={newDisplayName}
                  onChange={(e) => {
                    setNewDisplayName(e.target.value);
                    setNewProfile(e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""));
                  }}
                  placeholder="e.g., Enterprise, Wholesale"
                  data-testid="input-new-display-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newProfile">Profile Key</Label>
                <Input
                  id="newProfile"
                  value={newProfile}
                  onChange={(e) => setNewProfile(e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""))}
                  placeholder="e.g., enterprise"
                  data-testid="input-new-profile"
                />
                <p className="text-xs text-muted-foreground">
                  Unique identifier (lowercase, underscores only)
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="newMargin">Default Markup (fallback)</Label>
              <div className="relative w-32">
                <Input
                  id="newMargin"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={newMargin}
                  onChange={(e) => setNewMargin(e.target.value)}
                  className="pr-10"
                  data-testid="input-new-margin"
                />
                <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newDdpMargin">Door To Door Freight Default Markup (fallback)</Label>
              <div className="relative w-32">
                <Input id="newDdpMargin" type="number" min="0" max="100" step="0.5" value={newDdpMargin} onChange={(e) => setNewDdpMargin(e.target.value)} className="pr-10" />
                <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <BadgeDesigner
              label="Badge Design"
              displayName={newDisplayName}
              value={newBadgeDesign}
              onChange={setNewBadgeDesign}
              testIdPrefix="designer-new-badge"
            />

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <Label>Pricing Tiers</Label>
                <Button variant="outline" size="sm" onClick={addNewTierToCreate} data-testid="button-add-new-tier">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Tier
                </Button>
              </div>
              
              <div className="space-y-3">
                {newTiers.map((tier, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-sm text-muted-foreground whitespace-nowrap">Shipments</span>
                      <span className="text-sm font-medium">$</span>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={tier.minAmount}
                        onChange={(e) => updateNewTier(index, "minAmount", e.target.value)}
                        className="w-24"
                        data-testid={`input-new-tier-min-${index}`}
                      />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">and above</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        max="1000"
                        step="0.5"
                        value={tier.marginPercentage}
                        onChange={(e) => updateNewTier(index, "marginPercentage", e.target.value)}
                        className="w-20"
                        data-testid={`input-new-tier-margin-${index}`}
                      />
                      <Percent className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">markup</span>
                    </div>
                    {newTiers.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeNewTier(index)}
                        data-testid={`button-remove-new-tier-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <Label>Door To Door Freight Pricing Tiers</Label>
                  <p className="mt-1 text-xs text-muted-foreground">Markup formula based on billable KG for air and billable CBM for sea.</p>
                </div>
                <Button variant="outline" size="sm" onClick={addNewDdpTierToCreate} data-testid="button-add-new-ddp-tier">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Door To Door Freight Tier
                </Button>
              </div>

              <div className="space-y-3">
                {newDdpTiers.map((tier, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-sm text-muted-foreground whitespace-nowrap">Billable quantity</span>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={tier.minAmount}
                        onChange={(e) => updateNewDdpTier(index, "minAmount", e.target.value)}
                        className="w-24"
                        data-testid={`input-new-ddp-tier-min-${index}`}
                      />
                      <Select value={tier.billingUnit} onValueChange={(value) => updateNewDdpTier(index, "billingUnit", value)}>
                        <SelectTrigger className="w-24" data-testid={`select-new-ddp-tier-unit-${index}`}><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="KG">KG</SelectItem><SelectItem value="CBM">CBM</SelectItem></SelectContent>
                      </Select>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">and above</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        max="1000"
                        step="0.5"
                        value={tier.marginPercentage}
                        onChange={(e) => updateNewDdpTier(index, "marginPercentage", e.target.value)}
                        className="w-20"
                        data-testid={`input-new-ddp-tier-margin-${index}`}
                      />
                      <Percent className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">markup</span>
                    </div>
                    {newDdpTiers.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeNewDdpTier(index)}
                        data-testid={`button-remove-new-ddp-tier-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateProfile}
              disabled={createProfileMutation.isPending || !newProfile || !newDisplayName || !newMargin || !newDdpMargin}
              data-testid="button-create-profile"
            >
              {createProfileMutation.isPending ? "Creating..." : "Create Profile"}
            </Button>
          </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Pricing Profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the "{ruleToDelete?.displayName || ruleToDelete?.profile}" profile and all its pricing tiers.
              You cannot delete profiles that have clients assigned to them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteProfileMutation.isPending ? "Deleting..." : "Delete Profile"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// "How pricing works" explainer — states the actual formula from the code.
// ---------------------------------------------------------------------------
function HowPricingWorks() {
  return (
    <details className="group rounded-lg border border-primary/20 bg-primary/5 px-4 py-3" open>
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
        <Info className="h-4 w-4 text-primary" />
        How pricing works
        <span className="text-sm font-normal text-muted-foreground">
          — base rate → markup → minimum → 15% VAT
        </span>
        <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="rounded-md border bg-background p-3">
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <Badge className="bg-emerald-600 hover:bg-emerald-600">Local</Badge> Domestic KSA
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            carrier base rate + markup (% or flat), floored at min charge, then +15% VAT (full, DCE).
          </p>
        </div>
        <div className="rounded-md border bg-background p-3">
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <Badge className="bg-sky-600 hover:bg-sky-600">Express</Badge> International
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            live carrier rate + profile markup % (value-tier aware); VAT margin-only on import/export.
          </p>
        </div>
        <div className="rounded-md border bg-background p-3">
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <Badge className="bg-purple-600 hover:bg-purple-600">D2D</Badge> Door To Door Freight
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            billable qty × lane rate, floored at min shipment charge, + profile Door To Door Freight markup %; VAT margin-only.
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Rates come from the carrier APIs where connected; rate-card values are only a fallback. Full
        reference: <code className="text-[11px]">docs/pricing.md</code>.
      </p>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Preview tab — read-only price simulator. Calls POST /api/admin/pricing/preview,
// which reuses the production rate engines. Creates no shipment.
// ---------------------------------------------------------------------------
type PreviewResult = {
  type: string;
  baseRate: number;
  markup: number;
  markupPercentage?: number;
  billingUnit?: string;
  billableQuantity?: number;
  ratePerUnit?: number;
  minChargeApplied?: boolean;
  vat: number;
  vatMode: "full" | "margin";
  clientTotal: number;
};

function PricingPreviewTab() {
  const { toast } = useToast();
  const [previewType, setPreviewType] = useState<"local" | "express" | "ddp">("local");
  const [profile, setProfile] = useState<string>("regular");
  const [result, setResult] = useState<PreviewResult | null>(null);

  // Local fields
  const [carrierCode, setCarrierCode] = useState("SMSA");
  const [weightKg, setWeightKg] = useState("3");
  const [localBase, setLocalBase] = useState("30");
  // Express fields
  const [expressBase, setExpressBase] = useState("400");
  const [expressDirection, setExpressDirection] = useState<"inbound" | "outbound">("outbound");
  // DDP fields
  const [laneId, setLaneId] = useState("");
  const [transportMethod, setTransportMethod] = useState<"air" | "sea">("air");
  const [ddpWeight, setDdpWeight] = useState("12");
  const [ddpCbm, setDdpCbm] = useState("1");

  const { data: rules = [] } = useQuery<PricingRule[]>({ queryKey: ["/api/admin/pricing"] });
  const { data: lanes = [] } = useQuery<any[]>({ queryKey: ["/api/admin/ddp-pricing"] });

  useEffect(() => {
    if (!laneId && lanes.length > 0) setLaneId(lanes[0].id);
  }, [lanes, laneId]);

  const preview = useMutation({
    mutationFn: async () => {
      let payload: Record<string, any> = { type: previewType, profile };
      if (previewType === "local") {
        payload = { ...payload, carrierCode, weightKg: Number(weightKg), baseRate: localBase === "" ? null : Number(localBase) };
      } else if (previewType === "express") {
        payload = { ...payload, baseRate: Number(expressBase), shipmentType: expressDirection, recipientCountryCode: "SA" };
      } else {
        payload = {
          ...payload,
          laneId,
          transportMethod,
          weightKg: Number(ddpWeight),
          totalCbm: Number(ddpCbm),
        };
      }
      const res = await apiRequest("POST", "/api/admin/pricing/preview", payload);
      return (await res.json()) as PreviewResult;
    },
    onSuccess: (data) => setResult(data),
    onError: (error: Error) => {
      setResult(null);
      toast({ title: "Could not compute preview", description: error.message, variant: "destructive" });
    },
  });

  const segBtn = (value: typeof previewType, label: string) => (
    <button
      type="button"
      onClick={() => {
        setPreviewType(value);
        setResult(null);
      }}
      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        previewType === value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Price simulator</CardTitle>
          <CardDescription>Reuses the live rate engine (read-only). No shipment is created.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {segBtn("local", "Local")}
            {segBtn("express", "Express")}
            {segBtn("ddp", "Door To Door Freight")}
          </div>

          <div className="space-y-1">
            <Label>Client profile</Label>
            <Select value={profile} onValueChange={setProfile}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {rules.map((r) => (
                  <SelectItem key={r.id} value={r.profile}>{r.displayName || r.profile}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {previewType === "local" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Carrier</Label>
                <Select value={carrierCode} onValueChange={setCarrierCode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SMSA">SMSA</SelectItem>
                    <SelectItem value="NAQEL">NAQEL</SelectItem>
                    <SelectItem value="JT">J&T Express</SelectItem>
                    <SelectItem value="REDBOX">RedBox</SelectItem>
                    <SelectItem value="ZAJIL">Zajil Express</SelectItem>
                    <SelectItem value="IMILE">iMile</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Weight (kg)</Label>
                <Input type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Carrier base rate (SAR)</Label>
                <Input type="number" value={localBase} onChange={(e) => setLocalBase(e.target.value)} placeholder="blank = use rate-card fallback" />
              </div>
            </div>
          )}

          {previewType === "express" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Direction</Label>
                <Select value={expressDirection} onValueChange={(v) => setExpressDirection(v as "inbound" | "outbound")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outbound">Export (outbound)</SelectItem>
                    <SelectItem value="inbound">Import (inbound)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Carrier base rate (SAR)</Label>
                <Input type="number" value={expressBase} onChange={(e) => setExpressBase(e.target.value)} />
              </div>
            </div>
          )}

          {previewType === "ddp" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Lane</Label>
                <Select value={laneId} onValueChange={setLaneId}>
                  <SelectTrigger><SelectValue placeholder="Select lane" /></SelectTrigger>
                  <SelectContent>
                    {lanes.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.originCountryCode} → {l.destinationCountryCode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Method</Label>
                <Select value={transportMethod} onValueChange={(v) => setTransportMethod(v as "air" | "sea")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="air">Air (per kg)</SelectItem>
                    <SelectItem value="sea">Sea (per cbm)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                {transportMethod === "air" ? (
                  <>
                    <Label>Chargeable weight (kg)</Label>
                    <Input type="number" value={ddpWeight} onChange={(e) => setDdpWeight(e.target.value)} />
                  </>
                ) : (
                  <>
                    <Label>Volume (cbm)</Label>
                    <Input type="number" value={ddpCbm} onChange={(e) => setDdpCbm(e.target.value)} />
                  </>
                )}
              </div>
            </div>
          )}

          <Button className="w-full" onClick={() => preview.mutate()} disabled={preview.isPending}>
            {preview.isPending ? "Calculating..." : "Calculate price"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Client pays</CardTitle>
        </CardHeader>
        <CardContent>
          {!result ? (
            <p className="text-sm text-muted-foreground">Enter values and calculate to see the breakdown.</p>
          ) : (
            <div className="divide-y">
              <div className="flex items-center justify-between py-3">
                <div className="text-sm text-muted-foreground">
                  {result.type === "express" ? "Live carrier rate" : result.type === "ddp" ? "Lane base" : "Carrier base rate"}
                  {result.type === "ddp" && result.billableQuantity != null && (
                    <span className="block text-xs">
                      {result.ratePerUnit} ﷼/{result.billingUnit?.toLowerCase()} × {result.billableQuantity} {result.billingUnit?.toLowerCase()}
                      {result.minChargeApplied ? " · min shipment charge applied" : ""}
                    </span>
                  )}
                </div>
                <span className="font-semibold tabular-nums">{formatSAR(result.baseRate)}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <div className="text-sm text-muted-foreground">
                  Markup
                  {result.markupPercentage != null && <span className="block text-xs">{result.markupPercentage}%</span>}
                </div>
                <span className="font-semibold tabular-nums text-emerald-600">+ {formatSAR(result.markup)}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <div className="text-sm text-muted-foreground">
                  VAT (15%)<span className="block text-xs">{result.vatMode === "full" ? "full (domestic)" : "margin only"}</span>
                </div>
                <span className="font-semibold tabular-nums">{formatSAR(result.vat)}</span>
              </div>
              <div className="flex items-center justify-between rounded-b-md bg-primary/5 py-3">
                <span className="font-semibold">Client total</span>
                <span className="text-xl font-bold tabular-nums text-primary">{formatSAR(result.clientTotal)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const PRICING_TABS = ["markup", "local", "virtual", "ddp", "preview"] as const;
type PricingTabValue = (typeof PRICING_TABS)[number];

export default function AdminPricing() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const requested = new URLSearchParams(search).get("tab") as PricingTabValue | null;
  const activeTab: PricingTabValue = PRICING_TABS.includes(requested as PricingTabValue) ? (requested as PricingTabValue) : "markup";

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Pricing</h1>
          <p className="text-muted-foreground max-w-2xl">
            One place to set what clients pay across every shipment type — domestic, international express,
            and Door To Door Freight.
          </p>
        </div>

        <HowPricingWorks />

        <Tabs value={activeTab} onValueChange={(v) => setLocation(`/admin/pricing?tab=${v}`)}>
          <TabsList>
            <TabsTrigger value="markup">Client Markup</TabsTrigger>
            <TabsTrigger value="local">Local Carriers</TabsTrigger>
            <TabsTrigger value="virtual">Virtual Carriers</TabsTrigger>
            <TabsTrigger value="ddp">Door To Door Freight Lanes</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
          <TabsContent value="markup" className="mt-6"><ClientMarkupTab /></TabsContent>
          <TabsContent value="local" className="mt-6"><LocalCarriersTab /></TabsContent>
          <TabsContent value="virtual" className="mt-6"><VirtualCarriersTab /></TabsContent>
          <TabsContent value="ddp" className="mt-6"><DdpLanesTab /></TabsContent>
          <TabsContent value="preview" className="mt-6"><PricingPreviewTab /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
