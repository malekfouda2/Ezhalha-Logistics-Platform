// Pricing profiles are admin-configurable (server/routes.ts pricing rules), so only the
// three built-in slugs get a distinct color — anything custom falls back to a neutral chip.
export function profileBadgeColors(profile: string): { background: string; text: string } {
  switch (profile) {
    case "vip":
      return { background: "#F0E6FF", text: "#7029B5" };
    case "mid_level":
      return { background: "#E0EEFF", text: "#1D4ED8" };
    case "regular":
      return { background: "#EEF0F3", text: "#5B6472" };
    default:
      return { background: "#EEF0F3", text: "#5B6472" };
  }
}

export function humanizeProfileSlug(profile: string): string {
  return profile
    .split(/[_-]/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}
