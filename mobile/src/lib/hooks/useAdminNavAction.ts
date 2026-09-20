import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";

import { AdminNavItem } from "@/constants/adminNavigation";

/**
 * What tapping a row in the AdminDrawer overlay does. None of these nav
 * targets are built into the app yet — every one still lives on the web
 * admin panel — so a tap surfaces a toast rather than a dead route.
 */
export function useAdminNavAction() {
  const { t } = useTranslation();

  return (item: AdminNavItem, allowed: boolean) => {
    if (!allowed) return;

    Toast.show({
      type: "info",
      text1: t(`admin.nav.items.${item.labelKey}`),
      text2: t("admin.comingSoonTitle"),
    });
  };
}
