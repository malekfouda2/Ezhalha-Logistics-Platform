export type PasswordStrength = "weak" | "medium" | "strong";

export const getPasswordStrength = (password: string): PasswordStrength => {
  if (!password) return "weak";

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return "weak";
  if (score <= 3) return "medium";
  return "strong";
};

export const strengthToFilledBars = (strength: PasswordStrength): number => {
  switch (strength) {
    case "weak":
      return 1;
    case "medium":
      return 2;
    case "strong":
      return 3;
    default:
      return 0;
  }
};