import { useRouter } from "expo-router";
import { useDoorToDoorStore } from "@/store/createDoorToDoorStore";

export function useRateStep() {
  const router = useRouter();

  const quote = useDoorToDoorStore((s) => s.quote);
  const transportMethod = useDoorToDoorStore((s) => s.transportMethod);
  const originCountryCode = useDoorToDoorStore((s) => s.originCountryCode);
  const destinationCountryCode = useDoorToDoorStore((s) => s.destinationCountryCode);

  const handleContinue = () => router.push("/createShipment/doorToDoor/step-7");
  const handleBack = () => router.back();

  return { quote, transportMethod, originCountryCode, destinationCountryCode, handleContinue, handleBack };
}
