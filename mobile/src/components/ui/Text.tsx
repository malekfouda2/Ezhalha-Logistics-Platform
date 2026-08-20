import { forwardRef } from "react";
import {
  Text as DefaultText,
  TextProps as RNTextProps,
  I18nManager,
} from "react-native";

import {
  Typography,
  FontWeight,
  TextSize,
} from "@/constants/typography";
import { Colors, setOpacity } from "@/constants/colors";

export interface TextProps extends RNTextProps {
  size?: TextSize | number;
  weight?: FontWeight;
  dimRate?: `${number}%`;
  textTransform?:
    | "none"
    | "capitalize"
    | "uppercase"
    | "lowercase";
}

export const Text = forwardRef<DefaultText, TextProps>(
  (props, ref) => {
    const {
      size = "small",
      children,
      weight = "regular",
      textTransform = "none",
      dimRate,
      style,
      ...otherProps
    } = props;

    const isCustomSize = typeof size === "number";

    const fontSize = isCustomSize
      ? size
      : Typography.size[size];

    const lineHeight = isCustomSize
      ? size * 1.5
      : Typography.lineHeight[size];

    const color = dimRate
      ? setOpacity(
          Colors.text,
          parseFloat(dimRate.replace("%", "")) / 100
        )
      : Colors.text;

    return (
      <DefaultText
        ref={ref}
        {...otherProps}
        style={[
          {
            fontSize,
            lineHeight,
            fontFamily: Typography.fontFamily[weight],
            color,
            textTransform,

            // Important
            writingDirection: I18nManager.isRTL ? "rtl" : "ltr",

            flexShrink: 1,
          },
          style,
        ]}
      >
        {children}
      </DefaultText>
    );
  }
);

Text.displayName = "Text";