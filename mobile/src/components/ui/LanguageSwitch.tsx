// components/ui/LanguageSwitch.tsx
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useLanguageStore } from "@/store/useLanguageStore";

export const LanguageSwitch = () => {
  const language = useLanguageStore((state) => state.language);
  const changeLanguage = useLanguageStore((state) => state.changeLanguage);

  const toggleLanguage = () => {
    const nextLang = language === "en" ? "ar" : "en";
    changeLanguage(nextLang);
  };

  return (
    <Pressable style={styles.container} onPress={toggleLanguage} hitSlop={10}>
      <Ionicons name="language" size={rs(18)} color={Colors.primary} />
      <Text size="small" weight="semibold" style={styles.text}>
        {language === "en" ? "العربية" : "English"}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    paddingHorizontal: rs(14),
    paddingVertical: rvs(8),
    borderRadius: rs(20),
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.inputBackground,
  },
  text: {
    color: Colors.primary,
  },
});