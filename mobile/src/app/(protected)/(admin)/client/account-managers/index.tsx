// app/(protected)/(admin)/client/account-managers/index.tsx
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { RefreshableScreen } from "@/components/ui/RefreshableScreen";
import { InfoCard } from "@/components/ui/InfoCard";
import InfoBox from "@/components/ui/InfoBox";
import { AdminTabHeader } from "@/components/layout/AdminTabHeader";
import { AdminNoAccess } from "@/components/layout/AdminNoAccess";
import { AdminDrawer } from "@/components/layout/AdminDrawer";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { useAdminIdentity } from "@/lib/hooks/useAdminIdentity";
import { useAdminAccountManagerOptions, useAdminChangeRequests, useReviewChangeRequest } from "@/lib/hooks/useAdminClients";
import type { AccountManagerChangeRequest, AccountManagerSummary } from "@/lib/services/adminClients";
import { AssignClientsSheet } from "@/components/sections/clients/AssignClientsSheet";

const REQUIRED_PERMISSION = "account-managers:read";

function SectionTitle({ children }: { children: string }) {
  return (
    <Text size="medium" weight="bold" style={styles.sectionTitle}>
      {children}
    </Text>
  );
}

function initialsFor(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

function humanizeFieldName(field: string) {
  const spaced = field.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatFieldValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "Active" : "Inactive";
  if (value === null || value === undefined || value === "") return "Empty";
  return String(value);
}

function timeAgo(dateString: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t("adminAccountManagersScreen.time.justNow");
  if (minutes < 60) return t("adminAccountManagersScreen.time.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("adminAccountManagersScreen.time.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  return t("adminAccountManagersScreen.time.daysAgo", { count: days });
}

function ChangeRequestCard({ request }: { request: AccountManagerChangeRequest }) {
  const { t } = useTranslation();
  const { hasPermission } = useAdminAccess();
  const reviewMutation = useReviewChangeRequest();
  const canApprove = hasPermission("account-manager-requests", "approve");
  const canReject = hasPermission("account-manager-requests", "reject");

  const entries = Object.entries(request.requestedChanges ?? {});

  const handleReview = async (action: "approve" | "reject") => {
    try {
      await reviewMutation.mutateAsync({ id: request.id, action });
      Toast.show({
        type: "success",
        text1: t(action === "approve" ? "adminAccountManagersScreen.requests.approvedTitle" : "adminAccountManagersScreen.requests.rejectedTitle"),
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("adminAccountManagersScreen.requests.errorTitle"),
        text2: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <View style={styles.requestCard}>
      <View style={styles.requestHeader}>
        <View style={styles.requestHeaderText}>
          <Text size="medium" weight="bold" numberOfLines={1}>
            {request.client?.name ?? t("adminAccountManagersScreen.requests.unknownClient")}
          </Text>
          <Text size="xs" dimRate="55%">
            {t("adminAccountManagersScreen.requests.requestedBy", {
              name: request.accountManager?.username ?? "—",
              time: timeAgo(request.createdAt, t),
            })}
          </Text>
        </View>
        <View style={[styles.statusPill, request.status !== "pending" && styles.statusPillMuted]}>
          <Text size="xs" weight="bold" style={request.status !== "pending" ? styles.statusPillTextMuted : styles.statusPillText}>
            {t(`adminAccountManagersScreen.requests.status.${request.status}`, { defaultValue: request.status })}
          </Text>
        </View>
      </View>

      {entries.length > 0 && (
        <View style={styles.changesBox}>
          {entries.map(([field, value]) => (
            <View key={field} style={styles.changeRow}>
              <Text size="small" dimRate="65%">
                {humanizeFieldName(field)}
              </Text>
              <Text size="small" weight="bold">
                {formatFieldValue(value)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {request.status === "pending" && (canApprove || canReject) && (
        <View style={styles.requestActions}>
          {canReject && (
            <Button
              title={t("adminAccountManagersScreen.requests.reject")}
              variant="outline"
              onPress={() => handleReview("reject")}
              loading={reviewMutation.isPending}
              disabled={reviewMutation.isPending}
              style={styles.requestActionButton}
            />
          )}
          {canApprove && (
            <Button
              title={t("adminAccountManagersScreen.requests.apply")}
              onPress={() => handleReview("approve")}
              loading={reviewMutation.isPending}
              disabled={reviewMutation.isPending}
              style={styles.requestActionButton}
            />
          )}
        </View>
      )}
    </View>
  );
}

export default function AdminAccountManagersScreen() {
  const { t } = useTranslation();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [assignTarget, setAssignTarget] = useState<AccountManagerSummary | null>(null);

  const { hasPermission } = useAdminAccess();
  const { roleLabel } = useAdminIdentity();
  const title = t("adminAccountManagersScreen.title");

  const canRead = hasPermission("account-managers", "read");
  const canAssign = hasPermission("account-managers", "assign");
  const canReadRequests = hasPermission("account-manager-requests", "read");

  const { data: accountManagers, isLoading: managersLoading } = useAdminAccountManagerOptions();
  const { data: changeRequests, isLoading: requestsLoading } = useAdminChangeRequests("pending");
  const subtitle = t("adminAccountManagersScreen.subtitle", { count: accountManagers?.length ?? 0 });

  if (!canRead) {
    return (
      <View style={styles.container}>
        <AdminTabHeader title={title} onMenuPress={() => setDrawerVisible(true)} />
        <AdminNoAccess screenTitle={title} permission={REQUIRED_PERMISSION} roleName={roleLabel} />
        <AdminDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <RefreshableScreen contentContainerStyle={styles.content}>
        <AdminTabHeader title={title} subtitle={subtitle} onMenuPress={() => setDrawerVisible(true)} />

        <SectionTitle>{t("adminAccountManagersScreen.scopedAdmins")}</SectionTitle>
        {managersLoading ? (
          <ActivityIndicator color={Colors.primary} style={styles.loading} />
        ) : (accountManagers ?? []).length === 0 ? (
          <View style={styles.emptyCard}>
            <Text size="small" dimRate="55%">
              {t("adminAccountManagersScreen.noManagers")}
            </Text>
          </View>
        ) : (
          <InfoCard>
            {(accountManagers ?? []).map((manager) => (
              <Pressable
                key={manager.id}
                disabled={!canAssign}
                onPress={() => setAssignTarget(manager)}
                style={({ pressed }) => [styles.managerRow, pressed && canAssign && styles.pressed]}
              >
                <View style={styles.avatar}>
                  <Text size="small" weight="bold" style={styles.avatarText}>
                    {initialsFor(manager.username)}
                  </Text>
                </View>
                <View style={styles.managerInfo}>
                  <Text size="medium" weight="bold" numberOfLines={1}>
                    {manager.username}
                  </Text>
                  <Text size="xs" dimRate="55%" numberOfLines={1}>
                    {manager.email} · {t("adminAccountManagersScreen.assignedCount", { count: manager.assignedClients.length })}
                  </Text>
                </View>
                {canAssign ? (
                  <Text size="xs" weight="bold" style={styles.assignLink}>
                    {t("adminAccountManagersScreen.assignClients")}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </InfoCard>
        )}

        {canReadRequests && (
          <>
            <View style={styles.pendingHeaderRow}>
              <SectionTitle>{t("adminAccountManagersScreen.pendingChanges")}</SectionTitle>
              {(changeRequests?.length ?? 0) > 0 && (
                <View style={styles.pendingCountBadge}>
                  <Text size="xs" weight="bold" style={styles.pendingCountText}>
                    {changeRequests?.length}
                  </Text>
                </View>
              )}
            </View>

            {requestsLoading ? (
              <ActivityIndicator color={Colors.primary} style={styles.loading} />
            ) : (changeRequests ?? []).length === 0 ? (
              <View style={styles.emptyCard}>
                <Text size="small" dimRate="55%">
                  {t("adminAccountManagersScreen.noRequests")}
                </Text>
              </View>
            ) : (
              (changeRequests ?? []).map((request) => <ChangeRequestCard key={request.id} request={request} />)
            )}

            <InfoBox text={t("adminAccountManagersScreen.info")} backgroundColor="#EAF9EF" borderColor="#BEE9CB" textColor="#1E7A3E" iconColor="#1E7A3E" iconName="info" />
          </>
        )}
      </RefreshableScreen>

      <AssignClientsSheet manager={assignTarget} onClose={() => setAssignTarget(null)} />

      <AdminDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: rs(16),
    paddingBottom: rvs(32),
  },
  loading: {
    marginTop: rvs(20),
    marginBottom: rvs(20),
  },
  emptyCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    padding: rs(16),
    marginBottom: rvs(20),
  },
  managerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: rvs(12),
    gap: rs(12),
  },
  pressed: {
    opacity: 0.6,
  },
  avatar: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(12),
    backgroundColor: "#FDE0CE",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: Colors.primary,
  },
  managerInfo: {
    flex: 1,
  },
  assignLink: {
    color: Colors.primary,
  },
  sectionTitle: {
    marginBottom: rvs(10),
  },
  pendingHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(8),
  },
  pendingCountBadge: {
    minWidth: rs(20),
    height: rs(20),
    borderRadius: rs(10),
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: rs(6),
  },
  pendingCountText: {
    color: Colors.white,
  },
  requestCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    padding: rs(14),
    marginBottom: rvs(12),
  },
  requestHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: rs(10),
  },
  requestHeaderText: {
    flex: 1,
  },
  statusPill: {
    backgroundColor: "#FDECC8",
    borderRadius: rs(20),
    paddingHorizontal: rs(10),
    paddingVertical: rvs(4),
  },
  statusPillText: {
    color: "#9A7410",
  },
  statusPillMuted: {
    backgroundColor: Colors.background,
  },
  statusPillTextMuted: {
    color: Colors.textSecondary,
  },
  changesBox: {
    marginTop: rvs(12),
    backgroundColor: Colors.background,
    borderRadius: rs(12),
    paddingHorizontal: rs(12),
  },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: rvs(9),
  },
  requestActions: {
    flexDirection: "row",
    gap: rs(10),
    marginTop: rvs(12),
  },
  requestActionButton: {
    flex: 1,
    height: rvs(44),
  },
});
