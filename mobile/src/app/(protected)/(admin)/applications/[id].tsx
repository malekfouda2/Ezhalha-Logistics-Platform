// app/(protected)/(admin)/applications/[id].tsx
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as Sharing from "expo-sharing";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { InfoCard, InfoRow } from "@/components/ui/InfoCard";
import { AdminTabHeader } from "@/components/layout/AdminTabHeader";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { downloadFile } from "@/api/client";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { useAdminApplication } from "@/lib/hooks/useAdminApplications";
import {
  applicationDisplayName,
  applicationLocation,
  applicationStatusColors,
  applicationTimeAgo,
} from "@/components/sections/applications/applicationFormat";
import { ApproveApplicationSheet } from "@/components/sections/applications/ApproveApplicationSheet";
import { RejectApplicationSheet } from "@/components/sections/applications/RejectApplicationSheet";
import { parseApplicationDocumentReference } from "@shared/application-documents";

const DANGER = "#B91C1C";

function SectionTitle({ children, right }: { children: string; right?: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text size="medium" weight="bold">
        {children}
      </Text>
      {right ? (
        <Text size="small" weight="bold" style={{ color: Colors.primary }}>
          {right}
        </Text>
      ) : null}
    </View>
  );
}

function fileExtension(name?: string | null) {
  const match = name?.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toUpperCase() : undefined;
}

export default function AdminApplicationDetailScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: application, isLoading, isError, isFetchedAfterMount } = useAdminApplication(id);
  const { hasPermission } = useAdminAccess();
  const canApprove = hasPermission("applications", "approve");
  const canReject = hasPermission("applications", "reject");

  const [approveVisible, setApproveVisible] = useState(false);
  const [rejectVisible, setRejectVisible] = useState(false);
  const [openingIndex, setOpeningIndex] = useState<number | null>(null);

  if (!application) {
    return (
      <View style={[styles.screen, styles.center]}>
        {isLoading && !isError ? (
          <ActivityIndicator color={Colors.primary} />
        ) : (
          <>
            <Text size="medium" weight="bold">
              {t("adminApplicationsScreen.detail.notFound")}
            </Text>
            <Button title={t("adminApplicationsScreen.detail.back")} variant="outline" onPress={() => router.back()} style={styles.notFoundButton} />
          </>
        )}
      </View>
    );
  }

  const name = applicationDisplayName(application);
  const isCompany = application.accountType === "company";
  const isPending = application.status === "pending";
  const statusLabel = t(`adminApplicationsScreen.status.${application.status}`, { defaultValue: application.status });
  const statusColors = applicationStatusColors(application.status);
  const documents = (application.documents ?? []).map((raw) => parseApplicationDocumentReference(raw));

  const nationalAddress = [
    application.nationalAddressBuilding,
    application.nationalAddressStreet,
    application.nationalAddressDistrict,
    application.nationalAddressCity,
    application.nationalAddressPostalCode,
  ].filter(Boolean);

  const shippingAddress = [
    application.shippingAddressLine1,
    application.shippingAddressLine2,
    application.shippingCity,
    application.shippingStateOrProvince,
    application.shippingPostalCode,
    application.shippingCountryCode,
  ].filter(Boolean);

  const handleOpenDocument = async (path: string, fileName: string, index: number) => {
    setOpeningIndex(index);
    try {
      const uri = await downloadFile(path, fileName);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { dialogTitle: fileName });
      }
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("adminClientsScreen.documents.openErrorTitle"),
        text2: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setOpeningIndex(null);
    }
  };

  // Only once the server has confirmed the status — the first paint comes from the cached list row.
  const showActions = isFetchedAfterMount && isPending && (canApprove || canReject);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, showActions && { paddingBottom: rvs(110) + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <AdminTabHeader
          title={name}
          subtitle={`${t("adminApplicationsScreen.detail.appliedAgo", { time: applicationTimeAgo(application.createdAt, t) })} · ${statusLabel.toLowerCase()}`}
          onBackPress={() => router.back()}
        />

        <SectionTitle>{t("adminApplicationsScreen.detail.applicant")}</SectionTitle>
        <InfoCard>
          <InfoRow
            label={t("adminApplicationsScreen.detail.accountType")}
            value={t(`adminApplicationsScreen.accountTypeTitle.${application.accountType}`, {
              defaultValue: application.accountType,
            })}
          />
          {isCompany && application.companyName ? (
            <InfoRow label={t("adminApplicationsScreen.detail.companyName")} value={application.companyName} />
          ) : null}
          {application.crNumber ? (
            <InfoRow label={t("adminApplicationsScreen.detail.crNumber")} value={application.crNumber} />
          ) : null}
          {application.taxNumber ? (
            <InfoRow label={t("adminApplicationsScreen.detail.vatNumber")} value={application.taxNumber} />
          ) : null}
        </InfoCard>

        <SectionTitle>{t("adminApplicationsScreen.detail.contact")}</SectionTitle>
        <InfoCard>
          <InfoRow label={t("adminApplicationsScreen.detail.fullName")} value={application.name} />
          <InfoRow label={t("adminApplicationsScreen.detail.email")} value={application.email} />
          <InfoRow label={t("adminApplicationsScreen.detail.phone")} value={application.phone} />
          <InfoRow label={t("adminApplicationsScreen.detail.location")} value={applicationLocation(application) || "—"} />
        </InfoCard>

        {nationalAddress.length > 0 && (
          <>
            <SectionTitle>{t("adminApplicationsScreen.detail.nationalAddress")}</SectionTitle>
            <View style={styles.textCard}>
              <Text size="small" weight="semibold" style={styles.addressText}>
                {nationalAddress.join(", ")}
              </Text>
            </View>
          </>
        )}

        {shippingAddress.length > 0 && (
          <>
            <SectionTitle>{t("adminApplicationsScreen.detail.shippingAddress")}</SectionTitle>
            <InfoCard>
              {application.shippingContactName ? (
                <InfoRow label={t("adminApplicationsScreen.detail.fullName")} value={application.shippingContactName} />
              ) : null}
              {application.shippingContactPhone ? (
                <InfoRow label={t("adminApplicationsScreen.detail.phone")} value={application.shippingContactPhone} />
              ) : null}
              <View style={styles.addressRow}>
                <Text size="small" weight="semibold" style={styles.addressText}>
                  {shippingAddress.join(", ")}
                </Text>
              </View>
            </InfoCard>
          </>
        )}

        <SectionTitle
          right={
            documents.length > 0
              ? t("adminApplicationsScreen.detail.documentsUploaded", { count: documents.length })
              : undefined
          }
        >
          {t("adminApplicationsScreen.detail.documents")}
        </SectionTitle>
        {documents.length === 0 ? (
          <View style={styles.textCard}>
            <Text size="small" dimRate="55%">
              {t("adminApplicationsScreen.detail.noDocuments")}
            </Text>
          </View>
        ) : (
          <View style={styles.documentsCard}>
            {documents.map((document, index) => {
              const fileName = document.name || `document-${index + 1}`;
              return (
                <View key={`${document.path}-${index}`}>
                  {index > 0 && <View style={styles.divider} />}
                  <Pressable
                    style={styles.documentRow}
                    disabled={openingIndex !== null}
                    onPress={() => handleOpenDocument(document.path, fileName, index)}
                  >
                    <View style={styles.documentIcon}>
                      <Ionicons name="document-text-outline" size={rs(20)} color={Colors.primary} />
                    </View>
                    <View style={styles.documentInfo}>
                      <Text size="small" weight="bold" numberOfLines={1}>
                        {document.label || document.name || t("adminClientsScreen.documents.fallbackName", { index: index + 1 })}
                      </Text>
                      <Text size="xs" dimRate="55%" numberOfLines={1}>
                        {fileExtension(document.name) ?? document.name}
                      </Text>
                    </View>
                    {openingIndex === index ? (
                      <ActivityIndicator color={Colors.primary} />
                    ) : (
                      <Ionicons name="eye-outline" size={rs(20)} color={Colors.text} />
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}

        {!isPending && (
          <>
            <SectionTitle>{t("adminApplicationsScreen.detail.review")}</SectionTitle>
            <InfoCard>
              <InfoRow
                label={t("adminApplicationsScreen.detail.status")}
                valueNode={
                  <View style={[styles.badge, { backgroundColor: statusColors.background }]}>
                    <Text size="xs" weight="bold" style={{ color: statusColors.text }}>
                      {statusLabel}
                    </Text>
                  </View>
                }
              />
              {application.reviewNotes ? (
                <View style={styles.addressRow}>
                  <Text size="xs" dimRate="60%">
                    {t("adminApplicationsScreen.detail.reviewNotes")}
                  </Text>
                  <Text size="small" weight="semibold" style={styles.addressText}>
                    {application.reviewNotes}
                  </Text>
                </View>
              ) : null}
            </InfoCard>
          </>
        )}
      </ScrollView>

      {showActions && (
        <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, rvs(12)) }]}>
          {canReject && (
            <Button
              title={
                <Text size="medium" weight="semibold" style={{ color: DANGER }}>
                  {t("adminApplicationsScreen.detail.reject")}
                </Text>
              }
              variant="outline"
              onPress={() => setRejectVisible(true)}
              style={{ ...styles.actionButton, ...styles.rejectButton }}
            />
          )}
          {canApprove && (
            <Button
              title={t("adminApplicationsScreen.detail.approve")}
              onPress={() => setApproveVisible(true)}
              style={styles.actionButton}
            />
          )}
        </View>
      )}

      <ApproveApplicationSheet
        application={application}
        visible={approveVisible}
        onClose={() => setApproveVisible(false)}
        onApproved={() => router.back()}
      />
      <RejectApplicationSheet
        application={application}
        visible={rejectVisible}
        onClose={() => setRejectVisible(false)}
        onRejected={() => router.back()}
      />
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
  notFoundButton: {
    marginTop: rvs(16),
    alignSelf: "stretch",
  },
  content: {
    padding: rs(16),
    paddingBottom: rvs(32),
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: rvs(10),
  },
  textCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    padding: rs(14),
    marginBottom: rvs(20),
  },
  addressRow: {
    paddingVertical: rvs(12),
    gap: rvs(4),
  },
  addressText: {
    lineHeight: rvs(20),
  },
  documentsCard: {
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
    marginBottom: rvs(20),
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  documentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
    paddingVertical: rvs(12),
  },
  documentIcon: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(11),
    backgroundColor: "#FFF1E8",
    alignItems: "center",
    justifyContent: "center",
  },
  documentInfo: {
    flex: 1,
  },
  badge: {
    borderRadius: rs(20),
    paddingHorizontal: rs(10),
    paddingVertical: rvs(4),
  },
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: rs(10),
    paddingHorizontal: rs(16),
    paddingTop: rvs(12),
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionButton: {
    flex: 1,
  },
  rejectButton: {
    borderColor: DANGER,
  },
});
