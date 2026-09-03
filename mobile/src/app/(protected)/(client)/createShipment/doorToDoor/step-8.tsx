// app/create-shipment/doorToDoor/step-8.tsx

import { Linking, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { AcceptCheckboxRow } from "@/components/sections/createShipment/doorToDoor/AcceptCheckboxRow";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import InfoBox from "@/components/ui/InfoBox";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { useNotesStep } from "@/lib/hooks/createShipment/doorToDoor/useNotesStep";
import { API_BASE_URL } from "@/api/client";
import { Colors } from "@/constants/colors";
import { rvs } from "@/utils/responsive";

export default function NotesAndTermsScreen() {
  const { t } = useTranslation();
  const {
    specialInstructions,
    setSpecialInstructions,
    acceptedCustoms,
    setAcceptedCustoms,
    acceptedTerms,
    setAcceptedTerms,
    acceptedBroker,
    setAcceptedBroker,
    isSubmitting,
    handleContinue,
    handleBack,
  } = useNotesStep();

  const openTerms = () => Linking.openURL(`${API_BASE_URL}/policy/terms-and-conditions`);
  const openShippingPolicy = () => Linking.openURL(`${API_BASE_URL}/policy/shipping-return-policy`);

  return (
    <ShipmentStepLayout
      step={8}
      totalSteps={9}
      title={t("createShipment.freight.steps.step8.title")}
      subtitle={t("createShipment.freight.steps.step8.subtitle")}
      onContinue={handleContinue}
      onBack={handleBack}
      loading={isSubmitting}
    >
      <SectionTitle title={t("createShipment.freight.steps.step8.notesLabel")} />

      <Input
        placeholder={t("createShipment.freight.steps.step8.notesPlaceholder")}
        value={specialInstructions}
        onChangeText={setSpecialInstructions}
        multiline
        numberOfLines={5}
        style={styles.notesInput}
      />

      <AcceptCheckboxRow checked={acceptedCustoms} onToggle={() => setAcceptedCustoms(!acceptedCustoms)}>
        <Text size="small" style={styles.acceptText}>
          {t("createShipment.freight.steps.step8.acceptCustoms")}
        </Text>
      </AcceptCheckboxRow>

      <AcceptCheckboxRow checked={acceptedTerms} onToggle={() => setAcceptedTerms(!acceptedTerms)}>
        <Text size="small" style={styles.acceptText}>
          {t("createShipment.freight.steps.step8.acceptTermsPrefix")}{" "}
          <Text size="small" weight="bold" style={styles.link} onPress={openTerms}>
            {t("createShipment.freight.steps.step8.acceptTermsLink")}
          </Text>{" "}
          {t("createShipment.freight.steps.step8.acceptTermsAnd")}{" "}
          <Text size="small" weight="bold" style={styles.link} onPress={openShippingPolicy}>
            {t("createShipment.freight.steps.step8.acceptShippingLink")}
          </Text>
          .
        </Text>
      </AcceptCheckboxRow>

      <AcceptCheckboxRow checked={acceptedBroker} onToggle={() => setAcceptedBroker(!acceptedBroker)}>
        <Text size="small" style={styles.acceptText}>
          {t("createShipment.freight.steps.step8.acceptBroker")}
        </Text>
      </AcceptCheckboxRow>

      <InfoBox text={t("createShipment.freight.steps.step8.info")} />
    </ShipmentStepLayout>
  );
}

const styles = StyleSheet.create({
  notesInput: {
    height: rvs(110),
    textAlignVertical: "top",
    paddingTop: rvs(14),
  },

  acceptText: {
    color: Colors.text,
  },

  link: {
    color: Colors.primary,
    textDecorationLine: "underline",
  },
});
