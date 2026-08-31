import { useRouter } from "expo-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useCreateShipmentStore, Address } from "@/store/createShipmentStore";
import { AddressFormInput, addressSchema } from "@/schemas/address";
import { AddressBookEntry } from "@/lib/services/createShipment";

export function useRecipientStep() {
  const router = useRouter();
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  const recipient = useCreateShipmentStore((s) => s.recipient);
  const shipmentType = useCreateShipmentStore((s) => s.shipmentType);
  const setRecipient = useCreateShipmentStore((s) => s.setRecipient);

  const form = useForm<AddressFormInput>({
    resolver: zodResolver(addressSchema),
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

  const handleContinue = form.handleSubmit((values) => {
    const address: Address = { ...values };
    setRecipient(address);
    router.push("/createShipment/express/step-4");
  });

  const handleBack = () => router.back();

  const applySavedAddress = (entry: AddressBookEntry) => {
    setSelectedAddressId(entry.id);
    const values: Address = {
      name: entry.name,
      phone: entry.phone,
      email: entry.email || "",
      country: entry.country || entry.countryCode,
      company: entry.company || "",
      countryCode: shipmentType === "domestic" ? "SA" : entry.countryCode,
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

  return {
    form,
    recipient,
    shipmentType,
    savedRecipientAddresses,
    isLoadingAddresses,
    selectedAddressId,
    applySavedAddress,
    handleContinue,
    handleBack,
  };
}