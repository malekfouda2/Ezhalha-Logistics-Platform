// app/(protected)/(admin)/operations-hub/received-check/[id].tsx
//
// Door-to-door warehouse receipt, done as the DDP warehouse checkpoints the web hub completes:
// ddp_received_warehouse → ddp_quality_check → ddp_photos_uploaded (server enforces the order).
// A checkpoint that's already complete gets its metadata patched instead.
import { useState } from "react";
import { ActivityIndicator, I18nManager, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { OptionGrid, SectionTitle } from "@/components/sections/operationsHub/OpsPrimitives";
import { useUpload } from "@/lib/hooks/useUpload";
import { useOperationMutation, useOperationShipment } from "@/lib/hooks/useAdminOperations";
import { adminOperationsService, type OperationShipmentDetail } from "@/lib/services/adminOperations";

type DocumentsStatus = "complete" | "missing" | "correction_needed";
type QuantityStatus = "matched" | "mismatch";
type PackagingStatus = "sealed_good" | "repacked" | "damaged";
type DamageStatus = "clear" | "minor" | "major";

interface Photo {
  name: string;
  path: string;
  size?: number;
  contentType?: string;
  /** Local preview only — not sent. */
  uri?: string;
}

function parseMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export default function AdminReceivedCheckScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: shipment, isLoading } = useOperationShipment(id);

  if (!shipment) {
    return (
      <View style={[styles.screen, styles.center]}>
        {isLoading ? <ActivityIndicator color={Colors.primary} /> : <Text weight="bold">{t("adminOperations.detail.notFound")}</Text>}
      </View>
    );
  }

  return <ReceivedCheckForm shipment={shipment} bottomInset={insets.bottom} />;
}

function ReceivedCheckForm({ shipment, bottomInset }: { shipment: OperationShipmentDetail; bottomInset: number }) {
  const { t } = useTranslation();
  const task = (key: string) => shipment.operationTasks.find((item) => item.taskKey === key);
  const receipt = parseMetadata(task("ddp_received_warehouse")?.metadata);
  const qc = parseMetadata(task("ddp_quality_check")?.metadata);
  const photoMeta = parseMetadata(task("ddp_photos_uploaded")?.metadata);

  const [documentsStatus, setDocumentsStatus] = useState<DocumentsStatus | undefined>(qc.documentsStatus as DocumentsStatus);
  const [quantityStatus, setQuantityStatus] = useState<QuantityStatus | undefined>(qc.quantityStatus as QuantityStatus);
  const [packagingStatus, setPackagingStatus] = useState<PackagingStatus | undefined>(qc.packagingStatus as PackagingStatus);
  const [damageStatus, setDamageStatus] = useState<DamageStatus | undefined>(qc.damageStatus as DamageStatus);
  const [pieces, setPieces] = useState(
    receipt.receivedPieces ? String(receipt.receivedPieces) : shipment.details.numberOfPackages ? String(shipment.details.numberOfPackages) : "",
  );
  const [photos, setPhotos] = useState<Photo[]>(Array.isArray(photoMeta.photos) ? (photoMeta.photos as Photo[]) : []);
  const [note, setNote] = useState(typeof qc.qcNotes === "string" ? qc.qcNotes : "");

  const { uploadFile, isUploading } = useUpload({
    onError: (error) => Toast.show({ type: "error", text1: t("adminOperations.received.uploadError"), text2: error.message }),
  });

  const addPhoto = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "image/*", copyToCacheDirectory: true, multiple: true });
    if (result.canceled) return;
    for (const asset of result.assets) {
      const contentType = asset.mimeType ?? "image/jpeg";
      const uploaded = await uploadFile({ uri: asset.uri, name: asset.name, type: contentType, size: asset.size ?? 0 });
      if (uploaded) {
        setPhotos((prev) => [
          ...prev,
          { name: asset.name, path: uploaded.objectPath, size: asset.size ?? undefined, contentType, uri: asset.uri },
        ]);
      }
    }
  };

  const mutation = useOperationMutation(shipment.id, async () => {
    let result: { detail: OperationShipmentDetail } | undefined;
    const trimmedNote = note.trim() || undefined;
    const steps: [string, Record<string, unknown>][] = [
      [
        "ddp_received_warehouse",
        {
          receiptDate: (receipt.receiptDate as string) || new Date().toISOString().slice(0, 10),
          receivedPieces: Number(pieces),
          receiptNotes: trimmedNote,
        },
      ],
      ["ddp_quality_check", { documentsStatus, quantityStatus, packagingStatus, damageStatus, qcNotes: trimmedNote }],
    ];
    if (photos.length > 0) {
      steps.push([
        "ddp_photos_uploaded",
        { photos: photos.map(({ uri: _uri, ...photo }) => photo), photoNotes: trimmedNote },
      ]);
    }

    for (const [key, metadata] of steps) {
      const current = (result?.detail ?? shipment).operationTasks.find((item) => item.taskKey === key);
      if (!current) continue;
      result =
        current.status === "PENDING"
          ? await adminOperationsService.completeTask(shipment.id, current.id, metadata)
          : await adminOperationsService.updateTaskMetadata(shipment.id, current.id, metadata);
    }
    return result;
  });

  const handleSave = async () => {
    if (!(Number(pieces) > 0)) {
      Toast.show({ type: "error", text1: t("adminOperations.received.errors.pieces") });
      return;
    }
    if (!documentsStatus || !quantityStatus || !packagingStatus || !damageStatus) {
      Toast.show({ type: "error", text1: t("adminOperations.received.errors.checks") });
      return;
    }
    try {
      await mutation.mutateAsync(undefined);
      const flagged =
        documentsStatus !== "complete" || quantityStatus !== "matched" || packagingStatus === "damaged" || damageStatus !== "clear";
      Toast.show({
        type: flagged ? "info" : "success",
        text1: t("adminOperations.received.success"),
        text2: flagged ? t("adminOperations.received.flagged") : shipment.trackingNumber,
      });
      router.back();
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("adminOperations.received.error"),
        text2: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: rvs(110) + bottomInset }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={rs(8)}>
            <Ionicons name={I18nManager.isRTL ? "chevron-forward" : "chevron-back"} size={rs(20)} color={Colors.text} />
          </Pressable>
          <View style={styles.headerText}>
            <Text size="large" weight="bold">
              {t("adminOperations.received.title")}
            </Text>
            <Text size="xs" dimRate="55%" numberOfLines={1}>
              {[shipment.trackingNumber, shipment.clientName].join(" · ")}
            </Text>
          </View>
        </View>

        <SectionTitle>{t("adminOperations.received.documents")}</SectionTitle>
        <OptionGrid
          columns={3}
          options={(["complete", "missing", "correction_needed"] as const).map((value) => ({
            value,
            label: t(`adminOperations.received.documentsOptions.${value}`),
          }))}
          value={documentsStatus}
          onChange={setDocumentsStatus}
        />

        <View style={styles.gap} />
        <SectionTitle>{t("adminOperations.received.packaging")}</SectionTitle>
        <OptionGrid
          columns={3}
          options={(["sealed_good", "repacked", "damaged"] as const).map((value) => ({
            value,
            label: t(`adminOperations.received.packagingOptions.${value}`),
          }))}
          value={packagingStatus}
          onChange={setPackagingStatus}
        />

        <View style={styles.gap} />
        <SectionTitle>{t("adminOperations.received.damage")}</SectionTitle>
        <OptionGrid
          columns={3}
          options={(["clear", "minor", "major"] as const).map((value) => ({
            value,
            label: t(`adminOperations.received.damageOptions.${value}`),
          }))}
          value={damageStatus}
          onChange={setDamageStatus}
        />

        <View style={styles.gap} />
        <SectionTitle>{t("adminOperations.received.quantity")}</SectionTitle>
        <View style={styles.quantityRow}>
          <View style={styles.quantityInput}>
            <Input
              value={pieces}
              onChangeText={setPieces}
              keyboardType="number-pad"
              placeholder={t("adminOperations.received.piecesPlaceholder")}
              rightElement={
                <Text size="small" dimRate="55%">
                  {t("adminOperations.received.pieces")}
                </Text>
              }
            />
          </View>
          <View style={styles.quantityToggle}>
            <OptionGrid
              options={(["matched", "mismatch"] as const).map((value) => ({
                value,
                label: t(`adminOperations.received.quantityOptions.${value}`),
              }))}
              value={quantityStatus}
              onChange={setQuantityStatus}
            />
          </View>
        </View>

        <SectionTitle
          right={
            photos.length > 0 ? (
              <Text size="small" weight="bold" style={{ color: Colors.primary }}>
                {t("adminOperations.received.photosAttached", { count: photos.length })}
              </Text>
            ) : undefined
          }
        >
          {t("adminOperations.received.photos")}
        </SectionTitle>
        <View style={styles.photosRow}>
          {photos.map((photo, index) => (
            <Pressable
              key={`${photo.path}-${index}`}
              style={styles.photo}
              onLongPress={() => setPhotos((prev) => prev.filter((_, i) => i !== index))}
            >
              {photo.uri ? (
                <Image source={{ uri: photo.uri }} style={styles.photoImage} />
              ) : (
                <Feather name="image" size={rs(22)} color={Colors.placeholder} />
              )}
            </Pressable>
          ))}
          <Pressable style={[styles.photo, styles.addPhoto]} onPress={addPhoto} disabled={isUploading}>
            {isUploading ? <ActivityIndicator color={Colors.primary} /> : <Feather name="plus" size={rs(22)} color={Colors.primary} />}
          </Pressable>
        </View>
        <Text size="xs" dimRate="50%" style={styles.photoHint}>
          {t("adminOperations.received.photosHint")}
        </Text>

        <SectionTitle>{t("adminOperations.received.note")}</SectionTitle>
        <Input
          value={note}
          onChangeText={setNote}
          placeholder={t("adminOperations.received.notePlaceholder")}
          multiline
          textAlignVertical="top"
          style={styles.noteInput}
        />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(bottomInset, rvs(12)) }]}>
        <Button
          title={t("adminOperations.received.save")}
          onPress={handleSave}
          loading={mutation.isPending}
          disabled={mutation.isPending || isUploading}
        />
      </View>
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
  },
  content: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(16),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: rvs(20),
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
    marginStart: rs(12),
  },
  gap: {
    height: rvs(18),
  },
  quantityRow: {
    flexDirection: "row",
    gap: rs(10),
  },
  quantityInput: {
    flex: 1,
  },
  quantityToggle: {
    flex: 1.3,
  },
  photosRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: rs(10),
  },
  photo: {
    width: rs(74),
    height: rs(74),
    borderRadius: rs(14),
    backgroundColor: "#DCE3EC",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  addPhoto: {
    backgroundColor: "#FFF7F0",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Colors.border,
  },
  photoHint: {
    marginTop: rvs(8),
    marginBottom: rvs(18),
  },
  noteInput: {
    height: rvs(90),
    paddingTop: rvs(12),
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
