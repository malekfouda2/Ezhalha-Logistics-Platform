import { useState } from "react";
import { useRouter } from "expo-router";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { useCreateShipmentStore } from "@/store/createShipmentStore";
import { validateAddress } from "@/utils/shipmentValidation";
import { AddressBookEntry } from "@/lib/services/createShipment";

export function useSenderStep() {
  const router = useRouter();
  const { t } = useTranslation();

  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null,
  );

  const shipper = useCreateShipmentStore((s) => s.shipper);
  const shipmentType = useCreateShipmentStore((s) => s.shipmentType);

  const updateShipper = useCreateShipmentStore(
    (s) => s.updateShipper,
  );

  const setShipper = useCreateShipmentStore(
    (s) => s.setShipper,
  );

  const {
    data: addressBookEntries = [],
    isLoading: isLoadingAddresses,
    isError: isAddressBookError,
  } = useQuery<AddressBookEntry[]>({
    queryKey: ["/api/client/address-book"],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const savedSenderAddresses = addressBookEntries.filter(
    (entry) => entry.useForShipper,
  );

  const handleContinue = () => {
    const result = validateAddress(
      shipper,
      shipmentType,
      "sender",
    );

    if (!result.ok) {
      const role = result.values?.role;

      Toast.show({
        type: "error",
        text1: result.title
          ? t(result.title, {
              ...result.values,
              role: role
                ? t(`toast.shipmentValidation.roles.${role}`)
                : undefined,
            })
          : t("toast.error.title"),

        text2: result.description
          ? t(result.description, result.values)
          : undefined,
      });

      return;
    }

    router.push("/createShipment/express/step-3");
  };

  const handleBack = () => {
    router.back();
  };

  const applySavedAddress = (entry: AddressBookEntry) => {
    // Mark this address as selected
    setSelectedAddressId(entry.id);

    setShipper({
      name: entry.name,
      phone: entry.phone,
      email: entry.email || "",
      countryCode:
        shipmentType === "domestic"
          ? "SA"
          : entry.countryCode,
      city: entry.city,
      postalCode: entry.postalCode || "",
      addressLine1: entry.addressLine1,
      addressLine2: entry.addressLine2 || "",
      stateOrProvince: entry.stateOrProvince || "",
      shortAddress: entry.shortAddress || "",
    });
  };

  return {
    shipper,
    shipmentType,
    updateShipper,

    savedSenderAddresses,
    isLoadingAddresses,
    isAddressBookError,

    selectedAddressId,
    applySavedAddress,

    handleContinue,
    handleBack,
  };
}