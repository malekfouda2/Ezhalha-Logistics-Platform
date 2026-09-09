import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

interface SdsFileListProps {
  files: Array<{ fileName: string; size: number }>;
  onRemove: (index: number) => void;
}

export const SdsFileList = ({ files, onRemove }: SdsFileListProps) => {
  if (files.length === 0) return null;

  return (
    <View style={styles.container}>
      {files.map((file, index) => (
        <View key={`${file.fileName}-${index}`} style={styles.row}>
          <View style={styles.docIcon}>
            <Ionicons name="document-text-outline" size={rs(15)} color={Colors.primary} />
          </View>

          <View style={styles.info}>
            <Text size="small" weight="semibold" numberOfLines={1}>
              {file.fileName}
            </Text>
            <Text size="xs" dimRate="60%">
              {formatFileSize(file.size)}
            </Text>
          </View>

          <Pressable onPress={() => onRemove(index)} hitSlop={10}>
            <Ionicons name="close" size={rs(16)} color={Colors.textSecondary} />
          </Pressable>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: rvs(8),
    marginBottom: rvs(10),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: rs(12),
    paddingHorizontal: rs(11),
    paddingVertical: rvs(9),
    gap: rs(9),
  },
  docIcon: {
    width: rs(26),
    height: rs(26),
    borderRadius: rs(7),
    backgroundColor: "#FDE4D6",
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
});
