import { useTranslation } from "react-i18next";

import { useAdminAccess } from "@/lib/hooks/useAdminAccess";

/**
 * Display name, initials and translated role label for the signed-in admin —
 * shared by the drawer header, the dashboard header and the More tab so the
 * three don't compute it three slightly different ways.
 */
export function useAdminIdentity() {
  const { t } = useTranslation();
  const { user, isAccountManager, permissions, role } = useAdminAccess();

  const displayName = user?.fullName || user?.username || "—";
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";

  // Prefer the real role name (e.g. "Super Admin", "Operations Manager") — the generic
  // Administrator/Account Manager label is only a fallback for while it's loading.
  const roleLabel = role?.name || t(isAccountManager ? "admin.roles.accountManager" : "admin.roles.administrator");
  const permissionsLabel =
    permissions.length > 0 ? t("admin.permissionsCount", { count: permissions.length }) : "";

  return { displayName, initials, roleLabel, permissionsLabel, email: user?.email };
}
