import { useRouter } from "expo-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";

import { useCreateLocalShipmentStore, LocalAddress } from "@/store/createLocalShipmentStore";
import { LocalAddressFormInput, localAddressSchema } from "@/schemas/localAddress";

export function useLocalRecipientStep() {
  const router = useRouter();
  const { t } = useTranslation();

  const recipient = useCreateLocalShipmentStore((s) => s.recipient);
  const setRecipient = useCreateLocalShipmentStore((s) => s.setRecipient);

  const form = useForm<LocalAddressFormInput>({
    resolver: zodResolver(localAddressSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: recipient,
  });

  const handleContinue = form.handleSubmit(
    (values) => {
      const address: LocalAddress = { ...values };
      setRecipient(address);
      router.push("/createShipment/local/step-3");
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

  return {
    form,
    handleContinue,
    handleBack: () => router.back(),
  };
}
