// components/AppLayout.tsx
import { Colors } from "@/constants/colors";
import { ReactNode } from "react"; // <-- Import ReactNode
import { View, StyleSheet, StatusBar } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// 1. Define the props type
interface AppLayoutProps {
  children: ReactNode;
}

// 2. Apply the type to the component props
export default function AppLayout({ children }: AppLayoutProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <StatusBar
        barStyle="dark-content"
        backgroundColor={Colors.background}
        translucent
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
