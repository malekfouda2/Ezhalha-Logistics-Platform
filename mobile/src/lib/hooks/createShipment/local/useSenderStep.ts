import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";

import { useCreateLocalShipmentStore, LocalAddress } from "@/store/createLocalShipmentStore";
import { AddressBookEntry } from "@/lib/services/createShipment";
import { LocalAddressFormInput, localAddressSchema } from "@/schemas/localAddress";

export function useLocalSenderStep() {
  const router = useRouter();
  const { t } = useTranslation();
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  const shipper = useCreateLocalShipmentStore((s) => s.shipper);
  const setShipper = useCreateLocalShipmentStore((s) => s.setShipper);

  const form = useForm<LocalAddressFormInput>({
    resolver: zodResolver(localAddressSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: shipper,
  });

  const { data: addressBookEntries = [], isLoading: isLoadingAddresses } = useQuery<AddressBookEntry[]>({
    queryKey: ["/api/client/address-book"],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const savedSenderAddresses = addressBookEntries.filter((e) => e.useForShipper);

  const handleContinue = form.handleSubmit(
    (values) => {
      const address: LocalAddress = { ...values };
      setShipper(address);
      router.push("/createShipment/local/step-2");
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

  const applySavedAddress = (entry: AddressBookEntry) => {
    setSelectedAddressId(entry.id);
    const values: LocalAddress = {
      name: entry.name,
      phone: entry.phone,
      city: entry.city,
      district: entry.stateOrProvince || "",
      addressLine1: entry.addressLine1,
      shortAddress: entry.shortAddress || "",
    };
    form.reset(values);
    setShipper(values);
    setTimeout(() => form.trigger(), 0);
  };

  return {
    form,
    savedSenderAddresses,
    isLoadingAddresses,
    selectedAddressId,
    applySavedAddress,
    handleContinue,
    handleBack: () => router.back(),
  };
}
