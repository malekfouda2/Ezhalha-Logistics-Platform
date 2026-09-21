import { motion, useInView, useReducedMotion, type Variants } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The motion vocabulary for the whole site.
 *
 * One file so the page moves in one voice: the same easing curve, the same distance, the same
 * stagger rhythm everywhere. Landing pages go wrong when each section invents its own timing and
 * the result reads as busy rather than considered.
 *
 * `EASE` is an expo-out curve — fast departure, long settle. It is what makes a reveal read as
 * "arriving" rather than "sliding".
 */
export const EASE = [0.16, 1, 0.3, 1] as const;
const DISTANCE = 26;

/**
 * Every animated element starts hidden, which means a bug in the reveal layer hides content
 * rather than merely failing to decorate it. Reduced motion therefore does not "shorten" these
 * animations — it removes them, so the initial state is never applied at all.
 */
export function useMotionEnabled() {
  return !useReducedMotion();
}

const riseVariants = (distance: number): Variants => ({
  hidden: { opacity: 0, y: distance, filter: "blur(6px)" },
  shown: { opacity: 1, y: 0, filter: "blur(0px)" },
});

type RevealProps = {
  children: ReactNode;
  delay?: number;
  distance?: number;
  className?: string;
  id?: string;
  as?: "div" | "section" | "span" | "p" | "li";
};

/** A single element that rises into place when it enters the viewport. */
export function Reveal({ children, delay = 0, distance = DISTANCE, className, id, as = "div" }: RevealProps) {
  const enabled = useMotionEnabled();
  const Component = motion[as] as typeof motion.div;

  if (!enabled) {
    const Plain = as as "div";
    return <Plain className={className} id={id}>{children}</Plain>;
  }

  return (
    <Component
      className={className}
      id={id}
      variants={riseVariants(distance)}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "0px 0px -80px 0px" }}
      transition={{ duration: 0.8, delay, ease: EASE }}
    >
      {children}
    </Component>
  );
}

/**
 * A container whose children arrive one after another.
 *
 * Children must be `<Rise>`; the stagger is driven by the parent's variants so the delay is
 * computed from position rather than hard-coded per child, which is what keeps a list in rhythm
 * when an item is added or removed.
 */
export function Stagger({
  children,
  className,
  id,
  gap = 0.08,
  delay = 0,
  as = "div",
}: RevealProps & { gap?: number }) {
  const enabled = useMotionEnabled();
  const Component = motion[as] as typeof motion.div;

  if (!enabled) {
    const Plain = as as "div";
    return <Plain className={className} id={id}>{children}</Plain>;
  }

  return (
    <Component
      className={className}
      id={id}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "0px 0px -80px 0px" }}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: gap, delayChildren: delay } } }}
    >
      {children}
    </Component>
  );
}

/** One child of a <Stagger>. */
export function Rise({
  children,
  className,
  distance = DISTANCE,
  as = "div",
}: Omit<RevealProps, "delay" | "id">) {
  const enabled = useMotionEnabled();
  const Component = motion[as] as typeof motion.div;

  if (!enabled) {
    const Plain = as as "div";
    return <Plain className={className}>{children}</Plain>;
  }

  return (
    <Component
      className={className}
      variants={riseVariants(distance)}
      transition={{ duration: 0.75, ease: EASE }}
    >
      {children}
    </Component>
  );
}

/**
 * A headline that arrives a word at a time.
 *
 * Reserved for the hero. Used more than once it stops being an entrance and becomes a tic.
 */
export function SplitWords({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const enabled = useMotionEnabled();
  if (!enabled) return <span className={className}>{text}</span>;

  return (
    <span className={className} style={{ display: "inline-block" }}>
      {text.split(" ").map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          style={{ display: "inline-block", willChange: "transform, opacity" }}
          initial={{ opacity: 0, y: "0.5em", filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.9, delay: delay + i * 0.07, ease: EASE }}
        >
          {word}
          {i < text.split(" ").length - 1 ? " " : ""}
        </motion.span>
      ))}
    </span>
  );
}

/** Counts to a number once it is on screen. Used for the stats and for prices. */
export function CountUp({
  to,
  className,
  decimals = 0,
  duration = 1200,
}: {
  to: number;
  className?: string;
  decimals?: number;
  duration?: number;
}) {
  const enabled = useMotionEnabled();
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -40px 0px" });
  const [value, setValue] = useState(enabled ? 0 : to);

  useEffect(() => {
    // Zero is a real figure here ("carrier accounts you open") and animating to it is just a
    // stationary zero, so land on it rather than running an empty animation.
    if (!inView || !enabled || to === 0) {
      setValue(to);
      return;
    }
    let frame = 0;
    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now;
      const progress = Math.min((now - start) / duration, 1);
      setValue(to * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [inView, enabled, to, duration]);

  return (
    <span ref={ref} className={className}>
      {value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
}
