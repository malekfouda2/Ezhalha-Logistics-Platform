import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/Input";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { DatePill } from "@/components/sections/createShipment/express/DatePill";
import { ToggleCard } from "@/components/sections/createShipment/ToggleCard";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import InfoBox from "@/components/sections/createShipment/InfoBox";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";

interface DateOption {
  id: string;
  dayLabel: string;
  dateLabel: string;
}

const DATE_OPTIONS: DateOption[] = [
  { id: "mon", dayLabel: "Mon", dateLabel: "18 Aug" },
  { id: "tue", dayLabel: "Tue", dateLabel: "19 Aug" },
  { id: "wed", dayLabel: "Wed", dateLabel: "20 Aug" },
];

export default function CarrierPickupScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const [requestPickup, setRequestPickup] = useState(true);
  const [selectedDateId, setSelectedDateId] = useState("tue");
  const [readyFrom, setReadyFrom] = useState("09:00");
  const [readyTo, setReadyTo] = useState("17:00");
  const [pickupLocation, setPickupLocation] = useState("");
  const [instructions, setInstructions] = useState("");

  const handleReviewOrder = () => {
    router.push("/createShipment/express/step-8");
  };

  return (
    <ShipmentStepLayout
      step={7}
      totalSteps={8}
      title={t("createShipment.express.steps.step7.title")}
      subtitle={t("createShipment.express.steps.step7.subtitle")}
      onContinue={handleReviewOrder}
      continueLabel={t("createShipment.express.steps.step7.reviewOrder")}
    >
      <ToggleCard
        title={t("createShipment.express.steps.step7.requestPickup")}
        description={t("createShipment.express.steps.step7.dropOffBranch")}
        value={requestPickup}
        onValueChange={setRequestPickup}
      />

      {requestPickup ? (
        <>
          <SectionTitle
            title={t("createShipment.express.steps.step7.pickupDate")}
          />

          <View style={styles.dateRow}>
            {DATE_OPTIONS.map((date) => (
              <DatePill
                key={date.id}
                dayLabel={t(
                  `createShipment.express.days.${date.id}`
                )}
                dateLabel={date.dateLabel}
                selected={selectedDateId === date.id}
                onPress={() => setSelectedDateId(date.id)}
              />
            ))}
          </View>

          <SectionTitle
            title={t("createShipment.express.steps.step7.readyBetween")}
          />

          <View style={styles.timeRow}>
            <View style={styles.timeHalf}>
              <Input
                value={readyFrom}
                onChangeText={setReadyFrom}
                rightElement={
                  <Feather
                    name="clock"
                    size={rs(18)}
                    color="#8A93A3"
                  />
                }
              />
            </View>

            <View style={styles.timeHalf}>
              <Input
                value={readyTo}
                onChangeText={setReadyTo}
                rightElement={
                  <Feather
                    name="clock"
                    size={rs(18)}
                    color="#8A93A3"
                  />
                }
              />
            </View>
          </View>

          <SectionTitle
            title={t("createShipment.express.steps.step7.pickupLocation")}
          />

          <Input
            placeholder={t(
              "createShipment.express.steps.step7.locationPlaceholder"
            )}
            value={pickupLocation}
            onChangeText={setPickupLocation}
          />

          <Input
            placeholder={t(
              "createShipment.express.steps.step7.instructionsPlaceholder"
            )}
            value={instructions}
            onChangeText={setInstructions}
          />

          <InfoBox
            text={t("createShipment.express.steps.step7.info")}
          />
        </>
      ) : null}
    </ShipmentStepLayout>
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
  },

  scrollContent: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(16),
  },

  dateRow: {
    flexDirection: "row",
    gap: rs(12),
    marginBottom: rvs(10),
  },

  timeRow: {
    flexDirection: "row",
    gap: rs(18),
  },

  timeHalf: {
    flex: 1,
  },

  infoBox: {
    marginTop: rvs(4),

    borderWidth: 1.5,
    borderColor: "#FFCDB6",
    borderRadius: rs(22),

    backgroundColor: "#FFF9F6",

    paddingHorizontal: rs(15),
    paddingVertical: rvs(15),

    flexDirection: "row",
    alignItems: "flex-start",
  },

  infoText: {
    flex: 1,
    color: "#B65B27",
    marginStart: rs(10),
  },

  footer: {
    paddingHorizontal: rs(20),
    paddingTop: rvs(10),
    paddingBottom: rvs(10),
    backgroundColor: Colors.background,
  },
});