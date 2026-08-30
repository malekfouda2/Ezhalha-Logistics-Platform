import { useRouter } from "expo-router";
import { useCreateShipmentStore } from "@/store/createShipmentStore";

export function useConfirmationStep() {
  const router = useRouter();
  const confirmData = useCreateShipmentStore((s) => s.confirmData);
  const reset = useCreateShipmentStore((s) => s.reset);

  const handleDone = () => {
    reset();
    router.replace("/client/shipments" as any);
  };

  return { confirmData, handleDone };
}