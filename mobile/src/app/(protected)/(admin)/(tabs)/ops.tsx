// app/(protected)/(admin)/(tabs)/ops.tsx
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { AdminScreenHeader } from "@/components/layout/AdminScreenHeader";
import { AdminNoAccess } from "@/components/layout/AdminNoAccess";
import { AdminEmptyState } from "@/components/layout/AdminEmptyState";
import { AdminDrawer } from "@/components/layout/AdminDrawer";
import { Colors } from "@/constants/colors";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { useAdminIdentity } from "@/lib/hooks/useAdminIdentity";

const REQUIRED_PERMISSION = "operations:read";

export default function AdminOpsScreen() {
  const { t } = useTranslation();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const { hasPermission } = useAdminAccess();
  const { roleLabel } = useAdminIdentity();
  const canReadOperations = hasPermission("operations", "read");
  const title = t("admin.ops.title");

  return (
    <View style={styles.container}>
      <AdminScreenHeader
        title={title}
        subtitle={canReadOperations ? undefined : REQUIRED_PERMISSION}
        onMenuPress={() => setDrawerVisible(true)}
      />

      {!canReadOperations ? (
        <AdminNoAccess screenTitle={title} permission={REQUIRED_PERMISSION} roleName={roleLabel} />
      ) : (
        <AdminEmptyState
          icon="truck"
          title={t("admin.comingSoonTitle")}
          description={t("admin.ops.comingSoonDescription")}
        />
      )}

      <AdminDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
