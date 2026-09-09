// app/create-shipment/confirmation.tsx

import { useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import ShipmentFooter from "@/components/sections/createShipment/ShipmentStepFooter";
import {
  handleDownloadCarrierLabel,
  handleDownloadCommercialInvoice,
} from "@/utils/utils";

type ShipmentType = "express" | "local" | "freight" | "dangerousGoods";

type DocAction = {
  key: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void | Promise<void>;
};

/** One line in the uniform "rows" card style (dangerous goods) — label left, value right. */
type ConfigRow = {
  label: string;
  value: string;
  pill?: boolean;
};

type ShipmentConfig = {
  title: string;
  subtitle: string;
  footerTitle: string;
  onFooterPress: (router: ReturnType<typeof useRouter>) => void;
  docActions?: DocAction[];
  /**
   * The original big-centered-ID card: idLabel/idValue up top, then an optional divider and
   * one left-text/right-pill row. Used by express/local/freight.
   */
  idLabel?: string;
  idValue?: string;
  cardRow?: {
    left: string;
    status: string;
  };
  /**
   * The uniform stacked-rows card (dangerous goods' own design from its old step-9): every
   * row is a plain label/value pair, optionally shown as a pill. Takes over the whole card
   * when set — idLabel/idValue/cardRow are ignored.
   */
  rows?: ConfigRow[];
  /** Explanatory text shown below the card. */
  note?: string;
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
        onFooterPress: (r) =>
          // shipmentId
          //   ? r.replace(`/shipments/${shipmentId}/tracking`)
          //   :
             r.replace("/(tabs)/shipments"),
        cardRow: {
          left: "",
          status: "",
        },
        docActions: undefined,
      };

    case "freight":
      return {
        title: t("createShipment.confirmation.freight.title"),
        subtitle: t("createShipment.confirmation.freight.subtitle"),
        idLabel: t("createShipment.confirmation.freight.idLabel"),
        idValue: params.trackingNumber || "DDP-2026-0117",
        footerTitle: t("createShipment.confirmation.freight.footerTitle"),
        onFooterPress: (r) =>
          shipmentId
            ? r.replace(`/shipments/${shipmentId}`)
            : r.replace("/(tabs)/shipments"),
        cardRow: {
          left: params.route || "Air · China → Riyadh",
          status: t("createShipment.confirmation.freight.statusUnderReview"),
        },
        docActions: undefined,
      };

    case "dangerousGoods":
      return {
        title: t("createShipment.dangerousGoods.steps.step9.title"),
        subtitle: t("createShipment.dangerousGoods.steps.step9.subtitle"),
        footerTitle: t("createShipment.dangerousGoods.steps.step9.viewShipments"),
        onFooterPress: (r) => r.replace("/(tabs)/shipments"),
        rows: [
          {
            label: t("createShipment.dangerousGoods.steps.step9.reference"),
            value: params.trackingNumber || "",
          },
          {
            label: t("createShipment.dangerousGoods.steps.step9.status"),
            value: t("createShipment.dangerousGoods.steps.step9.underReview"),
            pill: true,
          },
          {
            label: t("createShipment.dangerousGoods.steps.step9.chargedSoFar"),
            value: t("createShipment.dangerousGoods.steps.step9.nothing"),
          },
        ],
        note: t("createShipment.dangerousGoods.steps.step9.note"),
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
        onFooterPress: (r) =>
          // shipmentId
          //   ? r.replace(`/shipments/${shipmentId}/tracking`)
          //   : 
            r.replace("/(tabs)/shipments"),
        cardRow: {
          left: "FedEx · 7940 5613 3021",
          status: t("createShipment.confirmation.express.statusProcessing"),
        },
        docActions: [
          {
            key: "label",
            label: t("createShipment.confirmation.express.docLabel"),
            icon: "file-text",
            onPress: () =>
              shipmentId ? handleDownloadCarrierLabel(shipmentId) : undefined,
          },
          {
            key: "invoice",
            label: t("createShipment.confirmation.express.docInvoice"),
            icon: "file-text",
            onPress: () =>
              shipmentId
                ? handleDownloadCommercialInvoice(shipmentId)
                : undefined,
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

  // A completed shipment can't be re-entered — the draft steps are already
  // cleared, so hardware back should land on home rather than pop into them.
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        router.replace("/(protected)/(client)/(tabs)/");
        return true;
      },
    );
    return () => subscription.remove();
  }, [router]);

  const type: ShipmentType =
    params.type === "local" || params.type === "freight" || params.type === "dangerousGoods"
      ? params.type
      : "express";

  const config = getConfig(type, router, t, {
    trackingNumber: params.trackingNumber,
    route: params.route,
    shipmentId: params.shipmentId,
  });
  const showCardRow = !!config.cardRow && config.cardRow.left.length > 0;

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

        {config.rows ? (
          <View style={styles.idCard}>
            {config.rows.map((row, index) => (
              <View
                key={row.label}
                style={[styles.row, index > 0 && styles.rowSpacing]}
              >
                <Text size="small" style={styles.rowLabel}>
                  {row.label}
                </Text>

                {row.pill ? (
                  <View style={styles.statusPill}>
                    <Text size="xs" weight="bold" style={styles.statusText}>
                      {row.value}
                    </Text>
                  </View>
                ) : (
                  <Text size="small" weight="bold" style={styles.rowValue}>
                    {row.value}
                  </Text>
                )}
              </View>
            ))}
          </View>
        ) : (
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
                    {config.cardRow!.left}
                  </Text>

                  <View style={styles.statusPill}>
                    <Text size="xs" weight="bold" style={styles.statusText}>
                      {config.cardRow!.status}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>
        )}

        {config.note ? (
          <Text size="small" dimRate="60%" style={styles.note}>
            {config.note}
          </Text>
        ) : null}

        {config.docActions && config.docActions.length > 0 && (
          <View style={styles.docRow}>
            {config.docActions.map((action) => (
              <Pressable
                key={action.key}
                style={({ pressed }) => [
                  styles.docButton,
                  pressed && styles.docButtonPressed,
                ]}
                onPress={() => handleDocPress(action)}
                disabled={downloadingKey === action.key}
              >
                {downloadingKey === action.key ? (
                  <ActivityIndicator size="small" color={Colors.text} />
                ) : (
                  <Feather
                    name={action.icon}
                    size={rs(18)}
                    color={Colors.text}
                  />
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

  row: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  rowSpacing: {
    marginTop: rvs(6),
  },

  rowLabel: {
    color: Colors.textSecondary,
  },

  rowValue: {
    color: Colors.text,
  },

  note: {
    textAlign: "center",
    marginTop: rvs(4),
    marginBottom: rvs(10),
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
