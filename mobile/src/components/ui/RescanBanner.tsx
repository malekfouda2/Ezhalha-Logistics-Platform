// components/ui/RescanBanner.tsx
import { Colors } from "@/constants/colors";
import { rvs, rs } from "@/utils/responsive";
import { View, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "@/components/ui/Text";

interface RescanBannerProps {
  onRescan: () => void;
  loading?: boolean;
  bannerText?: string;
  buttonText?: string;
  scanningText?: string;
}

export const RescanBanner = ({
  onRescan,
  loading,
  bannerText = "Company details are filled from your documents. Review before submitting.",
  buttonText = "Re-scan documents",
  scanningText = "Reading...",
}: RescanBannerProps) => {
  return (
    <View style={styles.rescanBanner}>
      <Text size="small" weight="medium" style={{ flex: 1 }}>
        {bannerText}
      </Text>
      <Pressable
        style={[styles.rescanBtn, loading && { opacity: 0.6 }]}
        onPress={onRescan}
        disabled={loading}
      >
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text size="small" weight="semibold">
              {scanningText}
            </Text>
          </View>
        ) : (
          <Text size="small" weight="semibold">
            {buttonText}
          </Text>
        )}
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  rescanBanner: {
    backgroundColor: Colors.background,
    borderRadius: rs(12),
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: rs(14),
    paddingVertical: rvs(12),
    marginBottom: rvs(16),
    gap: rs(12),
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(6),
  },
  rescanBtn: {
    minWidth: rs(120),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: rs(14),
    paddingVertical: rvs(8),
    borderRadius: rs(10),
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
});