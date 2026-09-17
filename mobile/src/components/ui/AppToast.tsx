import React from "react";
import { View, StyleSheet } from "react-native";
import { BaseToast, ErrorToast } from "react-native-toast-message";
import { Colors } from "@/constants/colors";
import { Typography } from "@/constants/typography";
import { rs, rvs } from "@/utils/responsive";

const toastStyles = StyleSheet.create({
  container: {
    width: "92%",
    // react-native-toast-message's BaseToast hardcodes `height: 60` in its base style; without
    // an explicit override here that wins the merge, longer text2 messages get clipped to that
    // height regardless of minHeight or numberOfLines.
    height: "auto",
    minHeight: rvs(60),
    borderRadius: rs(14),
    paddingVertical: rvs(12),
    paddingHorizontal: rs(14),
    alignSelf: "center",
    backgroundColor: Colors.background,
  },

  contentContainer: {
    paddingHorizontal: rs(4),
    paddingVertical: 0,
  },

  text1: {
    fontSize: Typography.size.small,
    lineHeight: Typography.lineHeight.small,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.text,
  },

  text2: {
    fontSize: Typography.size.xs,
    lineHeight: Typography.lineHeight.xs,
    color: Colors.textSecondary,
    marginTop: rvs(4),
  },
});

const toastConfig = {
  success: (props: any) => (
    <BaseToast
      {...props}
      style={[
        toastStyles.container,
        {
          borderLeftColor: Colors.primary,
          borderLeftWidth: 4,
        },
      ]}
      contentContainerStyle={toastStyles.contentContainer}
      text1Style={toastStyles.text1}
      text2Style={toastStyles.text2}
      text1NumberOfLines={2}
      text2NumberOfLines={5}
    />
  ),

  error: (props: any) => (
    <ErrorToast
      {...props}
      style={[
        toastStyles.container,
        {
          borderLeftColor: Colors.error,
          borderLeftWidth: 4,
        },
      ]}
      contentContainerStyle={toastStyles.contentContainer}
      text1Style={toastStyles.text1}
      text2Style={toastStyles.text2}
      text1NumberOfLines={2}
      // Error messages (e.g. a raw server/API error surfaced verbatim) run longer than the
      // success copy we write ourselves — give them room instead of cutting them off.
      text2NumberOfLines={0}
    />
  ),
};
export default toastConfig;