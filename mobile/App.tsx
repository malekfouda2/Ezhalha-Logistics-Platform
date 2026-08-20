import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import RootNavigator from "@/navigation/RootNavigator";
import Toast from "react-native-toast-message";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RootNavigator />
      <Toast />
    </QueryClientProvider>
  );
}
