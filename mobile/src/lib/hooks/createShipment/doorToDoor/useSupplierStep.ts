import { useRouter } from "expo-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";

import { useDoorToDoorStore } from "@/store/createDoorToDoorStore";
import { SupplierFormInput, supplierSchema } from "@/schemas/supplier";

export function useSupplierStep() {
  const router = useRouter();
  const { t } = useTranslation();

  const supplierName = useDoorToDoorStore((s) => s.supplierName);
  const supplierPhone = useDoorToDoorStore((s) => s.supplierPhone);
  const supplierAddress = useDoorToDoorStore((s) => s.supplierAddress);
  const setSupplierName = useDoorToDoorStore((s) => s.setSupplierName);
  const setSupplierPhone = useDoorToDoorStore((s) => s.setSupplierPhone);
  const setSupplierAddress = useDoorToDoorStore((s) => s.setSupplierAddress);

  const form = useForm<SupplierFormInput>({
    resolver: zodResolver(supplierSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: { supplierName, supplierPhone, supplierAddress },
  });

  const handleContinue = form.handleSubmit(
    (values) => {
      setSupplierName(values.supplierName);
      setSupplierPhone(values.supplierPhone);
      setSupplierAddress(values.supplierAddress ?? "");
      router.push("/createShipment/doorToDoor/step-5");
    },
    (errors) => {
      const firstError = Object.values(errors)[0];
      Toast.show({
        type: "error",
        text1: t("toast.shipmentValidation.formInvalidTitle"),
        text2: typeof firstError?.message === "string" ? firstError.message : undefined,
      });
    },
  );

  const handleBack = () => router.back();

  return {
    form,
    handleContinue,
    handleBack,
  };
}
