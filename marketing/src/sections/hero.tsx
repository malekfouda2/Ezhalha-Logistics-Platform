import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useScroll, useTransform } from "framer-motion";
import { useLocale } from "@marketing/i18n";
import { EASE, SplitWords, useMotionEnabled } from "@marketing/components/motion";
import { QuoteWidget } from "@marketing/components/quote-widget";
import { TrackWidget } from "@marketing/components/track-widget";

/**
 * Route arcs radiating from a hub, drawn over the hero gradient.
 *
 * Canvas rather than SVG paths: this is decorative generative motion, and hand-authored path data
 * for a dozen animated arcs would be both larger and harder to change. Mounts client-side only —
 * it renders nothing during prerender, which keeps the server bundle free of canvas concerns and
 * means a crawler is never waiting on an animation.
 */
function HeroArcs() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0, height = 0, frame: number | null = null;
    let routes: Array<{ hx: number; hy: number; x: number; y: number; lift: number; t: number; sp: number }> = [];

    const build = () => {
      const hub = { x: width * 0.5, y: height * 0.44 };
      const count = width < 700 ? 7 : 13;
      routes = Array.from({ length: count }, (_, i) => {
        const angle = (Math.PI * 2 / count) * i + 0.35;
        const radius = Math.min(width, height) * (0.34 + Math.random() * 0.42);
        return {
          hx: hub.x, hy: hub.y,
          x: hub.x + Math.cos(angle) * radius * 1.5,
          y: hub.y + Math.sin(angle) * radius * 0.75,
          lift: 0.16 + Math.random() * 0.2,
          t: Math.random(),
          sp: 0.0016 + Math.random() * 0.0022,
        };
      });
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width; height = rect.height;
      canvas.width = width * dpr; canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const r of routes) {
        const mx = (r.hx + r.x) / 2;
        const my = (r.hy + r.y) / 2 - Math.abs(r.x - r.hx) * r.lift - 40;

        ctx.beginPath();
        ctx.moveTo(r.hx, r.hy);
        ctx.quadraticCurveTo(mx, my, r.x, r.y);
        ctx.strokeStyle = "rgba(255,255,255,0.09)";
        ctx.lineWidth = 1;
        ctx.stroke();

        r.t += r.sp;
        if (r.t > 1.25) r.t = -0.05;
        if (r.t >= 0 && r.t <= 1) {
          const u = 1 - r.t;
          const px = u * u * r.hx + 2 * u * r.t * mx + r.t * r.t * r.x;
          const py = u * u * r.hy + 2 * u * r.t * my + r.t * r.t * r.y;
          const glow = ctx.createRadialGradient(px, py, 0, px, py, 14);
          glow.addColorStop(0, "rgba(255,255,255,0.9)");
          glow.addColorStop(1, "rgba(255,255,255,0)");
          ctx.beginPath(); ctx.arc(px, py, 14, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill();
          ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
        }

        ctx.beginPath(); ctx.arc(r.x, r.y, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.fill();
      }
      if (routes.length) {
        ctx.beginPath(); ctx.arc(routes[0].hx, routes[0].hy, 4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fill();
      }
      frame = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    frame = requestAnimationFrame(draw);

    // Stop painting once the hero leaves the viewport — no work off-screen.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && frame === null) frame = requestAnimationFrame(draw);
      if (!entry.isIntersecting && frame !== null) { cancelAnimationFrame(frame); frame = null; }
    });
    observer.observe(canvas);

    return () => {
      window.removeEventListener("resize", resize);
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas id="heroCanvas" ref={ref} aria-hidden="true" />;
}

export function Hero() {
  const { t } = useLocale();
  const [tab, setTab] = useState<"quote" | "track">("quote");
  const enabled = useMotionEnabled();
  const heroRef = useRef<HTMLElement | null>(null);

  // The copy drifts up and dims as the hero leaves, so the gradient hands off to the next section
  // instead of simply scrolling away. Small numbers on purpose — parallax that announces itself
  // reads as a template.
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -70]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  return (
    <header className="hero" id="top" ref={heroRef}>
      <div className="hero-bg" />
      <HeroArcs />
      <div className="glow glow-a" /><div className="glow glow-b" /><div className="glow glow-c" />
      <div className="hero-grid" />

      <div className="wrap">
        <motion.div
          className="hero-copy"
          style={enabled ? { y: copyY, opacity: copyOpacity } : undefined}
        >
          <motion.span
            className="eyebrow"
            initial={enabled ? { opacity: 0, y: 14 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <span className="dot" />{t("hero.eyebrow")}
          </motion.span>

          <h1>
            <SplitWords text={t("hero.t1")} delay={0.12} />{" "}
            <SplitWords text={t("hero.t2")} delay={0.28} />
          </h1>

          <motion.p
            className="hero-sub"
            initial={enabled ? { opacity: 0, y: 18, filter: "blur(6px)" } : false}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.9, delay: 0.5, ease: EASE }}
          >
            {t("hero.sub")}
          </motion.p>
        </motion.div>

        <motion.div
          className="quote"
          initial={enabled ? { opacity: 0, y: 46, scale: 0.975 } : false}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, delay: 0.42, ease: EASE }}
        >
          <div className="qtabs" role="tablist">
            {(["quote", "track"] as const).map((key) => (
              <button
                key={key}
                className="qtab" type="button" role="tab"
                aria-selected={tab === key}
                aria-controls={`panel-${key}`}
                id={`tab-${key}`}
                onClick={() => setTab(key)}
              >
                {key === "quote" ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z" /><circle cx="12" cy="10" r="2.6" /></svg>
                )}
                <span>{t(key === "quote" ? "tab.price" : "tab.track")}</span>
                {/* One indicator shared by both tabs, so it slides between them rather than
                    fading out here and in over there. */}
                {tab === key && enabled && (
                  <motion.span className="qtab-indicator" layoutId="qtab-indicator" transition={{ duration: 0.4, ease: EASE }} />
                )}
                {tab === key && !enabled && <span className="qtab-indicator" />}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={enabled ? { opacity: 0, y: 10 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={enabled ? { opacity: 0, y: -8 } : undefined}
              transition={{ duration: 0.28, ease: EASE }}
            >
              {tab === "quote" ? (
                <div className="panel" id="panel-quote" role="tabpanel" aria-labelledby="tab-quote">
                  <div className="quote-head">
                    <h2>{t("q.title")}</h2>
                    <span className="hint">{t("q.hint")}</span>
                  </div>
                  <QuoteWidget />
                </div>
              ) : (
                <div className="panel" id="panel-track" role="tabpanel" aria-labelledby="tab-track">
                  <TrackWidget />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </header>
  );
}
