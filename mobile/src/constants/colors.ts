export const Colors = {
  text: "#1A1A2E",
  textSecondary: "#8A93A3",
  background: "#F2F3F5",
  primary: "#fe5200",
  primaryDark: "#e34700",
  secondary: "#6B7280",
  border: "#E5E7EB",
  inputBackground: "#FFFFFF",
  white: "#FFFFFF",
  black: "#000000",
  placeholder: "#9AA3B2",
};

export const setOpacity = (hex: string, alpha: number) =>
    `${hex}${Math.floor(alpha * 255)
        .toString(16)
        .padStart(2, "0")}`;

