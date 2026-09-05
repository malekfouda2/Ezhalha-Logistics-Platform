import { Alert } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { useSignOut } from "@/lib/hooks/useAuth";

/**
 * Shared logout flow: confirm, sign out, then explicitly send the user to
 * login. Signing out also clears the cached auth query, which the protected
 * layouts key off of — but we still navigate explicitly here (rather than
 * relying on that implicit redirect) to avoid any delay/flicker while the
 * layout notices the query change.
 */
export function useLogout() {
  const { t } = useTranslation();
  const signOutMutation = useSignOut();

  const logout = () => {
    Alert.alert(
      t("profile.logoutConfirm.title"),
      t("profile.logoutConfirm.message"),
      [
        { text: t("profile.logoutConfirm.cancel"), style: "cancel" },
        {
          text: t("profile.logoutConfirm.confirm"),
          style: "destructive",
          onPress: async () => {
            await signOutMutation.mutateAsync();
            router.replace("/(auth)/login");
          },
        },
      ],
    );
  };

  return { logout, isLoggingOut: signOutMutation.isPending };
}
