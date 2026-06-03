import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Award,
  BriefcaseBusiness,
  Crown,
  Gem,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  User,
  Zap,
  type LucideIcon,
} from "lucide-react";

interface ProfileBadgeProps {
  profile: string;
  showIcon?: boolean;
  className?: string;
}

interface ProfileBadgeMeta {
  profile: string;
  displayName: string;
  badgeColor: string | null;
  badgeStyle?: "solid" | "gradient" | string | null;
  badgeGradientFrom?: string | null;
  badgeGradientTo?: string | null;
  badgeGradientAngle?: number | null;
  badgeIcon?: string | null;
}

const badgeIcons: Record<string, LucideIcon> = {
  award: Award,
  briefcase: BriefcaseBusiness,
  crown: Crown,
  gem: Gem,
  rocket: Rocket,
  shield: ShieldCheck,
  sparkles: Sparkles,
  star: Star,
  user: User,
  zap: Zap,
};

const profileStyles: Record<string, { bg: string; icon: LucideIcon }> = {
  vip: {
    bg: "bg-gradient-to-r from-amber-500 to-orange-500 text-white",
    icon: Crown,
  },
  mid_level: {
    bg: "bg-gradient-to-r from-blue-500 to-indigo-500 text-white",
    icon: Star,
  },
  regular: {
    bg: "bg-secondary text-secondary-foreground",
    icon: User,
  },
};

const profileLabels: Record<string, string> = {
  vip: "VIP",
  mid_level: "Mid-Level",
  regular: "Regular",
};

function getReadableTextColor(hex: string) {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#111827" : "#FFFFFF";
}

function isHexColor(value: string | null | undefined): value is string {
  return typeof value === "string" && /^#([0-9a-fA-F]{6})$/.test(value);
}

function getGradientTextColor(from: string, to: string) {
  const fromColor = getReadableTextColor(from);
  const toColor = getReadableTextColor(to);
  return fromColor === "#111827" && toColor === "#111827" ? "#111827" : "#FFFFFF";
}

export function ProfileBadge({ profile, showIcon = true, className }: ProfileBadgeProps) {
  const { data: profileBadges } = useQuery<ProfileBadgeMeta[]>({
    queryKey: ["/api/profile-badges"],
  });

  const profileMeta = profileBadges?.find((item) => item.profile === profile);
  const config = profileStyles[profile] || profileStyles.regular;
  const label = profileMeta?.displayName || profileLabels[profile] || profile;
  const Icon = (profileMeta?.badgeIcon && badgeIcons[profileMeta.badgeIcon]) || config.icon;
  const badgeColor = profileMeta?.badgeColor || null;
  const gradientFrom = profileMeta?.badgeGradientFrom;
  const gradientTo = profileMeta?.badgeGradientTo;
  const isGradient =
    profileMeta?.badgeStyle === "gradient" &&
    isHexColor(gradientFrom) &&
    isHexColor(gradientTo);
  const customStyle = isGradient
    ? {
        backgroundImage: `linear-gradient(${profileMeta?.badgeGradientAngle ?? 135}deg, ${gradientFrom}, ${gradientTo})`,
        color: getGradientTextColor(gradientFrom, gradientTo),
        boxShadow: `0 8px 22px ${gradientTo}33`,
      }
    : badgeColor
      ? { backgroundColor: badgeColor, color: getReadableTextColor(badgeColor) }
      : undefined;

  return (
    <Badge
      className={cn(
        "px-3 py-1 text-xs font-semibold border-0 gap-1.5",
        customStyle ? "" : config.bg,
        className
      )}
      style={customStyle}
      data-testid={`badge-profile-${profile}`}
    >
      {showIcon && <Icon className="h-3 w-3" />}
      {label}
    </Badge>
  );
}
