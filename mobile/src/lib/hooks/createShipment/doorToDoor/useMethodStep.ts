import { useRouter } from "expo-router";
import { useDoorToDoorStore } from "@/store/createDoorToDoorStore";

export function useMethodStep() {
  const router = useRouter();

  const transportMethod = useDoorToDoorStore((s) => s.transportMethod);
  const setTransportMethod = useDoorToDoorStore((s) => s.setTransportMethod);
  const reset = useDoorToDoorStore((s) => s.reset);

  const handleContinue = () => router.push("/createShipment/doorToDoor/step-2");

  const handleBack = () => {
    reset();
    router.back();
  };

  return { transportMethod, setTransportMethod, handleContinue, handleBack };
}
