import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import InfoBox from "@/components/ui/InfoBox";
import { ScreenHeader } from "@/components/sections/profile/ScreenHeader";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

import { useLanguageStore, AppLanguage } from "@/store/useLanguageStore";

const OPTIONS: Array<{ value: AppLanguage; labelKey: "english" | "arabic"; nativeLabel: string }> = [
  { value: "en", labelKey: "english", nativeLabel: "English" },
  { value: "ar", labelKey: "arabic", nativeLabel: "العربية" },
];

export default function LanguageScreen() {
  const { t } = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const changeLanguage = useLanguageStore((state) => state.changeLanguage);

  const [selected, setSelected] = useState<AppLanguage>(language);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (selected === language) {
      return;
    }

    setIsSaving(true);
    try {
      await changeLanguage(selected);
      Toast.show({
        type: "success",
        text1: t("language.successTitle"),
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: t("language.errorTitle"),
        text2: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <ScreenHeader title={t("language.title")} subtitle={t("language.subtitle")} />

        <View style={styles.card}>
          {OPTIONS.map((option, index) => {
            const isSelected = selected === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setSelected(option.value)}
                style={[styles.row, index > 0 && styles.rowDivider]}
              >
                <View style={styles.textBlock}>
                  <Text size="medium" weight="bold">
                    {option.nativeLabel}
                  </Text>
                  <Text size="small" dimRate="60%">
                    {t(`language.${option.labelKey}`)}
                  </Text>
                </View>

                <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                  {isSelected ? <View style={styles.radioInner} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.footer}>
        <Button
          title={isSaving ? t("language.saving") : t("language.save")}
          onPress={handleSave}
          loading={isSaving}
          disabled={isSaving || selected === language}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: rs(16),
    paddingTop: rvs(8),
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    marginBottom: rvs(16),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(16),
    paddingVertical: rvs(16),
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  textBlock: {
    flex: 1,
  },
  radioOuter: {
    width: rs(22),
    height: rs(22),
    borderRadius: rs(11),
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: {
    borderColor: Colors.primary,
  },
  radioInner: {
    width: rs(11),
    height: rs(11),
    borderRadius: rs(6),
    backgroundColor: Colors.primary,
  },
  footer: {
    paddingHorizontal: rs(16),
    paddingBottom: rvs(20),
    paddingTop: rvs(8),
  },
});
