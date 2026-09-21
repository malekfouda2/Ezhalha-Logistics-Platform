// app/(protected)/(admin)/client/[id]/documents.tsx
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as Sharing from "expo-sharing";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { BackButton } from "@/components/ui/BackButton";
import { DashedActionButton } from "@/components/ui/DashedActionButton";
import InfoBox from "@/components/ui/InfoBox";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { downloadFile } from "@/api/client";
import { useAdminClientDetails } from "@/lib/hooks/useAdminClients";
import { parseApplicationDocumentReference } from "@shared/application-documents";

export default function AdminClientDocumentsScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: client, isLoading } = useAdminClientDetails(id);
  const [openingIndex, setOpeningIndex] = useState<number | null>(null);

  const documents = (client?.documents ?? []).map((raw) => parseApplicationDocumentReference(raw));

  const handleOpen = async (path: string, name: string, index: number) => {
    setOpeningIndex(index);
    try {
      const uri = await downloadFile(path, name);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { dialogTitle: name });
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

  const handleUpload = () => {
    Toast.show({
      type: "info",
      text1: t("adminClientsScreen.documents.uploadUnavailableTitle"),
      text2: t("adminClientsScreen.documents.uploadUnavailableMessage"),
    });
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton />
        <View style={styles.headerTitleBlock}>
          <Text size="medium" weight="bold">
            {t("adminClientsScreen.documents.title")}
          </Text>
          <Text size="small" dimRate="60%" numberOfLines={1}>
            {client ? `${client.companyName || client.name} · ${documents.length}` : ""}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator color={Colors.primary} style={styles.loading} />
        ) : documents.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={rs(32)} color={Colors.placeholder} />
            <Text size="medium" weight="bold" style={styles.emptyTitle}>
              {t("adminClientsScreen.documents.empty")}
            </Text>
          </View>
        ) : (
          documents.map((document, index) => (
            <View key={`${document.path}-${index}`} style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons name="document-text-outline" size={rs(20)} color={Colors.primary} />
              </View>
              <View style={styles.rowInfo}>
                <Text size="medium" weight="bold" numberOfLines={1}>
                  {document.label || document.name || t("adminClientsScreen.documents.fallbackName", { index: index + 1 })}
                </Text>
                <Text size="xs" dimRate="55%" numberOfLines={1}>
                  {document.name}
                </Text>
              </View>
              {openingIndex === index ? (
                <ActivityIndicator color={Colors.primary} />
              ) : (
                <Pressable
                  hitSlop={10}
                  onPress={() => handleOpen(document.path, document.name || `document-${index + 1}`, index)}
                >
                  <Ionicons name="download-outline" size={rs(20)} color={Colors.textSecondary} />
                </Pressable>
              )}
            </View>
          ))
        )}

        <DashedActionButton icon="upload" label={t("adminClientsScreen.documents.upload")} onPress={handleUpload} />

        <InfoBox text={t("adminClientsScreen.documents.notice")} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: rs(16),
    paddingTop: rvs(16),
    paddingBottom: rvs(12),
  },
  headerTitleBlock: {
    flex: 1,
    marginStart: rs(10),
  },
  content: {
    paddingHorizontal: rs(16),
    paddingBottom: rvs(32),
  },
  loading: {
    marginTop: rvs(60),
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: rvs(60),
    gap: rvs(10),
  },
  emptyTitle: {
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
    paddingVertical: rvs(12),
    marginBottom: rvs(10),
    gap: rs(12),
  },
  rowIcon: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(11),
    backgroundColor: "#FFF1E8",
    alignItems: "center",
    justifyContent: "center",
  },
  rowInfo: {
    flex: 1,
  },
});
