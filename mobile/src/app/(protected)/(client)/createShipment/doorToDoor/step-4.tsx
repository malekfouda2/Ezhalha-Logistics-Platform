// app/create-shipment/doorToDoor/step-4.tsx

import { useTranslation } from "react-i18next";
import { Controller } from "react-hook-form";

import { Input } from "@/components/ui/Input";
import { PhoneInput } from "@/components/ui/PhoneInput";
import InfoBox from "@/components/ui/InfoBox";
import { ShipmentStepLayout } from "@/components/sections/createShipment/ShipmentStepLayout";
import { useSupplierStep } from "@/lib/hooks/createShipment/doorToDoor/useSupplierStep";

export default function SupplierDetailsScreen() {
  const { t } = useTranslation();
  const { form, handleContinue, handleBack } = useSupplierStep();
  const { control, formState: { errors } } = form;

  return (
    <ShipmentStepLayout
      step={4}
      totalSteps={9}
      title={t("createShipment.freight.steps.step4.title")}
      subtitle={t("createShipment.freight.steps.step4.subtitle")}
      onContinue={handleContinue}
      onBack={handleBack}
    >
      <Controller
        control={control}
        name="supplierName"
        render={({ field }) => (
          <Input
            placeholder={t("createShipment.freight.steps.step4.supplierName")}
            value={field.value}
            onChangeText={field.onChange}
            autoCapitalize="words"
            error={errors.supplierName?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="supplierPhone"
        render={({ field }) => (
          <PhoneInput
            value={field.value}
            onChangeValue={field.onChange}
            error={errors.supplierPhone?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="supplierAddress"
        render={({ field }) => (
          <Input
            placeholder={t("createShipment.freight.steps.step4.factoryAddress")}
            value={field.value}
            onChangeText={field.onChange}
          />
        )}
      />

      <InfoBox text={t("createShipment.freight.steps.step4.info")} />
    </ShipmentStepLayout>
  );
}
