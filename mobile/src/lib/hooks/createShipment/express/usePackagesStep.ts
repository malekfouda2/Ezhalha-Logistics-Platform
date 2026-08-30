import { useRouter } from "expo-router";
import { Alert } from "react-native";
import { useCreateShipmentStore, isInternationalShipment } from "@/store/createShipmentStore";
import { useState } from "react";
import { getChargeableWeightSummary } from "@/utils/chargeableWeight";
import { fetchRates } from "@/lib/services/createShipment";
import { validatePackages } from "@/utils/shipmentValidation";

export function usePackagesStep() {
  const router = useRouter();
  const store = useCreateShipmentStore();
  const [isLoadingRates, setIsLoadingRates] = useState(false);

  const chargeableWeightSummary = getChargeableWeightSummary(
    store.packages,
    store.weightUnit,
    store.dimensionUnit,
    "", // no carrier selected yet at this step — generic estimate
  );

  const handleContinue = async () => {
    const result = validatePackages(store.packageType, store.packages);
    if (!result.ok) {
      Alert.alert(result.title || "Error", result.description);
      return;
    }

    if (isLoadingRates) return;

    // Reuse existing quotes if inputs haven't changed (mirrors web's back/forward guard)
    const signature = store.ratesSignature();
    if (store.rates && signature === store.lastRatesSignature) {
      router.push("/createShipment/express/step-5");
      return;
    }

    setIsLoadingRates(true);
    try {
      const data = await fetchRates({
        shipmentType: store.shipmentType,
        isDdp: store.isDdp,
        shipper: store.shipper,
        recipient: store.recipient,
        packages: store.packages,
        weightUnit: store.weightUnit,
        dimensionUnit: store.dimensionUnit,
        packageType: store.packageType,
        currency: store.currency,
      });
      store.setSelectedQuoteId(null);
      store.setRates(data);
      store.setCheckoutData(null);
      store.setConfirmData(null);
      store.setLastRatesSignature(signature);
      router.push("/createShipment/express/step-5");
    } catch (error) {
      Alert.alert(
        "We couldn't get rates for this shipment",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setIsLoadingRates(false);
    }
  };

  const handleBack = () => router.back();

  return {
    packages: store.packages,
    weightUnit: store.weightUnit,
    dimensionUnit: store.dimensionUnit,
    packageType: store.packageType,
    updatePackage: store.updatePackage,
    addPackage: store.addPackage,
    removePackage: store.removePackage,
    setWeightUnit: store.setWeightUnit,
    setDimensionUnit: store.setDimensionUnit,
    setPackageType: store.setPackageType,
    chargeableWeightSummary,
    isInternational: isInternationalShipment(store.shipmentType),
    isLoadingRates,
    handleContinue,
    handleBack,
  };
}