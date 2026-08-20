// utils/responsive.ts
import { Dimensions, PixelRatio } from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } =
  Dimensions.get("window");

const BASE_WIDTH = 375;
const BASE_HEIGHT = 812;

const widthScale = SCREEN_WIDTH / BASE_WIDTH;
const heightScale = SCREEN_HEIGHT / BASE_HEIGHT;

const moderateScale = (size: number, factor = 0.5) =>
  size + (widthScale * size - size) * factor;

const moderateVerticalScale = (size: number, factor = 0.5) =>
  size + (heightScale * size - size) * factor;

export const responsiveFontSize = (
  fontSize: number,
  factor = 0.5
) => {
  const newSize = moderateScale(fontSize, factor);
  return Math.round(PixelRatio.roundToNearestPixel(newSize));
};

// Horizontal spacing / sizing (paddings, margins, widths, radii)
export const rs = (size: number, factor = 0.5) => {
  const newSize = moderateScale(size, factor);
  return Math.round(PixelRatio.roundToNearestPixel(newSize));
};

// Vertical spacing / sizing (heights, vertical margins/paddings)
export const rvs = (size: number, factor = 0.5) => {
  const newSize = moderateVerticalScale(size, factor);
  return Math.round(PixelRatio.roundToNearestPixel(newSize));
};

export const screenWidth = SCREEN_WIDTH;
export const screenHeight = SCREEN_HEIGHT;