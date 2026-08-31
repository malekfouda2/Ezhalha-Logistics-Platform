import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
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
import { usePickupStep } from "@/lib/hooks/createShipment/express/usePickupStep";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu"];

function isKsaWeekendDow(dow: number): boolean {
  return dow === 5 || dow === 6;
}

function getUpcomingPickupDates(startDate: string, count: number): string[] {
  const dates: string[] = [];
  const cur = new Date(`${startDate}T00:00:00Z`);
  while (dates.length < count) {
    if (!isKsaWeekendDow(cur.getUTCDay())) {
      dates.push(cur.toISOString().slice(0, 10));
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

export default function CarrierPickupScreen() {
  const { t } = useTranslation();
  const [requestPickup, setRequestPickup] = useState(true);

  const { pickup, setPickup, defaultPickup, isSubmitting, handleContinue, handleBack } =
    usePickupStep();

  const dateOptions = useMemo(
    () => getUpcomingPickupDates(defaultPickup.date, 3),
    [defaultPickup.date],
  );

  const selectedDate = pickup.custom && pickup.date ? pickup.date : defaultPickup.date;

  return (
    <ShipmentStepLayout
      step={7}
      totalSteps={8}
      title={t("createShipment.express.steps.step7.title")}
      subtitle={t("createShipment.express.steps.step7.subtitle")}
      onContinue={handleContinue}
      onBack={handleBack}
      continueLabel={
        isSubmitting
          ? t("common.loading")
          : t("createShipment.express.steps.step7.reviewOrder")
      }
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
            {dateOptions.map((date) => {
              const dayLabel = DAY_KEYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
              const dateLabel = new Intl.DateTimeFormat("en-GB", {
                day: "numeric",
                month: "short",
                timeZone: "UTC",
              }).format(new Date(`${date}T00:00:00Z`));

              return (
                <DatePill
                  key={date}
                  dayLabel={t(`createShipment.express.days.${dayLabel}`)}
                  dateLabel={dateLabel}
                  selected={selectedDate === date}
                  onPress={() => setPickup({ custom: true, date })}
                />
              );
            })}
          </View>

          <SectionTitle
            title={t("createShipment.express.steps.step7.readyBetween")}
          />

          <View style={styles.timeRow}>
            <View style={styles.timeHalf}>
              <Input
                value={pickup.readyTime}
                onChangeText={(v) => setPickup({ readyTime: v })}
                rightElement={
                  <Feather name="clock" size={rs(18)} color="#8A93A3" />
                }
              />
            </View>

            <View style={styles.timeHalf}>
              <Input
                value={pickup.closeTime}
                onChangeText={(v) => setPickup({ closeTime: v })}
                rightElement={
                  <Feather name="clock" size={rs(18)} color="#8A93A3" />
                }
              />
            </View>
          </View>

          <SectionTitle
            title={t("createShipment.express.steps.step7.pickupLocation")}
          />

          <Input
            placeholder={t(
              "createShipment.express.steps.step7.locationPlaceholder",
            )}
            value={pickup.location}
            onChangeText={(v) => setPickup({ location: v })}
          />

          <Input
            placeholder={t(
              "createShipment.express.steps.step7.instructionsPlaceholder",
            )}
            value={pickup.instructions}
            onChangeText={(v) => setPickup({ instructions: v })}
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
});
