import { readFile, writeFile, mkdir, rm } from "fs/promises";
import path from "path";
import { build as viteBuild } from "vite";
import { LOCALES, DIRECTION, getCatalogue, type Locale } from "../shared/i18n";

/**
 * Prerender the marketing site to static HTML, one page per locale.
 *
 * This is the whole reason the marketing site is a separate app. The portal is a client-rendered
 * SPA: a crawler receives an empty `#root` and has to execute ~2 MB of JavaScript before any copy
 * exists. That is survivable for a dashboard behind a login and disqualifying for a page whose
 * job is to rank. Here the HTML that leaves the server already contains the headline, the section
 * copy and the Arabic — the bundle only takes over interactivity afterwards.
 *
 * Output:
 *   marketing/dist/index.html      →  ezhalha.co/      (English, LTR)
 *   marketing/dist/ar/index.html   →  ezhalha.co/ar/   (Arabic, RTL)
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const MARKETING = path.resolve(ROOT, "marketing");
const DIST = path.resolve(MARKETING, "dist");
const SSR_DIST = path.resolve(MARKETING, ".ssr");

const SITE = process.env.MARKETING_ORIGIN || "https://ezhalha.co";

/** Where each locale is served from. English is the root so the bare domain is the English page. */
const localePath = (locale: Locale) => (locale === "en" ? "/" : `/${locale}/`);

function head(locale: Locale): string {
  const catalogue = getCatalogue(locale);
  const title = `ezhalha — ${catalogue.hero.t1} ${catalogue.hero.t2}`;
  const description = catalogue.hero.sub;
  const canonical = `${SITE}${localePath(locale)}`;

  // hreflang has to name every locale plus a default, and each must point at a URL that actually
  // exists — which is why locale is a route here rather than a runtime toggle.
  const alternates = LOCALES.map(
    (l) => `<link rel="alternate" hreflang="${l}" href="${SITE}${localePath(l)}" />`,
  ).join("\n    ");

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE}/#organization`,
        name: "ezhalha",
        url: SITE,
        logo: `${SITE}/brand/logo.png`,
        description,
        areaServed: "SA",
      },
      {
        "@type": "WebSite",
        "@id": `${SITE}/#website`,
        url: SITE,
        name: "ezhalha",
        inLanguage: locale,
        publisher: { "@id": `${SITE}/#organization` },
      },
    ],
  };

  return `<title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${canonical}" />
    ${alternates}
    <link rel="alternate" hreflang="x-default" href="${SITE}/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="ezhalha" />
    <meta property="og:locale" content="${locale === "ar" ? "ar_SA" : "en_US"}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${SITE}/brand/og.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${SITE}/brand/og.png" />
    <meta name="theme-color" content="#fe5200" />
    <link rel="icon" type="image/png" href="/brand/logo.png" />
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
}

async function writeSeoFiles() {
  const urls = LOCALES.map(
    (l) => `  <url><loc>${SITE}${localePath(l)}</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
  ).join("\n");

  await writeFile(
    path.join(DIST, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  );

  await writeFile(
    path.join(DIST, "robots.txt"),
    `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`,
  );
}

export async function buildMarketing() {
  await rm(DIST, { recursive: true, force: true });
  await rm(SSR_DIST, { recursive: true, force: true });

  console.log("building marketing client...");
  await viteBuild({ configFile: path.join(MARKETING, "vite.config.ts") });

  console.log("building marketing server bundle...");
  await viteBuild({
    configFile: path.join(MARKETING, "vite.config.ts"),
    mode: "ssr-build",
    build: {
      ssr: path.join(MARKETING, "src/entry-server.tsx"),
      outDir: SSR_DIST,
      emptyOutDir: true,
      // The SSR bundle is a build artefact run once by this script, never shipped.
      minify: false,
    },
  });

  const template = await readFile(path.join(DIST, "index.html"), "utf-8");
  const { render } = await import(path.join(SSR_DIST, "entry-server.js"));

  for (const locale of LOCALES) {
    const html = template
      .replace('<html lang="en" dir="ltr">', `<html lang="${locale}" dir="${DIRECTION[locale]}">`)
      .replace("<!--app-head-->", head(locale))
      .replace("<!--app-html-->", render(locale));

    const outDir = locale === "en" ? DIST : path.join(DIST, locale);
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "index.html"), html);

    // A prerendered page whose body is still an empty #root is the exact failure this build
    // exists to prevent, and it is invisible unless something checks.
    const rendered = html.slice(html.indexOf('<div id="root">'));
    if (rendered.length < 2000) {
      throw new Error(`Prerender produced no content for "${locale}" — the page would be blank to a crawler.`);
    }
    console.log(`  ${locale}: ${path.relative(ROOT, path.join(outDir, "index.html"))} (${Math.round(html.length / 1024)} KB)`);
  }

  await writeSeoFiles();
  await rm(SSR_DIST, { recursive: true, force: true });
}

// Allow `tsx script/prerender.ts` on its own, as well as being imported by script/build.ts.
if (import.meta.url === `file://${process.argv[1]}`) {
  buildMarketing().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
