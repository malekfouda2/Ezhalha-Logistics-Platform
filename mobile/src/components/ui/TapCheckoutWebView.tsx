// components/payments/TapCheckoutWebView.tsx

import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

export type TapCheckoutResult = {
  status: "success" | "failed" | "pending";
  shipmentId?: string;
  message?: string;
};

interface TapCheckoutWebViewProps {
  url: string | null;
  onResult: (result: TapCheckoutResult) => void;
  onClose: () => void;
}

/**
 * Tap's hosted checkout has no Expo-managed native SDK, so payment happens in a WebView
 * against Tap's own page. Tap redirects the WebView to our `/api/payments/tap/redirect`
 * once the charge settles; that request must be allowed through so the server can finalize
 * the shipment, but the *following* navigation (our app's `paymentStatus=` query params) is
 * intercepted here instead of being rendered, since that target is a web page the app has
 * no session for.
 */
function extractPaymentStatus(url: string): TapCheckoutResult | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const status = parsed.searchParams.get("paymentStatus");
  if (!status || !["success", "failed", "pending"].includes(status)) {
    return null;
  }

  return {
    status: status as TapCheckoutResult["status"],
    shipmentId: parsed.searchParams.get("shipmentId") ?? undefined,
    message: parsed.searchParams.get("message") ?? undefined,
  };
}

export function TapCheckoutWebView({ url, onResult, onClose }: TapCheckoutWebViewProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const handledRef = useRef(false);

  useEffect(() => {
    handledRef.current = false;
    setLoading(true);
  }, [url]);

  // onShouldStartLoadWithRequest can cancel the navigation before Tap's redirect target
  // (our own return-path page, which the app has no session for) ever loads, but Android
  // does not reliably invoke it for server-side redirects — onNavigationStateChange is the
  // fallback there. Both may fire for the same navigation, so a single-fire guard is needed.
  const handleRedirect = (navigationUrl: string) => {
    if (handledRef.current) {
      return true;
    }
    const result = extractPaymentStatus(navigationUrl);
    if (result) {
      handledRef.current = true;
      onResult(result);
      return false;
    }
    return true;
  };

  return (
    <Modal visible={!!url} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text size="medium" weight="semibold" style={styles.headerTitle}>
            {t("createShipment.express.payment.checkout.title")}
          </Text>
          <Pressable onPress={onClose} hitSlop={rs(12)}>
            <Ionicons name="close" size={rs(24)} color={Colors.text} />
          </Pressable>
        </View>

        {url ? (
          <WebView
            source={{ uri: url }}
            style={styles.webview}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onShouldStartLoadWithRequest={(request) => handleRedirect(request.url)}
            onNavigationStateChange={(navState) => handleRedirect(navState.url)}
            startInLoadingState
          />
        ) : null}

        {loading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(16),
    paddingVertical: rvs(12),
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  headerTitle: {
    color: Colors.text,
  },

  webview: {
    flex: 1,
  },

  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.white,
  },
});
