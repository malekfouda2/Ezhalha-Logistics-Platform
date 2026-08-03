import { useEffect, useRef, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useLocation } from "wouter";

/**
 * Slim top-of-page progress bar (NProgress-style) that reflects in-flight data
 * fetches / mutations and route changes. Gives every click + redirect a smooth,
 * visible loading cue without wiring per-page state.
 */
export function RouteProgress() {
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();
  const [location] = useLocation();

  const active = isFetching + isMutating > 0;
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  // Brief pulse on every navigation, even if the page has no queries.
  useEffect(() => {
    setVisible(true);
    setProgress(12);
    const a = window.setTimeout(() => setProgress(65), 90);
    const b = window.setTimeout(() => {
      setProgress(100);
      const c = window.setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 220);
      timers.current.push(c);
    }, 320);
    timers.current.push(a, b);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  // Follow real fetch/mutation activity.
  useEffect(() => {
    if (active) {
      clearTimers();
      setVisible(true);
      setProgress((p) => (p < 20 ? 20 : p));
      const creep = window.setInterval(() => {
        setProgress((p) => (p < 88 ? p + Math.max(0.5, (90 - p) * 0.08) : p));
      }, 200);
      return () => window.clearInterval(creep);
    }
    // Finished: complete + fade out.
    if (visible) {
      setProgress(100);
      const done = window.setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 240);
      timers.current.push(done);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 250ms ease" }}
      aria-hidden
    >
      <div
        className="h-full bg-gradient-to-r from-primary via-[hsl(25_95%_55%)] to-primary shadow-[0_0_10px_hsl(var(--primary)/0.6)]"
        style={{
          width: `${progress}%`,
          transition: "width 220ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
    </div>
  );
}
