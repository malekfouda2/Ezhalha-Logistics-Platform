import React from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { rs, rvs } from "@/utils/responsive";

type FeatherIconName = React.ComponentProps<typeof Feather>["name"];

interface InfoBoxProps {
  text: string;
  backgroundColor?: string;
  borderWidth?: number;
  borderColor?: string;
  textColor?: string;
  iconColor?: string;
  iconName?: FeatherIconName;
}

const InfoBox = ({
  text,
  backgroundColor = "#FFF7F0",
  borderWidth = 1.5,
  borderColor = "#F0D4BF",
  textColor = "#B65B27",
  iconColor = "#B65B27",
  iconName = "info",
}: InfoBoxProps) => {
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor,
          borderWidth,
          borderColor,
        },
      ]}
    >
      <Feather
        name={iconName}
        size={rs(20)}
        color={iconColor}
      />

      <Text
        size="small"
        weight="semibold"
        style={[
          styles.text,
          {
            color: textColor,
          },
        ]}
      >
        {text}
      </Text>
    </View>
  );
};

export default InfoBox;

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: rs(10),
    paddingHorizontal: rs(15),
    paddingVertical: rvs(15),
    borderRadius: rs(22),
  },

  text: {
    flex: 1,
  },
});