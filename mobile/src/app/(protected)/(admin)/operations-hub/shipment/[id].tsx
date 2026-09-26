// app/(protected)/(admin)/operations-hub/shipment/[id].tsx
import { useState } from "react";
import { ActivityIndicator, I18nManager, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { InfoCard, InfoRow } from "@/components/ui/InfoCard";
import { AdminNoAccess } from "@/components/layout/AdminNoAccess";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { formatDateTime } from "@/utils/invoiceFormat";
import { MONO_FONT, Money, Pill, SectionTitle } from "@/components/sections/operationsHub/OpsPrimitives";
import {
  DDP_STAGES,
  hoursStale,
  humanize,
  issueLabel,
  kindLabel,
  openAttentionFlags,
  statusLabel,
  statusTone,
} from "@/components/sections/operationsHub/opsFormat";
import { ShipmentActionsSheet, type OpsSheet } from "@/components/sections/operationsHub/sheets/ShipmentActionsSheet";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { useAdminIdentity } from "@/lib/hooks/useAdminIdentity";
import { useOperationShipment } from "@/lib/hooks/useAdminOperations";

const REQUIRED_PERMISSION = "operations:read";

function weight(value: string | null | undefined, unit: string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return `${Number.isFinite(n) ? n.toFixed(2) : value} ${(unit ?? "kg").toLowerCase()}`;
}

export default function AdminOperationShipmentScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { hasPermission } = useAdminAccess();
  const { roleLabel } = useAdminIdentity();
  const canRead = hasPermission("operations", "read");
  const { data: shipment, isLoading, refetch, isRefetching } = useOperationShipment(id);
  const [sheet, setSheet] = useState<OpsSheet | null>(null);

  const header = (title: string, subtitle?: string, showPhone?: boolean) => (
    <View style={styles.header}>
      <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={rs(8)}>
        <Ionicons name={I18nManager.isRTL ? "chevron-forward" : "chevron-back"} size={rs(20)} color={Colors.text} />
      </Pressable>
      <View style={styles.headerText}>
        <Text size="large" weight="bold" numberOfLines={1} style={{ fontFamily: MONO_FONT }}>
          {title}
        </Text>
        {subtitle ? (
          <Text size="xs" dimRate="55%" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {showPhone ? (
        <Pressable style={styles.iconButton} onPress={() => setSheet("carrier")} hitSlop={rs(8)}>
          <Feather name="phone" size={rs(18)} color={Colors.text} />
        </Pressable>
      ) : null}
    </View>
  );

  if (!canRead) {
    return (
      <View style={[styles.screen, { paddingTop: rvs(16) }]}>
        <View style={styles.padded}>{header(t("adminOperations.hub.title"), REQUIRED_PERMISSION)}</View>
        <AdminNoAccess screenTitle={t("adminOperations.hub.title")} permission={REQUIRED_PERMISSION} roleName={roleLabel} />
      </View>
    );
  }

  if (!shipment) {
    return (
      <View style={[styles.screen, styles.center]}>
        {isLoading ? (
          <ActivityIndicator color={Colors.primary} />
        ) : (
          <>
            <Text size="medium" weight="bold">
              {t("adminOperations.detail.notFound")}
            </Text>
            <Button title={t("adminOperations.detail.back")} variant="outline" onPress={() => router.back()} style={styles.notFoundButton} />
          </>
        )}
      </View>
    );
  }

  const flags = openAttentionFlags(shipment);
  const special = shipment.specialHandling?.status === "OPEN" ? shipment.specialHandling : null;
  const d = shipment.details;
  const stageName =
    shipment.shipmentKind === "DDP" && shipment.ddpCurrentStage
      ? t(`adminOperations.stages.${DDP_STAGES[shipment.ddpCurrentStage - 1]}`)
      : undefined;
  const carrierCost = shipment.dangerousGoods?.carrierCostSar ?? shipment.financialBreakdown?.costAmountSar ?? null;
  const extraCharges = shipment.ddpChargeConfig?.totalAdjustmentsAmountSar;
  const completedTasks = shipment.operationTasks.filter((task) => task.status !== "PENDING").length;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: rvs(110) + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
      >
        {header(
          shipment.trackingNumber,
          `${kindLabel(shipment.shipmentKind, t)} · ${statusLabel(shipment.status, t)}`,
          !!shipment.carrierContact,
        )}

        <View style={styles.routeCard}>
          <View style={styles.routeTop}>
            <Text size="small" weight="bold" style={{ fontFamily: MONO_FONT }}>
              {shipment.trackingNumber}
            </Text>
            <Pill label={statusLabel(shipment.status, t)} tone={statusTone(shipment.status)} />
          </View>
          <View style={styles.routeRow}>
            <View style={styles.routeEnd}>
              <Text size="medium" weight="bold" numberOfLines={1}>
                {shipment.sender.city || "—"}
              </Text>
              <Text size="xs" dimRate="55%" numberOfLines={1}>
                {shipment.sender.country ?? ""}
              </Text>
            </View>
            <View style={styles.routeLine}>
              <View style={styles.dash} />
              <View style={styles.routeIcon}>
                <Feather name="truck" size={rs(16)} color={Colors.primary} />
              </View>
              <View style={styles.dash} />
            </View>
            <View style={[styles.routeEnd, styles.routeEndRight]}>
              <Text size="medium" weight="bold" numberOfLines={1}>
                {shipment.recipient.city || "—"}
              </Text>
              <Text size="xs" dimRate="55%" numberOfLines={1}>
                {shipment.recipient.country ?? ""}
              </Text>
            </View>
          </View>
          <Text size="xs" dimRate="60%" style={styles.clientLine}>
            {shipment.clientName}
            {shipment.recipient.name ? ` → ${shipment.recipient.name}` : ""}
          </Text>
        </View>

        {flags.length > 0 && (
          <View style={styles.alertCard}>
            {flags.map((flag) => (
              <View key={flag.id} style={styles.alertRow}>
                <Feather name="alert-triangle" size={rs(16)} color="#B91C1C" />
                <View style={styles.alertText}>
                  <Text size="small" weight="bold" style={{ color: "#B91C1C" }}>
                    {issueLabel(flag.issueType, t)}
                  </Text>
                  {flag.details ? (
                    <Text size="xs" style={{ color: "#B91C1C" }}>
                      {flag.details}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}

        {special && (
          <View style={styles.specialCard}>
            <Feather name="flag" size={rs(16)} color={Colors.amberTextColor} />
            <View style={styles.alertText}>
              <Text size="small" weight="bold" style={{ color: Colors.amberTextColor }}>
                {t("adminOperations.detail.special", { priority: t(`adminOperations.priority.${special.priority}`, { defaultValue: special.priority }) })}
              </Text>
              <Text size="xs" style={{ color: Colors.amberTextColor }}>
                {special.reason}
              </Text>
            </View>
          </View>
        )}

        <SectionTitle>{t("adminOperations.detail.currentStage")}</SectionTitle>
        <InfoCard>
          <InfoRow
            label={t("adminOperations.detail.stage")}
            value={stageName ? `${stageName} — ${statusLabel(shipment.status, t)}` : statusLabel(shipment.status, t)}
          />
          <InfoRow
            label={t("adminOperations.detail.hoursSinceUpdate")}
            value={t("adminOperations.time.hours", { count: hoursStale(shipment.updatedAt) })}
          />
          <InfoRow
            label={t("adminOperations.detail.carrierAwb")}
            value={
              [shipment.carrierName, shipment.carrierTrackingNumber].filter(Boolean).join(" · ") ||
              t("adminOperations.card.notBooked")
            }
          />
          {shipment.serviceType ? <InfoRow label={t("adminOperations.detail.service")} value={humanize(shipment.serviceType)} /> : null}
          <InfoRow label={t("adminOperations.detail.payment")} value={humanize(shipment.paymentStatus)} />
          <InfoRow
            label={t("adminOperations.detail.assignedTo")}
            value={shipment.assignedToName ?? t("adminOperations.detail.unassigned")}
          />
          {shipment.estimatedDelivery ? (
            <InfoRow label={t("adminOperations.detail.eta")} value={formatDateTime(shipment.estimatedDelivery)} />
          ) : null}
        </InfoCard>

        <SectionTitle>{t("adminOperations.detail.packages")}</SectionTitle>
        <InfoCard>
          <InfoRow label={t("adminOperations.detail.pieces")} value={d.numberOfPackages ? String(d.numberOfPackages) : "—"} />
          <InfoRow label={t("adminOperations.detail.actualWeight")} value={weight(d.weight, d.weightUnit)} />
          <InfoRow label={t("adminOperations.detail.dimensionalWeight")} value={weight(d.dimensionalWeight, d.weightUnit)} />
          <InfoRow label={t("adminOperations.detail.chargeableWeight")} value={weight(d.chargeableWeight, d.chargeableWeightUnit ?? d.weightUnit)} />
        </InfoCard>

        <SectionTitle>{t("adminOperations.detail.money")}</SectionTitle>
        <InfoCard>
          <InfoRow label={t("adminOperations.detail.clientTotal")} valueNode={<Money amount={shipment.finalPrice} />} />
          {carrierCost !== null ? (
            <InfoRow label={t("adminOperations.detail.carrierCost")} valueNode={<Money amount={carrierCost} />} />
          ) : null}
          {extraCharges !== undefined ? (
            <InfoRow label={t("adminOperations.detail.extraCharges")} valueNode={<Money amount={extraCharges} />} />
          ) : null}
          {shipment.financialBreakdown?.marginAmount ? (
            <InfoRow
              label={t("adminOperations.detail.margin")}
              valueNode={<Money amount={shipment.financialBreakdown.marginAmount} color="#1E9E4B" />}
            />
          ) : null}
        </InfoCard>

        {shipment.operationTasks.length > 0 && (
          <>
            <SectionTitle
              right={
                <Text size="small" weight="bold" style={{ color: Colors.primary }}>
                  {completedTasks}/{shipment.operationTasks.length}
                </Text>
              }
            >
              {t("adminOperations.detail.tasks")}
            </SectionTitle>
            <View style={styles.listCard}>
              {shipment.operationTasks.map((task, index) => {
                const done = task.status !== "PENDING";
                return (
                  <View key={task.id} style={[styles.listRow, index > 0 && styles.listDivider]}>
                    <Ionicons
                      name={done ? "checkmark-circle" : "ellipse-outline"}
                      size={rs(20)}
                      color={done ? "#1E9E4B" : Colors.placeholder}
                    />
                    <View style={styles.listText}>
                      <Text size="small" weight="semibold" dimRate={done ? "60%" : undefined}>
                        {task.title}
                      </Text>
                      <Text size="xs" dimRate="50%">
                        {humanize(task.stageKey)}
                        {task.completedAt ? ` · ${formatDateTime(task.completedAt)}` : ""}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {shipment.operationNotes.length > 0 && (
          <>
            <SectionTitle>{t("adminOperations.detail.notes")}</SectionTitle>
            <View style={styles.listCard}>
              {shipment.operationNotes.slice(0, 5).map((note, index) => (
                <View key={note.id} style={[styles.noteRow, index > 0 && styles.listDivider]}>
                  <View style={styles.noteMeta}>
                    <Text size="xs" weight="bold" dimRate="60%">
                      {[note.authorName, formatDateTime(note.createdAt)].filter(Boolean).join(" · ")}
                    </Text>
                    <Pill
                      label={t(`adminOperations.detail.visibility.${note.visibility}`)}
                      tone={note.visibility === "CLIENT" ? "blue" : "gray"}
                    />
                  </View>
                  <Text size="small" style={styles.noteBody}>
                    {note.body}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {shipment.operationEvents.length > 0 && (
          <>
            <SectionTitle>{t("adminOperations.detail.timeline")}</SectionTitle>
            <View style={styles.listCard}>
              {shipment.operationEvents.slice(0, 8).map((event, index) => (
                <View key={event.id} style={[styles.listRow, index > 0 && styles.listDivider]}>
                  <View style={[styles.dot, index === 0 && styles.dotActive]} />
                  <View style={styles.listText}>
                    <Text size="small" weight="semibold">
                      {event.title}
                    </Text>
                    <Text size="xs" dimRate="50%">
                      {[event.description, formatDateTime(event.createdAt)].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: rvs(12)}]}>
        <Button title={t("adminOperations.actions.title")} onPress={() => setSheet("actions")} />
      </View>

      <ShipmentActionsSheet shipment={shipment} sheet={sheet} onChange={setSheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    padding: rs(24),
  },
  padded: {
    paddingHorizontal: rs(16),
  },
  notFoundButton: {
    marginTop: rvs(16),
    width: rs(180),
  },
  content: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(16),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: rvs(18),
  },
  iconButton: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(12),
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    marginHorizontal: rs(12),
  },
  routeCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    padding: rs(16),
    marginBottom: rvs(20),
  },
  routeTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: rvs(12),
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  routeEnd: {
    flex: 1,
  },
  routeEndRight: {
    alignItems: "flex-end",
  },
  routeLine: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  dash: {
    flex: 1,
    borderTopWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Colors.placeholder,
  },
  routeIcon: {
    width: rs(34),
    height: rs(34),
    borderRadius: rs(17),
    backgroundColor: "#FFE9DE",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: rs(6),
  },
  clientLine: {
    marginTop: rvs(10),
  },
  alertCard: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FBD5D5",
    borderRadius: rs(16),
    padding: rs(14),
    marginBottom: rvs(16),
    gap: rvs(10),
  },
  alertRow: {
    flexDirection: "row",
    gap: rs(10),
  },
  alertText: {
    flex: 1,
    gap: rvs(2),
  },
  specialCard: {
    flexDirection: "row",
    gap: rs(10),
    backgroundColor: Colors.amberBackgroundColor,
    borderWidth: 1,
    borderColor: Colors.amberBorderColor,
    borderRadius: rs(16),
    padding: rs(14),
    marginBottom: rvs(16),
  },
  listCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
    marginBottom: rvs(20),
  },
  listRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(10),
    paddingVertical: rvs(11),
  },
  listDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  listText: {
    flex: 1,
    gap: rvs(2),
  },
  noteRow: {
    paddingVertical: rvs(11),
  },
  noteMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: rs(8),
  },
  noteBody: {
    marginTop: rvs(6),
    lineHeight: rvs(19),
  },
  dot: {
    width: rs(10),
    height: rs(10),
    borderRadius: rs(5),
    backgroundColor: Colors.border,
    marginTop: rvs(4),
  },
  dotActive: {
    backgroundColor: Colors.primary,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: rs(16),
    paddingTop: rvs(12),
    backgroundColor: Colors.background,
  },
});
