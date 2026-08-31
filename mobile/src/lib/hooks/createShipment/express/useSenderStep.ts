import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";

import { useCreateShipmentStore } from "@/store/createShipmentStore";
import { AddressBookEntry } from "@/lib/services/createShipment";
import { AddressFormInput, addressSchema } from "@/schemas/address";
import { Address } from "@/store/createShipmentStore";

export function useSenderStep() {
  const router = useRouter();
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  const shipper = useCreateShipmentStore((s) => s.shipper);
  const shipmentType = useCreateShipmentStore((s) => s.shipmentType);
  const setShipper = useCreateShipmentStore((s) => s.setShipper);

  const form = useForm<AddressFormInput>({
    resolver: zodResolver(addressSchema),
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

  const handleContinue = form.handleSubmit((values) => {
    const address: Address = { ...values };
    setShipper(address);
    router.push("/createShipment/express/step-3");
  });

  const applySavedAddress = (entry: AddressBookEntry) => {
    setSelectedAddressId(entry.id);
    const values: Address = {
      name: entry.name,
      company: entry.company || "",
      phone: entry.phone,
      email: entry.email || "",
      countryCode: shipmentType === "domestic" ? "SA" : entry.countryCode,
      city: entry.city,
      postalCode: entry.postalCode || "",
      addressLine1: entry.addressLine1,
      addressLine2: entry.addressLine2 || "",
      stateOrProvince: entry.stateOrProvince || "",
      shortAddress: entry.shortAddress || "",
      country: entry.country || entry.countryCode,
    };
    form.reset(values);
    setShipper(values);
    setTimeout(() => form.trigger(), 0);
  };

  return {
    form,
    shipmentType,
    savedSenderAddresses,
    isLoadingAddresses,
    selectedAddressId,
    applySavedAddress,
    handleContinue,
    handleBack: () => router.back(),
  };
}