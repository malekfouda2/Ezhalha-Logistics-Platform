import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";

import { useCreateLocalShipmentStore, LocalAddress } from "@/store/createLocalShipmentStore";
import { AddressBookEntry } from "@/lib/services/createShipment";
import { LocalAddressFormInput, localAddressSchema } from "@/schemas/localAddress";

export function useLocalRecipientStep() {
  const router = useRouter();
  const { t } = useTranslation();
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const hasPrefilled = useRef(false);

  const recipient = useCreateLocalShipmentStore((s) => s.recipient);
  const setRecipient = useCreateLocalShipmentStore((s) => s.setRecipient);

  const form = useForm<LocalAddressFormInput>({
    resolver: zodResolver(localAddressSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: recipient,
  });

  const { data: addressBookEntries = [], isLoading: isLoadingAddresses } = useQuery<AddressBookEntry[]>({
    queryKey: ["/api/client/address-book"],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const savedRecipientAddresses = addressBookEntries.filter((e) => e.useForRecipient);

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
    setRecipient(values);
    setTimeout(() => form.trigger(), 0);
  };

  useEffect(() => {
    if (hasPrefilled.current || isLoadingAddresses || recipient.name) return;
    const defaultAddress = addressBookEntries.find(
      (e) => e.source === "default_shipping" && e.useForRecipient,
    );
    if (!defaultAddress) return;
    hasPrefilled.current = true;
    applySavedAddress(defaultAddress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressBookEntries, isLoadingAddresses]);

  return {
    form,
    savedRecipientAddresses,
    isLoadingAddresses,
    selectedAddressId,
    applySavedAddress,
    handleContinue,
    handleBack: () => router.back(),
  };
}
