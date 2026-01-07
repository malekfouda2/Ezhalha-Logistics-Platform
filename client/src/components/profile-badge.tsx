import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Crown, Star, User } from "lucide-react";

interface ProfileBadgeProps {
  profile: string;
  showIcon?: boolean;
  className?: string;
}

const profileStyles: Record<string, { bg: string; icon: typeof Crown }> = {
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

export function ProfileBadge({ profile, showIcon = true, className }: ProfileBadgeProps) {
  const config = profileStyles[profile] || profileStyles.regular;
  const label = profileLabels[profile] || profile;
  const Icon = config.icon;

  return (
    <Badge
      className={cn(
        "px-3 py-1 text-xs font-semibold border-0 gap-1.5",
        config.bg,
        className
      )}
      data-testid={`badge-profile-${profile}`}
    >
      {showIcon && <Icon className="h-3 w-3" />}
      {label}
    </Badge>
  );
}
