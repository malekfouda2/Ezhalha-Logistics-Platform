// components/ui/DocumentUpload.tsx
import { Colors } from "@/constants/colors";
import { rvs, rs } from "@/utils/responsive";
import { Ionicons } from "@expo/vector-icons";
import { View, Pressable, StyleSheet } from "react-native";
import { Text } from "@/components/ui/Text";

interface DocUploadRowProps {
  label: string;
  subLabel: string;
  fileName?: string;
  error?: string;
  onPick: () => void;
  onRemove?: () => void;
  uploadText?: string;
  replaceText?: string;
  noFileText?: string;
}

export const DocUploadRow = ({
  label,
  subLabel,
  fileName,
  error,
  onPick,
  onRemove,
  uploadText = "Upload",
  replaceText = "Replace",
  noFileText = "No file uploaded yet.",
}: DocUploadRowProps) => {
  const hasFile = !!fileName;

  return (
    <View style={styles.docRow}>
      <View style={styles.docHeader}>
        <View style={{ flex: 1 }}>
          <Text size="medium" weight="semibold">
            {label}
          </Text>
          <Text size="xs" dimRate="70%" style={{ marginTop: rvs(2) }}>
            {subLabel}
          </Text>
        </View>

        <Pressable style={styles.uploadBtn} onPress={onPick}>
          <Ionicons
            name={hasFile ? "refresh-outline" : "cloud-upload-outline"}
            size={rs(16)}
            color={Colors.text}
          />
          <Text size="small" weight="semibold" style={{ marginStart: rs(6) }}>
            {hasFile ? replaceText : uploadText}
          </Text>
        </Pressable>
      </View>

      {hasFile ? (
        <View style={styles.docFileBoxFilled}>
          <Ionicons
            name="document-text-outline"
            size={rs(16)}
            color={Colors.textSecondary}
            style={{ marginEnd: rs(8) }}
          />
          <Text size="small" style={{ flex: 1 }} numberOfLines={1}>
            {fileName}
          </Text>
          {onRemove ? (
            <Pressable onPress={onRemove} hitSlop={10} style={styles.removeBtn}>
              <Ionicons name="close" size={rs(16)} color={Colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.docFileBox}>
          <Text size="small" dimRate="60%">
            {noFileText}
          </Text>
        </View>
      )}

      {error ? (
        <Text size="xs" weight="medium" style={styles.errorText}>
          {error}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  docRow: {
    marginBottom: rvs(16),
  },
  docHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: rvs(8),
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: rs(12),
    paddingVertical: rvs(8),
    borderRadius: rs(10),
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.inputBackground,
  },
  docFileBox: {
    height: rvs(44),
    borderRadius: rs(12),
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.inputBackground,
    justifyContent: "center",
    paddingHorizontal: rs(14),
  },
  docFileBoxFilled: {
    flexDirection: "row",
    alignItems: "center",
    height: rvs(44),
    borderRadius: rs(12),
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.inputBackground,
    paddingHorizontal: rs(14),
  },
  removeBtn: {
    marginStart: rs(8),
    padding: rs(4),
  },
  errorText: {
    color: "#E53E3E",
    marginTop: rvs(6),
  },
});