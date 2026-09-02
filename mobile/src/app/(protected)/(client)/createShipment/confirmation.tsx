// app/create-shipment/confirmation.tsx

import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import ShipmentFooter from "@/components/sections/createShipment/ShipmentStepFooter";
import { handleDownloadCarrierLabel, handleDownloadCommercialInvoice } from "@/utils/utils";

type ShipmentType = "express" | "local" | "freight";

type DocAction = {
  key: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void | Promise<void>;
};

type ShipmentConfig = {
  title: string;
  subtitle: string;
  idLabel: string;
  idValue: string;
  footerTitle: string;
  onFooterPress: (router: ReturnType<typeof useRouter>) => void;
  cardRow: {
    left: string;
    status: string;
  };
  docActions?: DocAction[];
};

function getConfig(
  type: ShipmentType,
  router: ReturnType<typeof useRouter>,
  t: (key: string) => string,
  params: { trackingNumber?: string; route?: string; shipmentId?: string },
): ShipmentConfig {
  const shipmentId = params.shipmentId;

  switch (type) {
    case "local":
      return {
        title: t("createShipment.confirmation.local.title"),
        subtitle: t("createShipment.confirmation.local.subtitle"),
        idLabel: t("createShipment.confirmation.local.idLabel"),
        idValue: "EZH552031884",
        footerTitle: t("createShipment.confirmation.local.footerTitle"),
        onFooterPress: (r) => r.replace("/(tabs)/shipments"),
        cardRow: {
          left: "",
          status: "",
        },
        docActions: [
          {
            key: "label",
            label: t("createShipment.confirmation.local.docLabel"),
            icon: "file-text",
            onPress: () => (shipmentId ? handleDownloadCarrierLabel(shipmentId) : undefined),
          },
          {
            key: "track",
            label: t("createShipment.confirmation.local.docTrack"),
            icon: "map-pin",
            onPress: () => {},
          },
        ],
      };

    case "freight":
      return {
        title: t("createShipment.confirmation.freight.title"),
        subtitle: t("createShipment.confirmation.freight.subtitle"),
        idLabel: t("createShipment.confirmation.freight.idLabel"),
        idValue: params.trackingNumber || "DDP-2026-0117",
        footerTitle: t("createShipment.confirmation.freight.footerTitle"),
        onFooterPress: (r) => (shipmentId ? r.replace(`/shipments/${shipmentId}`) : r.replace("/(tabs)/shipments")),
        cardRow: {
          left: params.route || "Air · China → Riyadh",
          status: t("createShipment.confirmation.freight.statusUnderReview"),
        },
        docActions: undefined,
      };

    case "express":
    default:
      return {
        title: t("createShipment.confirmation.express.title"),
        subtitle: t("createShipment.confirmation.express.subtitle"),
        idLabel: t("createShipment.confirmation.express.idLabel"),
        idValue: "EZH977158300",
        footerTitle: t("createShipment.confirmation.express.footerTitle"),
        onFooterPress: (r) => r.replace("/(tabs)/shipments"),
        cardRow: {
          left: "FedEx · 7940 5613 3021",
          status: t("createShipment.confirmation.express.statusProcessing"),
        },
        docActions: [
          {
            key: "label",
            label: t("createShipment.confirmation.express.docLabel"),
            icon: "file-text",
            onPress: () => (shipmentId ? handleDownloadCarrierLabel(shipmentId) : undefined),
          },
          {
            key: "invoice",
            label: t("createShipment.confirmation.express.docInvoice"),
            icon: "file-text",
            onPress: () => (shipmentId ? handleDownloadCommercialInvoice(shipmentId) : undefined),
          },
        ],
      };
  }
}

export default function ShipmentConfirmationScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    type?: string;
    trackingNumber?: string;
    route?: string;
    shipmentId?: string;
  }>();
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const type: ShipmentType =
    params.type === "local" || params.type === "freight"
      ? params.type
      : "express";

  const config = getConfig(type, router, t, {
    trackingNumber: params.trackingNumber,
    route: params.route,
    shipmentId: params.shipmentId,
  });
  const showCardRow = config.cardRow.left.length > 0;

  const handleDocPress = async (action: DocAction) => {
    if (downloadingKey) return;
    setDownloadingKey(action.key);
    try {
      await action.onPress();
    } finally {
      setDownloadingKey(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.successCircle}>
          <Feather name="check" size={rs(40)} color="#2FB463" />
        </View>

        <Text size="xxl" weight="bold" style={styles.title}>
          {config.title}
        </Text>

        <Text size="small" weight="semibold" style={styles.subtitle}>
          {config.subtitle}
        </Text>

        <View style={styles.idCard}>
          <Text size="xs" weight="bold" style={styles.idLabel}>
            {config.idLabel}
          </Text>

          <Text size="medium" weight="bold" style={styles.idValue}>
            {config.idValue}
          </Text>

          {showCardRow && (
            <>
              <View style={styles.divider} />

              <View style={styles.trackingRow}>
                <Text
                  size="small"
                  weight="semibold"
                  style={styles.trackingText}
                >
                  {config.cardRow.left}
                </Text>

                <View style={styles.statusPill}>
                  <Text size="xs" weight="bold" style={styles.statusText}>
                    {config.cardRow.status}
                  </Text>
                </View>
              </View>
            </>
          )}
        </View>

        {config.docActions && config.docActions.length > 0 && (
          <View style={styles.docRow}>
            {config.docActions.map((action) => (
              <Pressable
                key={action.key}
                style={({ pressed }) => [styles.docButton, pressed && styles.docButtonPressed]}
                onPress={() => handleDocPress(action)}
                disabled={downloadingKey === action.key}
              >
                {downloadingKey === action.key ? (
                  <ActivityIndicator size="small" color={Colors.text} />
                ) : (
                  <Feather name={action.icon} size={rs(18)} color={Colors.text} />
                )}
                <Text size="medium" weight="bold" style={styles.docLabel}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <ShipmentFooter
        title={config.footerTitle}
        onPress={() => config.onFooterPress(router)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: "space-between",
  },

  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: rs(20),
  },

  successCircle: {
    width: rs(80),
    height: rs(80),
    borderRadius: 50,
    backgroundColor: "#DDF5E4",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: rvs(20),
  },

  title: {
    color: Colors.text,
    textAlign: "center",
    marginBottom: rvs(10),
  },

  subtitle: {
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: rvs(20),
  },

  idCard: {
    width: "100%",
    backgroundColor: Colors.white,
    borderRadius: rs(22),
    paddingHorizontal: rs(20),
    paddingVertical: rvs(15),
    alignItems: "center",
    marginBottom: rvs(10),
  },

  idLabel: {
    color: "#687994",
    letterSpacing: 1,
    marginBottom: rvs(8),
  },

  idValue: {
    color: Colors.text,
    marginBottom: rvs(16),
  },

  divider: {
    width: "100%",
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: rvs(16),
  },

  trackingRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  trackingText: {
    color: Colors.textSecondary,
  },

  statusPill: {
    backgroundColor: "#FDF3D6",
    borderRadius: rs(10),
    paddingHorizontal: rs(12),
    paddingVertical: rvs(6),
  },

  statusText: {
    color: "#8A6D0F",
  },

  docRow: {
    flexDirection: "row",
    gap: rs(10),
    width: "100%",
  },

  docButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",

    backgroundColor: Colors.white,
    borderRadius: rs(16),
    borderWidth: 1,
    borderColor: Colors.border,

    paddingVertical: rvs(12),
    gap: rs(8),
  },

  docButtonPressed: {
    opacity: 0.7,
  },

  docLabel: {
    color: Colors.text,
  },

  footer: {
    paddingHorizontal: rs(20),
    paddingBottom: rvs(10),
  },
});