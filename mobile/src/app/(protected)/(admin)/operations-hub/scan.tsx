// app/(protected)/(admin)/operations-hub/scan.tsx
//
// Waybill scanner. Reads the carrier barcode or the EZH label with the camera (expo-camera) and
// looks it up through the ops list `search`, which matches both the EZH number and the carrier
// AWB. Typing the code is kept as a fallback for a damaged label or a denied camera permission.
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  I18nManager,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { router, useIsFocused } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, type BarcodeScanningResult, type BarcodeType } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { MONO_FONT, Pill } from "@/components/sections/operationsHub/OpsPrimitives";
import { statusLabel, statusTone } from "@/components/sections/operationsHub/opsFormat";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useOperationsLookup } from "@/lib/hooks/useAdminOperations";

const DARK = "#0F141C";
const FRAME_HEIGHT = rvs(230);

// Carrier waybills are 1D (Code 128 on FedEx/DHL/Aramex, ITF on some) plus PDF417/2D blocks;
// the EZH label is a QR/Code 128.
const BARCODE_TYPES: BarcodeType[] = ["code128", "code39", "code93", "itf14", "ean13", "upc_a", "codabar", "pdf417", "qr", "datamatrix"];

function normalizeCode(value: string) {
  return value.replace(/\s+/g, "").toUpperCase();
}

export default function AdminScanWaybillScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();

  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [manualVisible, setManualVisible] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const debouncedManual = useDebouncedValue(normalizeCode(manualCode), 400);

  // Camera callbacks fire many times a second while a code is in view — latch the first read.
  const lockRef = useRef(false);
  const code = scannedCode ?? (manualVisible ? debouncedManual : "");
  const { data: matches, isFetching } = useOperationsLookup(code);
  const searched = code.length >= 4;

  const laser = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(laser, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(laser, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [laser]);

  const handleScanned = ({ data }: BarcodeScanningResult) => {
    if (lockRef.current || !data) return;
    lockRef.current = true;
    setManualVisible(false);
    setScannedCode(normalizeCode(data));
  };

  const scanAgain = () => {
    setScannedCode(null);
    setManualCode("");
    lockRef.current = false;
  };

  const open = (id: string) => router.replace(`/(protected)/(admin)/operations-hub/shipment/${id}`);

  const granted = permission?.granted ?? false;
  const cameraActive = granted && isFocused && !scannedCode;

  const renderFrameContent = () => {
    if (!permission) {
      return <ActivityIndicator color={Colors.primary} />;
    }
    if (!granted) {
      return (
        <View style={styles.permissionBox}>
          <Feather name="camera-off" size={rs(28)} color="#9AA3B2" />
          <Text size="small" style={styles.permissionText}>
            {t("adminOperations.scan.permission")}
          </Text>
          <Pressable
            style={styles.permissionButton}
            onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
          >
            <Text size="small" weight="bold" style={{ color: Colors.white }}>
              {permission.canAskAgain ? t("adminOperations.scan.allowCamera") : t("adminOperations.scan.openSettings")}
            </Text>
          </Pressable>
        </View>
      );
    }
    return (
      <>
        {isFocused && (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
            onBarcodeScanned={cameraActive ? handleScanned : undefined}
          />
        )}
        {!scannedCode && (
          <Animated.View
            style={[
              styles.laser,
              { transform: [{ translateY: laser.interpolate({ inputRange: [0, 1], outputRange: [-FRAME_HEIGHT * 0.3, FRAME_HEIGHT * 0.3] }) }] },
            ]}
          />
        )}
      </>
    );
  };

  const single = matches && matches.length === 1 ? matches[0] : undefined;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + rvs(8) }]}>
      <View style={styles.topBar}>
        <Pressable style={styles.closeButton} onPress={() => router.back()} hitSlop={rs(8)}>
          <Ionicons name={I18nManager.isRTL ? "chevron-forward" : "chevron-back"} size={rs(20)} color={Colors.white} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + rvs(24) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text size="large" weight="bold" style={styles.title}>
          {t("adminOperations.scan.title")}
        </Text>
        <Text size="small" style={styles.subtitle}>
          {t("adminOperations.scan.subtitle")}
        </Text>

        <View style={styles.frame}>
          <View style={styles.frameInner}>{renderFrameContent()}</View>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>

        {manualVisible && !scannedCode ? (
          <TextInput
            value={manualCode}
            onChangeText={setManualCode}
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={t("adminOperations.scan.placeholder")}
            placeholderTextColor="#5B6573"
            style={[styles.codeInput, { fontFamily: MONO_FONT }]}
            returnKeyType="search"
            onSubmitEditing={() => single && open(single.id)}
          />
        ) : !scannedCode ? (
          <Pressable onPress={() => setManualVisible(true)} style={styles.manualLink} hitSlop={rs(8)}>
            <Feather name="edit-3" size={rs(14)} color="#9AA3B2" />
            <Text size="small" weight="semibold" style={styles.manualText}>
              {t("adminOperations.scan.enterManually")}
            </Text>
          </Pressable>
        ) : null}

        {searched && (
          <View style={styles.resultCard}>
            {isFetching && !matches ? (
              <ActivityIndicator color={Colors.primary} style={styles.loading} />
            ) : !matches || matches.length === 0 ? (
              <>
                <View style={styles.resultRow}>
                  <Feather name="hexagon" size={rs(22)} color={Colors.text} />
                  <View style={styles.resultText}>
                    <Text size="medium" weight="bold" style={{ fontFamily: MONO_FONT }} numberOfLines={1}>
                      {code}
                    </Text>
                    <Text size="xs" dimRate="60%">
                      {t("adminOperations.scan.notFound")}
                    </Text>
                  </View>
                  <Pill label={t("adminOperations.scan.noMatch")} tone="red" />
                </View>
                {scannedCode && (
                  <Button title={t("adminOperations.scan.scanAgain")} variant="outline" onPress={scanAgain} style={styles.cardButton} />
                )}
              </>
            ) : single ? (
              <>
                <View style={styles.resultRow}>
                  <Feather name="hexagon" size={rs(22)} color={Colors.text} />
                  <View style={styles.resultText}>
                    <Text size="medium" weight="bold" style={{ fontFamily: MONO_FONT }} numberOfLines={1}>
                      {code}
                    </Text>
                    <Text size="xs" dimRate="60%">
                      {[single.carrierName, `→ ${single.trackingNumber}`].filter(Boolean).join(" ")} · {single.clientName}
                    </Text>
                  </View>
                  <Pill label={t("adminOperations.scan.found")} tone="green" />
                </View>
                <Button title={t("adminOperations.scan.open")} onPress={() => open(single.id)} style={styles.cardButton} />
                {scannedCode && (
                  <Pressable onPress={scanAgain} style={styles.scanAgainLink} hitSlop={rs(8)}>
                    <Text size="small" weight="semibold" dimRate="60%">
                      {t("adminOperations.scan.scanAgain")}
                    </Text>
                  </Pressable>
                )}
              </>
            ) : (
              <>
                {matches.slice(0, 5).map((match, index) => (
                  <Pressable
                    key={match.id}
                    onPress={() => open(match.id)}
                    style={[styles.resultRow, index > 0 && styles.resultDivider]}
                  >
                    <Feather name="hexagon" size={rs(22)} color={Colors.text} />
                    <View style={styles.resultText}>
                      <Text size="medium" weight="bold" style={{ fontFamily: MONO_FONT }} numberOfLines={1}>
                        {match.trackingNumber}
                      </Text>
                      <Text size="xs" dimRate="60%">
                        {[match.carrierName, match.carrierTrackingNumber, match.clientName].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    <Pill label={statusLabel(match.status, t)} tone={statusTone(match.status)} />
                  </Pressable>
                ))}
                {scannedCode && (
                  <Button title={t("adminOperations.scan.scanAgain")} variant="outline" onPress={scanAgain} style={styles.cardButton} />
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const CORNER = rs(40);
const RADIUS = rs(26);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: DARK,
  },
  topBar: {
    paddingHorizontal: rs(16),
  },
  closeButton: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(12),
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: rs(24),
    paddingTop: rvs(20),
  },
  title: {
    color: Colors.white,
    textAlign: "center",
  },
  subtitle: {
    color: "#9AA3B2",
    textAlign: "center",
    marginTop: rvs(8),
  },
  frame: {
    marginTop: rvs(44),
    marginHorizontal: rs(12),
    height: FRAME_HEIGHT,
  },
  frameInner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: "#3A4250",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DARK,
  },
  corner: {
    position: "absolute",
    width: CORNER,
    height: CORNER,
    borderColor: Colors.primary,
  },
  cornerTL: { top: -1, left: -1, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: RADIUS },
  cornerTR: { top: -1, right: -1, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: RADIUS },
  cornerBL: { bottom: -1, left: -1, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: RADIUS },
  cornerBR: { bottom: -1, right: -1, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: RADIUS },
  laser: {
    position: "absolute",
    left: rs(20),
    right: rs(20),
    height: 2,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  permissionBox: {
    alignItems: "center",
    paddingHorizontal: rs(20),
  },
  permissionText: {
    color: "#9AA3B2",
    textAlign: "center",
    marginTop: rvs(10),
  },
  permissionButton: {
    marginTop: rvs(14),
    backgroundColor: Colors.primary,
    borderRadius: rs(12),
    paddingHorizontal: rs(18),
    paddingVertical: rvs(10),
  },
  manualLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(6),
    marginTop: rvs(18),
  },
  manualText: {
    color: "#9AA3B2",
  },
  codeInput: {
    marginTop: rvs(18),
    color: Colors.white,
    fontSize: rs(18),
    textAlign: "center",
    paddingVertical: rvs(10),
    borderBottomWidth: 1,
    borderBottomColor: "#3A4250",
  },
  resultCard: {
    marginTop: rvs(36),
    backgroundColor: Colors.white,
    borderRadius: rs(22),
    padding: rs(16),
  },
  loading: {
    paddingVertical: rvs(16),
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
    paddingVertical: rvs(4),
  },
  resultDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: rvs(10),
    marginTop: rvs(6),
  },
  resultText: {
    flex: 1,
  },
  cardButton: {
    marginTop: rvs(14),
    height: rvs(50),
  },
  scanAgainLink: {
    alignSelf: "center",
    marginTop: rvs(12),
  },
});
