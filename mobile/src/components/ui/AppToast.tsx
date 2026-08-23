import React from "react";
import { View, StyleSheet } from "react-native";
import { BaseToast, ErrorToast } from "react-native-toast-message";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

const toastStyles = StyleSheet.create({
  container: {
    width: "92%",
    minHeight: rvs(70),
    borderRadius: rs(14),
    paddingVertical: rvs(14),
    paddingHorizontal: rs(14),
    alignSelf: "center",
    backgroundColor: Colors.background,
  },

  contentContainer: {
    paddingHorizontal: rs(4),
    paddingVertical: 0,
  },

  text1: {
    fontSize: rs(15),
    fontWeight: "700",
    color: Colors.text,
  },

  text2: {
    fontSize: rs(13),
    lineHeight: rvs(20),
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
      text2NumberOfLines={5}
    />
  ),
};
export default toastConfig;