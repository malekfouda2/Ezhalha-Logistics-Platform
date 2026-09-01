import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { ToggleCard } from "@/components/sections/createShipment/ToggleCard";
import SectionTitle from "@/components/sections/createShipment/SectionTitle";
import InfoBox from "@/components/sections/createShipment/InfoBox";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { usePickupStep } from "@/lib/hooks/createShipment/express/usePickupStep";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu"];

function isKsaWeekendDow(dow: number): boolean {
  return dow === 5 || dow === 6;
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function CarrierPickupScreen() {
  const { t } = useTranslation();

  const {
    pickup,
    setPickup,
    defaultPickup,
    isSubmitting,
    handleContinue,
    handleBack,
  } = usePickupStep();

  const requestPickup = pickup.requested;

  const selectedDate =
    pickup.custom && pickup.date ? pickup.date : defaultPickup.date;

  const selectedDateValue = useMemo(
    () => parseDateKey(selectedDate),
    [selectedDate],
  );

  const minPickupDate = useMemo(
    () => parseDateKey(defaultPickup.date),
    [defaultPickup.date],
  );

  const defaultDateLabel = useMemo(() => {
    const d = new Date(`${defaultPickup.date}T00:00:00Z`);
    const dayLabel = DAY_KEYS[d.getUTCDay()];
    const formatted = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(d);
    return `${t(`createShipment.express.days.${dayLabel}`)}, ${formatted}`;
  }, [defaultPickup.date, t]);

  return (
    <ShipmentStepLayout
      step={7}
      totalSteps={8}
      title={t("createShipment.express.steps.step7.title")}
      subtitle={t("createShipment.express.steps.step7.subtitle")}
      onContinue={handleContinue}
      onBack={handleBack}
      loading={isSubmitting}
      continueLabel={t("createShipment.express.steps.step7.reviewOrder")}
    >
      <View style={styles.sameDayBox}>
        <Feather
          name="clock"
          size={rvs(16)}
          color={Colors.amberTextColor}
          style={styles.sameDayIcon}
        />
        <View style={styles.sameDayTextGroup}>
          <Text size="small" weight="semibold" style={styles.sameDayText}>
            {t("createShipment.express.steps.step7.sameDayPickupTitle")}
          </Text>
          <Text size="small" style={styles.sameDayText}>
            {t("createShipment.express.steps.step7.sameDayPickupDefaultDate", {
              date: defaultDateLabel,
            })}
          </Text>
          <Text size="small" style={styles.sameDayText}>
            {t("createShipment.express.steps.step7.sameDayPickupRule")}
          </Text>
        </View>
      </View>

      <ToggleCard
        title={t("createShipment.express.steps.step7.requestPickup")}
        description={t("createShipment.express.steps.step7.dropOffBranch")}
        value={requestPickup}
        onValueChange={(v) => setPickup({ requested: v })}
      />

      {requestPickup ? (
        <>
          <DatePickerField
            label={t("createShipment.express.steps.step7.pickupDate")}
            value={selectedDateValue}
            minimumDate={minPickupDate}
            isDateDisabled={(date) => isKsaWeekendDow(date.getDay())}
            onChange={(date) => setPickup({ custom: true, date: formatDateKey(date) })}
          />

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

          <InfoBox text={t("createShipment.express.steps.step7.info")} />
        </>
      ) : null}
    </ShipmentStepLayout>
  );
}

const styles = StyleSheet.create({
  sameDayBox: {
    flexDirection: "row",
    gap: rvs(8),
    padding: rvs(12),
    borderRadius: rvs(10),
    borderWidth: 1,
    borderColor: Colors.amberBorderColor,
    backgroundColor: Colors.amberBackgroundColor,
    marginBottom: rvs(14),
  },

  sameDayIcon: {
    marginTop: rvs(2),
  },

  sameDayTextGroup: {
    flex: 1,
    gap: rvs(2),
  },

  sameDayText: {
    color: Colors.amberTextColor,
  },

  timeRow: {
    flexDirection: "row",
    gap: rs(18),
  },

  timeHalf: {
    flex: 1,
  },
});
