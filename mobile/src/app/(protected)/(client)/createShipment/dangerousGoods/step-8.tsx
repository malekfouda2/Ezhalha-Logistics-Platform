// app/create-shipment/dangerousGoods/step-8.tsx

import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { SummaryCard } from "@/components/sections/createShipment/doorToDoor/SummaryCard";
import { DeclarationSummaryCard } from "@/components/sections/createShipment/dangerousGoods/DeclarationSummaryCard";
import { DatePickerField } from "@/components/ui/DatePickerField";
import InfoBox from "@/components/ui/InfoBox";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { useReviewStep } from "@/lib/hooks/createShipment/dangerousGoods/useReviewStep";
import { Colors } from "@/constants/colors";
import { rvs } from "@/utils/responsive";

// Both directions stay in local time deliberately — `new Date("yyyy-mm-dd")` and
// `date.toISOString()` both go through UTC, which silently shifts the date by a day in any
// timezone ahead of or behind UTC (exactly the "picks the day before" bug this was causing).
function parseDateInput(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function DangerousGoodsReviewScreen() {
  const { t } = useTranslation();
  const {
    shipper,
    recipient,
    packages,
    contentKind,
    commodities,
    documentCount,
    preferredPickupDate,
    setPreferredPickupDate,
    isSubmitting,
    handleContinue,
    handleBack,
  } = useReviewStep();

  const totalWeight = packages.reduce((sum, p) => sum + Number(p.weight || 0), 0);

  return (
    <ShipmentStepLayout
      step={8}
      totalSteps={8}
      title={t("createShipment.dangerousGoods.steps.step8.title")}
      subtitle={t("createShipment.dangerousGoods.steps.step8.subtitle")}
      onContinue={handleContinue}
      onBack={handleBack}
      loading={isSubmitting}
      continueLabel={t("createShipment.dangerousGoods.steps.step8.submit")}
    >
      <SummaryCard
        rows={[
          { label: t("createShipment.dangerousGoods.steps.step8.from"), note: `${shipper.city}, ${shipper.countryCode}` },
          { label: t("createShipment.dangerousGoods.steps.step8.to"), note: `${recipient.city}, ${recipient.countryCode}` },
          {
            label: t("createShipment.dangerousGoods.steps.step8.packages"),
            note: t("createShipment.dangerousGoods.steps.step8.packagesValue", {
              count: packages.length,
              weight: totalWeight,
            }),
          },
        ]}
      />

      <DeclarationSummaryCard
        contentKind={contentKind}
        commodities={commodities}
        documentCount={documentCount}
      />

      <View style={styles.dateWrapper}>
        <DatePickerField
          label={t("createShipment.dangerousGoods.steps.step8.preferredPickupDate")}
          value={parseDateInput(preferredPickupDate)}
          onChange={(date) => setPreferredPickupDate(formatDateInput(date))}
          onClear={() => setPreferredPickupDate("")}
          minimumDate={new Date()}
        />
      </View>

      <InfoBox
        text={t("createShipment.dangerousGoods.steps.step8.nothingChargedNow")}
        backgroundColor={Colors.amberBackgroundColor}
        borderColor={Colors.amberBorderColor}
        textColor={Colors.amberTextColor}
        iconColor={Colors.amberTextColor}
      />
    </ShipmentStepLayout>
  );
}

const styles = StyleSheet.create({
  dateWrapper: {
    marginBottom: rvs(10),
  },
});
