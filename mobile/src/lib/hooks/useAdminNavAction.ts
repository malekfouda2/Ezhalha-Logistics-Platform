import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";

import { AdminNavItem } from "@/constants/adminNavigation";

// Nav targets that are actually built into the app — everything else still lives on the
// web admin panel only, so a tap on those surfaces a toast rather than a dead route.
const ROUTES: Record<string, string> = {
  clients: "/(protected)/(admin)/client",
  "account-managers": "/(protected)/(admin)/client/account-managers",
};

/**
 * What tapping a row in the AdminDrawer overlay (or the More tab) does.
 */
export function useAdminNavAction() {
  const { t } = useTranslation();

  return (item: AdminNavItem, allowed: boolean) => {
    if (!allowed) return;

    const route = ROUTES[item.key];
    if (route) {
      router.push(route as any);
      return;
    }

    Toast.show({
      type: "info",
      text1: t(`admin.nav.items.${item.labelKey}`),
      text2: t("admin.comingSoonTitle"),
    });
  };
}
