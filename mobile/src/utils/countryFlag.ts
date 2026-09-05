// Converts a 2-letter ISO country code into its flag emoji using the regional
// indicator symbol trick (each letter A-Z maps to U+1F1E6..U+1F1FF).
export function countryFlagEmoji(code?: string): string {
  const normalized = (code || "").trim().toUpperCase();
  if (normalized.length !== 2 || !/^[A-Z]{2}$/.test(normalized)) {
    return "🏳️";
  }

  const codePoints = [...normalized].map(
    (char) => 0x1f1e6 + (char.charCodeAt(0) - 65),
  );
  return String.fromCodePoint(...codePoints);
}
