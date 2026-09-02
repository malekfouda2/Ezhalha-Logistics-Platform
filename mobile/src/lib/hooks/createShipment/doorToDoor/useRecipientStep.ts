import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";

import { useDoorToDoorStore } from "@/store/createDoorToDoorStore";
import { Address } from "@/store/createShipmentStore";
import { AddressFormInput, addressSchema } from "@/schemas/address";
import { AddressBookEntry } from "@/lib/services/createShipment";

interface ClientAccount {
  name: string;
  email: string;
  phone: string;
  shippingContactName?: string | null;
  shippingContactPhone?: string | null;
  shippingCountryCode?: string | null;
  shippingStateOrProvince?: string | null;
  shippingCity?: string | null;
  shippingPostalCode?: string | null;
  shippingAddressLine1?: string | null;
  shippingAddressLine2?: string | null;
}

export function useRecipientStep() {
  const router = useRouter();
  const { t } = useTranslation();
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const hasPrefilled = useRef(false);

  const recipient = useDoorToDoorStore((s) => s.recipient);
  const destinationCountryCode = useDoorToDoorStore((s) => s.destinationCountryCode);
  const setRecipient = useDoorToDoorStore((s) => s.setRecipient);

  const form = useForm<AddressFormInput>({
    resolver: zodResolver(addressSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: recipient,
  });

  const { data: account } = useQuery<ClientAccount>({ queryKey: ["/api/client/account"] });

  const { data: addressBookEntries = [], isLoading: isLoadingAddresses } = useQuery<AddressBookEntry[]>({
    queryKey: ["/api/client/address-book"],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const savedRecipientAddresses = addressBookEntries.filter((e) => e.useForRecipient);

  useEffect(() => {
    if (!account || hasPrefilled.current || recipient.name) return;
    hasPrefilled.current = true;

    const values: Address = {
      name: account.shippingContactName || account.name || "",
      company: "",
      phone: account.shippingContactPhone || account.phone || "",
      email: account.email || "",
      countryCode: destinationCountryCode,
      country: destinationCountryCode,
      city: account.shippingCity || "",
      postalCode: account.shippingPostalCode || "",
      addressLine1: account.shippingAddressLine1 || "",
      addressLine2: account.shippingAddressLine2 || "",
      stateOrProvince: account.shippingStateOrProvince || "",
      shortAddress: "",
    };

    form.reset(values);
    setRecipient(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  const handleContinue = form.handleSubmit(
    (values) => {
      const address: Address = { ...values, countryCode: destinationCountryCode, country: destinationCountryCode };
      setRecipient(address);
      router.push("/createShipment/doorToDoor/step-4");
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
    const values: Address = {
      name: entry.name,
      company: entry.company || "",
      phone: entry.phone,
      email: entry.email || "",
      countryCode: destinationCountryCode,
      country: destinationCountryCode,
      city: entry.city,
      postalCode: entry.postalCode || "",
      addressLine1: entry.addressLine1,
      addressLine2: entry.addressLine2 || "",
      stateOrProvince: entry.stateOrProvince || "",
      shortAddress: entry.shortAddress || "",
    };
    form.reset(values);
    setRecipient(values);
    setTimeout(() => form.trigger(), 0);
  };

  const handleBack = () => router.back();

  return {
    form,
    destinationCountryCode,
    savedRecipientAddresses,
    isLoadingAddresses,
    selectedAddressId,
    applySavedAddress,
    handleContinue,
    handleBack,
  };
}
