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
 * The header, fixed for the life of the page.
 *
 * Three states rather than two, because a bar that is always solid wastes the hero and a bar that
 * is always transparent becomes unreadable over the light sections:
 *
 *   over the hero   — transparent, no border
 *   scrolled        — condensed, blurred, bordered
 *   scrolling down  — out of the way entirely
 *
 * Hiding on downward scroll and returning on upward scroll is the part that makes a long page
 * feel unobstructed: reading is downward, and wanting the nav is almost always an upward motion.
 */
export function SiteHeader() {
  const { t, alternate } = useLocale();
  const enabled = useMotionEnabled();
  const { scrollY, scrollYProgress } = useScroll();
  const [condensed, setCondensed] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Spring the progress bar so it glides rather than tracking every wheel tick.
  const progress = useSpring(scrollYProgress, { stiffness: 180, damping: 30, restDelta: 0.001 });

  useMotionValueEvent(scrollY, "change", (y) => {
    const previous = scrollY.getPrevious() ?? 0;
    setCondensed(y > 40);
    // Never hide near the top, and ignore sub-pixel jitter that would otherwise flicker the bar.
    setHidden(y > 380 && y > previous && y - previous > 4);
  });

  return (
    <>
      <motion.header
        className={`site-header${condensed ? " is-condensed" : ""}`}
        initial={false}
        animate={{ y: enabled && hidden ? "-110%" : "0%" }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
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
      </motion.header>
    </>
  );
}
