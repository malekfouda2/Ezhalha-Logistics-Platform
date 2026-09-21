import { motion, useMotionValueEvent, useScroll, useSpring } from "framer-motion";
import { useState } from "react";
import { useLocale } from "@marketing/i18n";
import { APP_ORIGIN } from "@marketing/api";
import { anchorProps, scrollToId } from "@marketing/lib/scroll";
import { useMotionEnabled } from "./motion";

const LINKS = [
  { id: "network", key: "nav.network" },
  { id: "flows", key: "nav.flows" },
  { id: "weight", key: "nav.weight" },
  { id: "business", key: "nav.business" },
];

/**
 * The header. Fixed, and it stays put.
 *
 * Two states, not three: transparent over the hero, and a condensed blurred bar once it is over
 * content. An earlier version also slid the bar out of view on downward scroll and brought it
 * back on upward scroll — that reads as lag, because the bar is always reacting to a gesture the
 * reader has already made. A header that never moves is the faster-feeling one.
 *
 * The only scroll-driven work left is a class toggle and a transform on the progress bar, neither
 * of which costs a layout pass.
 */
export function SiteHeader() {
  const { t, alternate } = useLocale();
  const enabled = useMotionEnabled();
  const { scrollY, scrollYProgress } = useScroll();
  const [condensed, setCondensed] = useState(false);

  // Lightly sprung so the bar glides rather than tracking every wheel tick — stiff enough that it
  // never visibly trails the scroll position.
  const progress = useSpring(scrollYProgress, { stiffness: 320, damping: 44, restDelta: 0.001 });

  // React bails out on an unchanged value, so this is one re-render per crossing of the
  // threshold, not one per scroll event.
  useMotionValueEvent(scrollY, "change", (y) => setCondensed(y > 40));

  return (
    <>
      <header className={`site-header${condensed ? " is-condensed" : ""}`}>
        <div className="wrap">
          <a
            className="brandmark"
            href="#top"
            aria-label="ezhalha"
            onClick={(e) => { e.preventDefault(); scrollToId("top"); }}
          >
            <img src="/brand/logo.png" alt="ezhalha" width={62} height={55} />
          </a>

          <nav className="navlinks" aria-label={t("nav.network")}>
            {LINKS.map((link) => (
              <a key={link.id} {...anchorProps(link.id)}>{t(link.key)}</a>
            ))}
          </nav>

          <div className="navcta">
            {/* A real link to the other language's URL rather than a runtime toggle, so it is
                crawlable and correct before any JavaScript runs. */}
            <a className="btn btn-glass btn-sm" href={alternate.href} lang={alternate.locale} hrefLang={alternate.locale}>
              {alternate.label}
            </a>
            <a className="btn btn-glass btn-sm" href={`${APP_ORIGIN}/`}>{t("nav.signin")}</a>
          </div>
        </div>

        <motion.div className="scroll-progress" style={{ scaleX: enabled ? progress : 0 }} aria-hidden="true" />
      </header>
    </>
  );
}
