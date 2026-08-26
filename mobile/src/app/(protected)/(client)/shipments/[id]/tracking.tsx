import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { TrackingHeader } from "@/components/sections/shipments/tracking/TrackingHeader";
import { TrackingMap } from "@/components/sections/shipments/tracking/TrackingMap";
import { TrackingTimeline } from "@/components/sections/shipments/tracking/TrackingTimeline";
import { Colors } from "@/constants/colors";
import { Text } from "@/components/ui/Text";
import { useShipmentTracking } from "@/lib/hooks/useShipmentTracking";
import { rs, rvs } from "@/utils/responsive";

export default function TrackingScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    data,
    loading,
    refreshing,
    error,
    refetch,
  } = useShipmentTracking(id);

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={["top", "bottom"]}
    >
      <View style={styles.headerWrap}>
        <TrackingHeader
          trackingNumber={data?.trackingNumber ?? ""}
        />
      </View>

      {loading && !data ? (
        <View style={styles.centerState}>
          <ActivityIndicator
            size="large"
            color={Colors.primary}
          />
        </View>
      ) : error && !data ? (
        <View style={styles.centerState}>
          <Text
            size="medium"
            weight="semibold"
            style={styles.errorText}
          >
            {error}
          </Text>

          <Pressable
            onPress={refetch}
            style={styles.retryButton}
          >
            <Text
              size="small"
              weight="semibold"
              style={{ color: Colors.white }}
            >
              {t("common.tryAgain")}
            </Text>
          </Pressable>
        </View>
      ) : data ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refetch}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
        >
          <TrackingMap
            currentLocation={data.currentLocation}
            destination={data.destination}
            origin={data.origin}
          />

          <View style={styles.timelineWrap}>
            <TrackingTimeline events={data.events} />
          </View>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerWrap: {
    paddingHorizontal: rs(20),
    paddingTop: rvs(8),
    paddingBottom: rvs(16),
  },
  scrollContent: {
    paddingHorizontal: rs(20),
    paddingBottom: rvs(40),
  },
  timelineWrap: {
    marginTop: rvs(28),
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: rs(32),
  },
  errorText: {
    textAlign: "center",
    marginBottom: rvs(16),
    color: Colors.error,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: rs(24),
    paddingVertical: rvs(12),
    borderRadius: rs(12),
  },
});