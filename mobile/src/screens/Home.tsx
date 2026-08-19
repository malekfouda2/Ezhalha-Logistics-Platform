import { useTranslation } from "react-i18next";
import {
  I18nManager,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import RNRestart from "react-native-restart";

export default function Home() {
  const { t, i18n } = useTranslation();

  const isArabic = i18n.language === "ar";

  const changeLanguage = async () => {
    const language = isArabic ? "en" : "ar";
    const isRTL = language === "ar";

    await i18n.changeLanguage(language);

    I18nManager.allowRTL(isRTL);
    I18nManager.forceRTL(isRTL);

    RNRestart.restart();
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={changeLanguage}>
        <Text>{isArabic ? "English" : "العربية"}</Text>
      </TouchableOpacity>

      <Text>{t("home.title")}</Text>

      <View
        style={{
          flexDirection: "row",
          gap: 20,
          marginTop: 30,
        }}
      >
        <View style={styles.box}>
          <Text>1</Text>
        </View>

        <View style={styles.box}>
          <Text>2</Text>
        </View>

        <View style={styles.box}>
          <Text>3</Text>
        </View>
      </View>
      <Text>Current RTL: {I18nManager.isRTL ? "Yes" : "No"}</Text>
      <Text>Current language: {i18n.language}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginStart: 20,
    justifyContent: "center",
  },

  box: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
});
