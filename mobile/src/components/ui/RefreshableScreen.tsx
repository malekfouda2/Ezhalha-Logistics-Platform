// components/RefreshableScreen.tsx
import { ScrollView, RefreshControl, StyleProp, ViewStyle } from "react-native";
import { Colors } from "@/constants/colors";
import { useGlobalRefresh } from "@/lib/hooks/useRefreshOnFocus";

export function RefreshableScreen({
  children,
  contentContainerStyle,
}: {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const { refreshing, onRefresh } = useGlobalRefresh();

  return (
    <ScrollView
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={Colors.primary}
          colors={[Colors.primary]}
        />
      }
    >
      {children}
    </ScrollView>
  );
}
