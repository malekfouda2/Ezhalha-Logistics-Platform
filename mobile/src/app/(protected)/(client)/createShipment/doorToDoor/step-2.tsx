// app/create-shipment/doorToDoor/step-2.tsx

import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { OriginCountrySelect } from "@/components/sections/createShipment/doorToDoor/OriginCountrySelect";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import InfoBox from "@/components/ui/InfoBox";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { useOriginStep } from "@/lib/hooks/createShipment/doorToDoor/useOriginStep";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { countryCodeToFlag } from "@/utils/utils";
import { COUNTRY_CODE_SELECT_OPTIONS } from "@shared/countries";

function countryLabel(code: string) {
  return COUNTRY_CODE_SELECT_OPTIONS.find((c) => c.value === code)?.label ?? code;
}

const METHOD_LABEL: Record<string, string> = { air: "Air", sea: "Sea", domestic: "Land" };

export default function OriginCountryScreen() {
  const { t } = useTranslation();
  const { transportMethod, originCountryCode, originOptions, selectedLane, isLoading, selectOrigin, handleContinue, handleBack } =
    useOriginStep();

  return (
    <ShipmentStepLayout
      title={t("createShipment.freight.steps.step2.title")}
      subtitle={t("createShipment.freight.steps.step2.subtitle")}
      step={2}
      totalSteps={9}
      onContinue={handleContinue}
      onBack={handleBack}
    >
      <OriginCountrySelect
        value={originCountryCode}
        options={originOptions}
        placeholder={
          isLoading
            ? t("common.loading")
            : t("createShipment.freight.steps.step2.originPlaceholder")
        }
        title={t("createShipment.freight.steps.step2.originPlaceholder")}
        emptyText={t("createShipment.freight.steps.step2.originEmpty")}
        onSelect={selectOrigin}
      />

      {selectedLane ? (
        <>
          <View style={styles.gap} />

          <SectionTitle title={t("createShipment.freight.steps.step2.availableLanes")} />

          <View style={styles.laneCard}>
            <View style={styles.laneRow}>
              <Text size="medium" weight="semibold" style={styles.laneText}>
                {countryCodeToFlag(selectedLane.originCountryCode)} {countryLabel(selectedLane.originCountryCode)}
                {"  →  "}
                {countryLabel(selectedLane.destinationCountryCode)} · {METHOD_LABEL[transportMethod]}
              </Text>

              <Feather name="check-circle" size={rs(18)} color={Colors.primary} />
            </View>

            <Text size="xs" weight="semibold" style={styles.laneSubtext}>
              {t("createShipment.freight.steps.step2.laneFixedPricing")}
            </Text>
          </View>
        </>
      ) : null}

      <View style={styles.gap} />

      <InfoBox text={t("createShipment.freight.steps.step2.info")} />
    </ShipmentStepLayout>
  );
}

const styles = StyleSheet.create({
  gap: {
    height: rvs(16),
  },

  laneCard: {
    width: "100%",
    backgroundColor: Colors.white,
    borderRadius: rs(22),
    paddingHorizontal: rs(15),
    paddingVertical: rvs(15),
  },

  laneRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: rs(10),
  },

  laneText: {
    flex: 1,
    color: Colors.text,
  },

  laneSubtext: {
    color: Colors.textSecondary,
    marginTop: rvs(6),
  },
});
