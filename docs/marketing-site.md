# Marketing site — ezhalha.co

The public site. Separate origin, separate build, separate bundle from the portal.

```
ezhalha.co/          → marketing/dist/index.html      prerendered, English, LTR
ezhalha.co/ar/       → marketing/dist/ar/index.html   prerendered, Arabic, RTL
ezhalha.co/api/*     → proxied to the same Node backend  (same-origin: no CORS)
app.ezhalha.co/*     → the portal, entirely unchanged
```

## Why it is not a route in the portal

The portal is a client-rendered SPA that ships as one ~2.1 MB chunk with no code splitting, and
`AuthProvider` blocks first paint on `/api/auth/me` (`client/src/lib/auth-context.tsx:23-42`). A
marketing page inside it would be invisible to a crawler until 2 MB of JavaScript had executed.

This build is **308 KB (101 KB gzipped)** and the HTML already contains the copy.

Keeping the portal at `app.ezhalha.co` also means login stays at `/`. Nine internal links and the
`login_url` email variable (`server/routes.ts:13740`) assume that; none of them had to move.

## Commands

```bash
npm run dev:marketing     # vite dev server on :5174, proxies /api to :5000
npm run build:marketing   # prerender both locales into marketing/dist
npm run build             # client + marketing + server, all three
```

`MARKETING_API_TARGET` overrides the dev/preview proxy target (macOS runs AirPlay on :5000, so
you will usually need it: `MARKETING_API_TARGET=http://127.0.0.1:5099`).

`MARKETING_ORIGIN` overrides the canonical origin baked into the prerendered tags. Set it on
staging, or every canonical and `hreflang` will claim to be the production URL.

`VITE_APP_ORIGIN` overrides where "Sign in", "Get started" and the footer policy links go
(default `https://app.ezhalha.co`). Set it on staging too, or reviewers are handed to production.

## Prerendering

`script/prerender.ts` builds twice — once for the browser, once for SSR — then renders the tree
with `react-dom/server` per locale and writes the HTML to disk with `lang`, `dir`, title,
description, canonical, `hreflang`, Open Graph, Twitter and JSON-LD filled in, plus `sitemap.xml`
and `robots.txt`.

**It throws if a rendered page comes out under 2 KB of body.** A prerender that silently produced
an empty `#root` would look fine in review and cost months of indexing.

## Language

Locale is a URL, not runtime state. `/` is English and `/ar/` is Arabic, each prerendered, so
`hreflang` points at addresses that exist and the browser gets the right `dir` in the first byte.
Switching language is a link.

Catalogues live in **`shared/i18n/`** — the location `mobile/README.md` has documented since the
native app was scaffolded, finally built. `tests/marketing-i18n.test.ts` asserts English and
Arabic stay at key parity, that section arrays are the same length in both, and that neither
language has leaked a sentence into the other.

Fonts are self-hosted (`@fontsource-variable/inter`, `@fontsource-variable/cairo`) so the page
owes nothing to a CDN on first paint. Inter has no Arabic coverage; before Cairo, Arabic fell
through to a browser default. The portal's negative letter-spacing is zeroed under `[dir="rtl"]`
— negative tracking breaks Arabic cursive joins.

## The public API

Two endpoints, both unauthenticated, both redacted, both in `server/routes.ts`:

| Endpoint | Notes |
| --- | --- |
| `POST /api/public/quote` | Reuses `buildQuickQuote` with guest constants. Strips `baseRate`, `markup` and `laneId`. Returns the five cheapest per group. |
| `GET /api/public/track/:trackingNumber` | `EZH` numbers only. Served from `shipment_carrier_tracking_events` — no carrier call. Nine allow-listed fields. |

Rate limits are `publicQuoteLimiter` (40/10min) and `publicTrackLimiter` (60/10min), separate
from `guestRateLimiter`. Note express-rate-limit counts a request *before* the 3-minute quote
cache can answer it — which is why the quote widget runs on a button press, not on keystroke.

`tests/public-api.test.ts` is the guard. The redaction assertions are written as allow-lists, so a
column added to `shipments` later fails the test rather than leaking quietly.

## Deploying

The marketing site is static. Build it, sync `marketing/dist` to the host, point nginx at it.

```bash
# on the host, in the repo checkout
npm run build:marketing
rsync -a --delete marketing/dist/ /www/wwwroot/ezhalha.co/
```

nginx vhost:

```nginx
server {
    listen 80;
    server_name ezhalha.co www.ezhalha.co;
    return 301 https://ezhalha.co$request_uri;
}

server {
    listen 443 ssl http2;
    server_name www.ezhalha.co;
    # certs via certbot
    return 301 https://ezhalha.co$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ezhalha.co;
    root /www/wwwroot/ezhalha.co;

    # ssl_certificate / ssl_certificate_key via certbot

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    # Hashed filenames, so these can be cached hard.
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Same-origin API. This is what removes CORS from the picture entirely.
    location /api/ {
        proxy_pass http://ezhalha_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # The public limiters key on IP; without this every visitor shares nginx's.
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Prerendered HTML: revalidate, so a deploy is visible immediately.
    location / {
        try_files $uri $uri/ $uri/index.html =404;
        add_header Cache-Control "public, max-age=0, must-revalidate";
    }
}
```

**Before writing this vhost, check the host.** The repo's `nginx.conf` describes `ezhalha.com`
(note `.com`, not `.co`) and does not match the live server, which runs panel-managed vhosts. Treat
the checked-in file as stale.

The backend needs no redeploy for the site itself, but **does** need one for the two public
endpoints.

## Known gaps

- **The logo has no vector.** `brand/logo.png` is 530×470, derived from a WhatsApp screenshot run
  through remove.bg. `og:image` currently points at it and will letterbox badly in a 1200×630
  card. Drop a real `og.png` into `marketing/public/brand/` and set `MARKETING_OG_IMAGE`.
- **Analytics is not wired.** The decision was self-hosted (Plausible or Umami); the container and
  the script tag are still to do.
- **No dark/light toggle.** The page follows the OS. The portal's toggle was not carried over
  because a marketing page has no per-user state to persist it in.
