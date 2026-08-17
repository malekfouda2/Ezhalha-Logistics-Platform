# ezhalha Mobile

React Native (Expo) client for the ezhalha logistics platform. One app, all three user
types — the surface rendered after login is driven by `user.userType`
(`admin` | `client` | `operations`), mirroring `client/src/lib/auth-routing.ts` in the web app.

This directory is a **separate npm project** inside the repo. The root `package.json` is
for the API and the web SPA; `mobile/` keeps its own `node_modules`. Only `shared/` is
common to both.

---

## First-time setup

```bash
cd mobile
npx create-expo-app@latest . --template blank-typescript   # only if src/ is still bare
npm install
npx expo install expo-secure-store expo-constants expo-localization expo-router expo-updates
```

`create-expo-app` will not overwrite the files already committed here (`metro.config.js`,
`tsconfig.json`, `src/api/*`). If it asks, keep the existing ones.

Then point the app at an API:

```bash
cp .env.example .env
# edit EXPO_PUBLIC_API_BASE_URL
```

> **Never point this at production.** Use staging. Creating a shipment against production
> books a real carrier consignment and charges a real card.

Run it:

```bash
npm start        # requires a dev client build, not Expo Go — see below
```

### Why a custom dev client, not Expo Go

The Tap payment SDK is native, so the app cannot run in Expo Go. Build a development
client once per platform, then normal fast-refresh development works as usual:

```bash
npx expo run:ios       # or: eas build --profile development --platform ios
npx expo run:android
```

---

## Sharing types with the backend

`@shared/*` resolves to the repo's `shared/` directory — the same Drizzle tables, enums and
Zod schemas the API and web app use.

**Types come from `@shared/schema`. Values come from `@shared/domain`.**

```ts
import type { Shipment, User } from "@shared/schema";   // erased at compile — free
import { ShipmentStatus, ClientPermission } from "@shared/domain";  // runtime values
```

That split matters. `shared/schema.ts` is ~100KB and defines 62 Drizzle tables; importing a
*value* from it pulls `drizzle-orm` and `drizzle-zod` into the app bundle. `shared/domain.ts`
holds the same enums and permission lists with **zero imports**, so it costs nothing.
`schema.ts` re-exports everything in `domain.ts`, so server and web code is unaffected —
but on mobile, reach for `@shared/domain`.

Also dependency-free and safe to import directly: `@shared/chargeable-weight`,
`@shared/countries`, `@shared/country-timezones`, `@shared/application-documents`,
`@shared/internal-users`.

That alias is wired in two places, and **both must agree**:

| File | Resolves the alias for |
|---|---|
| `tsconfig.json` → `compilerOptions.paths` | TypeScript / your editor |
| `metro.config.js` → `extraNodeModules` + `watchFolders` | the bundler at runtime |

If you add another shared directory, add it to both.

Import **types and plain constants** freely. Do **not** import server-only modules
(`server/db`, anything touching `pg` or `drizzle-orm/node-postgres`) — they will bundle
Node built-ins that do not exist on device.

---

## Authentication

The web app uses cookie sessions. Mobile cannot rely on cookies, so it uses bearer tokens
against the same 291 API routes.

| Token | Lifetime | Stored | Purpose |
|---|---|---|---|
| Access | 15 min | memory only | `Authorization: Bearer …` on every request |
| Refresh | 60 days, rotating | Keychain / Keystore (`expo-secure-store`) | mints new access tokens |

```ts
import { signIn, signOut, fetchCurrentUser } from "@/api/auth";
import { api } from "@/api/client";

const user = await signIn(email, password);
const shipments = await api.get<Shipment[]>("/api/client/shipments");
```

`api.*` handles the token lifecycle for you:

- attaches the access token
- refreshes and replays once on `401 token_expired`
- **single-flights** the refresh, so parallel 401s produce one refresh call

That last point is not an optimisation. The server treats a replayed refresh token as a
stolen credential and revokes the entire token family — so N concurrent refreshes would
sign the user out. Never call `/api/auth/refresh` directly; go through `api.*`.

When a session really is dead, `api.*` clears tokens and notifies listeners:

```ts
import { onSessionExpired } from "@/api/client";
useEffect(() => onSessionExpired(() => router.replace("/login")), []);
```

### Passwordless login

`requestLoginCode(email)` → user receives a 6-digit code → `signInWithCode(email, code)`.
Preferred over passwords on mobile.

### Server error codes worth handling

| Code | Meaning | What the app should do |
|---|---|---|
| `token_expired` | access token past its exp | handled automatically |
| `token_revoked` | password changed or account deactivated | back to login |
| `refresh_expired` | refresh token past 60 days | back to login |
| `refresh_reused` | replay detected, family revoked | back to login, consider a security prompt |
| `refresh_invalid` | unknown token | back to login |

---

## Arabic and RTL

Arabic ships in v1, so build for it from the first screen:

- Never use `left` / `right` in styles. Use `start` / `end`, `marginStart`, `paddingEnd`.
- `I18nManager.forceRTL()` **requires an app restart** to take effect. Handle a language
  switch with an explicit restart via `expo-updates`; do not leave a half-flipped layout.
- Send the active language as `Accept-Language` so server-rendered strings, emails and
  push notifications match the UI: `api.get(path, { language })`.
- Translation catalogues live in `shared/i18n/` and are shared with the web app.

---

## Conventions

- **Server state** goes through TanStack Query, as in the web app. Do not hand-roll caching.

- **Money arrives as strings, and must stay that way.** All 75 `decimal` columns come back
  as `string`, not `number` — `"1234.56"`, not `1234.56`. The types say so; do not fight
  them. `parseFloat` on a total and re-formatting it is how you ship a rounding bug into an
  invoice. Format for display only, and send the string back untouched.

- **Money is never computed on the client.** The API returns SAR plus the account's display
  currency and the FX rate it used; render what it sends.

- **Files need `downloadFile()`**, not `Linking.openURL`. Labels and invoice PDFs sit behind
  an auth guard and a plain URL open will 401. See `src/api/client.ts`. Images are the
  exception — pass `authImageHeaders()` to `<Image source={{ uri, headers }} />`.

- **JSON bodies cap at 1MB.** Never base64 a file into a request; use the signed-URL upload
  flow (`POST /api/uploads/request-url`). Over the limit returns
  `413 { code: "payload_too_large" }`.

- **A mistyped endpoint returns `404 { code: "not_found" }`**, not the SPA's HTML. If you
  ever receive HTML from an `/api/*` path, the server is older than this README.
- **Idempotency**: sensitive POSTs (payments, shipment booking) take an `Idempotency-Key`
  header — `api.post(path, body, { idempotencyKey })`. Reuse the same key when retrying.
- **Brand orange** is `#fe5200`.

---

## Type checking

```bash
cd mobile && npm run check
```

The root `npm run check` deliberately excludes this directory — the two projects have
different `lib`, `jsx` and `types` settings and cannot share one `tsconfig`.
