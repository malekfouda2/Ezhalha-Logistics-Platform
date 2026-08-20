import { responsiveFontSize } from "@/utils/responsive";

export const Typography = {
  fontFamily: {
    regular: "Inter-Regular",
    medium: "Inter-Medium",
    semibold: "Inter-SemiBold",
    bold: "Inter-Bold",
  },

  size: {
    xs: responsiveFontSize(12),
    small: responsiveFontSize(14),
    medium: responsiveFontSize(16),
    large: responsiveFontSize(18),
    xl: responsiveFontSize(20),
    xxl: responsiveFontSize(24),
    title: responsiveFontSize(28),
  },

  lineHeight: {
    xs: responsiveFontSize(18),
    small: responsiveFontSize(20),
    medium: responsiveFontSize(24),
    large: responsiveFontSize(27),
    xl: responsiveFontSize(30),
    xxl: responsiveFontSize(32),
    title: responsiveFontSize(36),
  },
};

export type TextSize = keyof typeof Typography.size;

export type FontWeight =
  keyof typeof Typography.fontFamily;