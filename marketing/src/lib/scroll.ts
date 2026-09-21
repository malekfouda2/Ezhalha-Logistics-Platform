/**
 * Eased in-page scrolling.
 *
 * Native `scroll-behavior: smooth` would be one CSS line, but its duration is fixed by the
 * browser and its curve is linear-ish — a jump to the bottom of a long page takes as long as a
 * nudge to the next section, and neither feels deliberate. This scales duration with distance and
 * uses the same expo-out curve as the reveals, so navigating feels like part of the same object.
 *
 * Also handles the sticky header offset, which native smooth scrolling cannot: without it every
 * section lands with its heading tucked under the bar.
 */

/** Clears the condensed bar (74px) with a little air. Matches `scroll-margin-top` in the CSS. */
const HEADER_OFFSET = 88;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function scrollToId(id: string): void {
  if (typeof document === "undefined") return;
  const target = document.getElementById(id.replace(/^#/, ""));
  if (!target) return;

  const start = window.scrollY;
  const end = Math.max(0, target.getBoundingClientRect().top + start - HEADER_OFFSET);
  const distance = end - start;

  if (prefersReducedMotion() || Math.abs(distance) < 2) {
    window.scrollTo(0, end);
    return;
  }

  // 520ms for a short hop, up to 1100ms across the page. A single fixed duration makes long
  // travel feel sluggish and short travel feel abrupt.
  const duration = Math.min(1100, Math.max(520, Math.abs(distance) * 0.55));
  let startTime: number | null = null;

  const step = (now: number) => {
    if (startTime === null) startTime = now;
    const progress = Math.min((now - startTime) / duration, 1);
    // Expo-out: leaves immediately, settles slowly. Matches EASE in components/motion.tsx.
    const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    window.scrollTo(0, start + distance * eased);
    if (progress < 1) requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}

/** Wire an anchor so it scrolls rather than jumps, without losing its href. */
export function anchorProps(id: string) {
  return {
    href: `#${id}`,
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      // Let modified clicks (new tab, download) behave normally.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      scrollToId(id);
      // Keep the URL meaningful without the browser also jumping.
      if (window.history.replaceState) window.history.replaceState(null, "", `#${id}`);
    },
  };
}
