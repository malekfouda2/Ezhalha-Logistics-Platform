// navigation/RootNavigator.jsx
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AuthNavigator from "./AuthNavigator";
import MainNavigator from "./MainNavigator";
import { useEffect } from "react";
import { useLanguageStore } from "@/store/useLanguageStore";
import {
  SafeAreaProvider,
} from "react-native-safe-area-context";
import { StyleSheet } from "react-native";
import AppLayout from "@/components/layout/AppLayout";

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const isLoggedIn = false; // Replace with your authentication logic
  const init = useLanguageStore((state) => state.init);
  const isReady = useLanguageStore((state) => state.isReady);

  useEffect(() => {
    init();
  }, []);

  if (!isReady) {
    return null;
  }
  return (
    <SafeAreaProvider>
     <AppLayout>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {isLoggedIn ? (
              <Stack.Screen name="Main" component={MainNavigator} />
            ) : (
              <Stack.Screen name="Auth" component={AuthNavigator} />
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </AppLayout>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#ffffff", // Ensures consistency during screen transitions
  },
});
