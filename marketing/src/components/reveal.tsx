import { motion, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Reveal-on-scroll.
 *
 * `framer-motion` has been a dependency since before this site existed and was imported nowhere;
 * this is its first use. It matters more than convenience here: the prototype hand-rolled this
 * with a scroll listener, and the version before that used an IntersectionObserver that silently
 * stopped delivering entries partway down the page and left whole sections stuck at opacity 0.
 * A reveal system whose failure mode is invisible content has to be something maintained.
 *
 * `once` so a section never re-animates on scroll-back, and the viewport margin fires it slightly
 * before the element arrives so it is already settled by the time it is read.
 */
export function Reveal({
  children,
  delay = 0,
  as = "div",
  className,
  id,
}: {
  children: ReactNode;
  delay?: number;
  as?: "div" | "section";
  className?: string;
  id?: string;
}) {
  const reduced = useReducedMotion();
  const Component = as === "section" ? motion.section : motion.div;

  // With reduced motion the element must still end up visible — the global CSS in the portal
  // zeroes animation *durations* but never resets an opacity:0 start state, and that mistake is
  // exactly how a page ships blank for the people most likely to be harmed by it.
  if (reduced) {
    return (
      <Component className={className} id={id}>
        {children}
      </Component>
    );
  }

  return (
    <Component
      className={className}
      id={id}
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -60px 0px" }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </Component>
  );
}

/** Counts up to a number when it scrolls into view. */
export function CountUp({ to, className }: { to: number; className?: string }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -40px 0px" });
  const [value, setValue] = useState(0);

  useEffect(() => {
    // Zero is a real number here ("carrier accounts you open"), and animating to it is just a
    // stationary zero — so land on it immediately rather than running an empty animation.
    if (!inView || reduced || to === 0) {
      setValue(to);
      return;
    }
    let frame = 0;
    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now;
      const progress = Math.min((now - start) / 1300, 1);
      setValue(Math.round(to * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [inView, reduced, to]);

  return <span ref={ref} className={className}>{value}</span>;
}
