import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";

import { useDoorToDoorStore, DdpLane } from "@/store/createDoorToDoorStore";

export function useOriginStep() {
  const router = useRouter();
  const { t } = useTranslation();

  const transportMethod = useDoorToDoorStore((s) => s.transportMethod);
  const originCountryCode = useDoorToDoorStore((s) => s.originCountryCode);
  const setOriginCountryCode = useDoorToDoorStore((s) => s.setOriginCountryCode);
  const setDestinationCountryCode = useDoorToDoorStore((s) => s.setDestinationCountryCode);

  const { data: lanes = [], isLoading } = useQuery<DdpLane[]>({
    queryKey: ["/api/client/ddp/lanes"],
  });

  const isLaneAvailable = (lane: DdpLane) =>
    transportMethod === "air" ? lane.airAvailable : transportMethod === "sea" ? lane.seaAvailable : lane.domesticAvailable;

  const availableLanes = lanes.filter(isLaneAvailable);
  const originOptions = Array.from(new Set(availableLanes.map((lane) => lane.originCountryCode)));
  const selectedLane = availableLanes.find((lane) => lane.originCountryCode === originCountryCode) ?? null;

  const selectOrigin = (code: string) => {
    setOriginCountryCode(code);
    const lane = availableLanes.find((l) => l.originCountryCode === code);
    setDestinationCountryCode(lane?.destinationCountryCode || "SA");
  };

  const handleContinue = () => {
    if (!originCountryCode) {
      Toast.show({
        type: "error",
        text1: t("toast.error.title"),
        text2: t("createShipment.freight.steps.step2.selectOrigin"),
      });
      return;
    }
    router.push("/createShipment/doorToDoor/step-3");
  };

  const handleBack = () => router.back();

  return {
    transportMethod,
    originCountryCode,
    originOptions,
    selectedLane,
    isLoading,
    selectOrigin,
    handleContinue,
    handleBack,
  };
}
