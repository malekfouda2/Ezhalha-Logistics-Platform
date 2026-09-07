import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";

import { useDoorToDoorStore, DdpLane } from "@/store/createDoorToDoorStore";
import { Address } from "@/store/createExpressShipmentStore";
import { AddressFormInput, addressSchema } from "@/schemas/address";
import { AddressBookEntry } from "@/lib/services/createShipment";

export function useRecipientStep() {
  const router = useRouter();
  const { t } = useTranslation();
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const hasPrefilled = useRef(false);

  const recipient = useDoorToDoorStore((s) => s.recipient);
  const transportMethod = useDoorToDoorStore((s) => s.transportMethod);
  const originCountryCode = useDoorToDoorStore((s) => s.originCountryCode);
  const destinationCountryCode = useDoorToDoorStore((s) => s.destinationCountryCode);
  const setRecipient = useDoorToDoorStore((s) => s.setRecipient);
  const setDestinationCountryCode = useDoorToDoorStore((s) => s.setDestinationCountryCode);

  const form = useForm<AddressFormInput>({
    resolver: zodResolver(addressSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: recipient,
  });

  const { data: lanes = [], isLoading: isLoadingLanes } = useQuery<DdpLane[]>({
    queryKey: ["/api/client/ddp/lanes"],
  });

  const isLaneAvailable = (lane: DdpLane) =>
    transportMethod === "air" ? lane.airAvailable : transportMethod === "sea" ? lane.seaAvailable : lane.domesticAvailable;

  const destinationOptions = Array.from(
    new Set(
      lanes
        .filter((lane) => lane.originCountryCode === originCountryCode && isLaneAvailable(lane))
        .map((lane) => lane.destinationCountryCode),
    ),
  );

  const { data: addressBookEntries = [], isLoading: isLoadingAddresses } = useQuery<AddressBookEntry[]>({
    queryKey: ["/api/client/address-book"],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const savedRecipientAddresses = addressBookEntries.filter((e) => e.useForRecipient);

  const selectDestination = (code: string) => {
    setDestinationCountryCode(code);
    form.setValue("countryCode", code, { shouldValidate: true });
    form.setValue("country", code, { shouldValidate: true });
  };

  useEffect(() => {
    if (destinationCountryCode && !destinationOptions.includes(destinationCountryCode)) {
      setDestinationCountryCode("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinationOptions.join("|")]);

  const buildAddressFromEntry = (entry: AddressBookEntry, countryCode: string): Address => ({
    name: entry.name,
    company: entry.company || "",
    phone: entry.phone,
    email: entry.email || "",
    countryCode,
    country: countryCode,
    city: entry.city,
    postalCode: entry.postalCode || "",
    addressLine1: entry.addressLine1,
    addressLine2: entry.addressLine2 || "",
    stateOrProvince: entry.stateOrProvince || "",
    shortAddress: entry.shortAddress || "",
  });

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
    const values = buildAddressFromEntry(entry, destinationCountryCode);
    form.reset(values);
    setRecipient(values);
    setTimeout(() => form.trigger(), 0);
  };

  // Auto-fill from the client's default saved address as soon as it's available — including
  // picking the destination country when the user hasn't chosen one yet — rather than requiring
  // a manual "select saved address" tap.
  useEffect(() => {
    if (hasPrefilled.current || isLoadingAddresses || isLoadingLanes || recipient.name) return;
    const defaultAddress = addressBookEntries.find(
      (e) => e.source === "default_shipping" && e.useForRecipient,
    );
    if (!defaultAddress) return;
    hasPrefilled.current = true;

    const resolvedCountryCode =
      destinationCountryCode ||
      (destinationOptions.includes(defaultAddress.countryCode) ? defaultAddress.countryCode : destinationOptions[0] || "");

    if (resolvedCountryCode && resolvedCountryCode !== destinationCountryCode) {
      setDestinationCountryCode(resolvedCountryCode);
    }

    setSelectedAddressId(defaultAddress.id);
    const values = buildAddressFromEntry(defaultAddress, resolvedCountryCode);
    form.reset(values);
    setRecipient(values);
    setTimeout(() => form.trigger(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressBookEntries, isLoadingAddresses, isLoadingLanes, destinationOptions.join("|")]);

  const handleBack = () => router.back();

  return {
    form,
    destinationCountryCode,
    destinationOptions,
    selectDestination,
    savedRecipientAddresses,
    isLoadingAddresses,
    selectedAddressId,
    applySavedAddress,
    handleContinue,
    handleBack,
  };
}
