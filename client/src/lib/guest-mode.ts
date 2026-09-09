import { useCallback, useSyncExternalStore } from "react";
import { ALL_CLIENT_PERMISSIONS } from "@shared/domain";

/**
 * Guest mode: browsing the client portal without an account.
 *
 * Guest mode lives entirely in the browser. There is no guest session, no guest `users` row and
 * no guest `client_accounts` row, because the server cannot represent one: `ensureAuthenticatedUser`
 * re-reads the user on every request and destroys the session when the row is missing, and both
 * `shipments.clientAccountId` and `shipment_rate_quotes.clientAccountId` are NOT NULL.
 *
 * That constraint is also the security model. A guest holds no cookie, so every `/api/client/*`
 * route still answers 401 without a line of new code — the only surface a guest can reach is the
 * two deliberately public `/api/public/guest/*` rate endpoints.
 */

const STORAGE_KEY = "ezhalha.guest.v1";

/**
 * The draft is stored under its own key, deliberately separate from the guest flag.
 *
 * Registering ends guest mode, and the draft has to outlive that by design — the whole promise
 * of the feature is that signing up does not cost you the shipment you just built. Keeping both
 * in one record meant clearing the flag at login also threw the shipment away.
 */
const DRAFT_STORAGE_KEY = "ezhalha.guest.draft.v1";

/** Which wizard produced the draft — they hydrate different pages. */
export type GuestDraftKind = "express" | "local";

export interface GuestIndicativeQuote {
  carrierName: string;
  serviceName: string;
  /** Total the guest was shown, in SAR. Indicative: priced at the individual margin. */
  totalSar: number;
  currency: string;
}

export interface GuestDraft {
  kind: GuestDraftKind;
  /** The wizard's `formData`, opaque here on purpose — only the wizard knows its shape. */
  formData: unknown;
  indicativeQuote?: GuestIndicativeQuote;
  savedAt: string;
}

export interface GuestState {
  startedAt: string;
}

function readState(): GuestState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestState;
    // A hand-edited or half-written value must not brick the login screen.
    return parsed && typeof parsed.startedAt === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeState(state: GuestState | null) {
  if (typeof window === "undefined") return;
  try {
    if (state) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Private browsing / quota. Guest mode degrades to "this tab only", which is acceptable.
  }
  cached = state;
  listeners.forEach((listener) => listener());
}

// useSyncExternalStore compares snapshots by identity, so the snapshot has to be a stable
// reference between writes — re-parsing localStorage on every render would loop forever.
let cached: GuestState | null | undefined;
const listeners = new Set<() => void>();

function getSnapshot(): GuestState | null {
  if (cached === undefined) {
    cached = readState();
  }
  return cached;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isGuestActive(): boolean {
  return getSnapshot() !== null;
}

export function startGuestSession(): void {
  writeState({ startedAt: new Date().toISOString() });
}

/**
 * Leave guest mode. Called on sign-out of guest mode and on every real login — a stale guest
 * flag alongside a real session would make `getQueryFn` serve canned data to a paying client.
 *
 * Deliberately does NOT touch the draft: registering is exactly when the draft has to survive.
 */
export function endGuestSession(): void {
  writeState(null);
}

export function saveGuestDraft(draft: Omit<GuestDraft, "savedAt">): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ ...draft, savedAt: new Date().toISOString() }),
    );
  } catch {
    // Nothing to do: the visitor keeps their in-memory wizard state for this tab.
  }
}

export function getGuestDraft(): GuestDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestDraft;
    return parsed && (parsed.kind === "express" || parsed.kind === "local") ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Read the draft and drop it in one step, so a refresh cannot replay the same shipment twice.
 */
export function consumeGuestDraft(): GuestDraft | null {
  const draft = getGuestDraft();
  if (draft && typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // Nothing to clear; the caller has the draft either way.
    }
  }
  return draft;
}

export function useGuestMode(): {
  isGuest: boolean;
  state: GuestState | null;
  start: () => void;
  end: () => void;
} {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const start = useCallback(() => startGuestSession(), []);
  const end = useCallback(() => endGuestSession(), []);
  return { isGuest: state !== null, state, start, end };
}

/**
 * The draft a client left behind before their account existed, held server-side.
 *
 * The browser copy only survives for someone approved instantly — a company waits days for
 * document review, long enough to clear the browser or come back on another machine, so their
 * draft rides on the application row instead. Both wizards and the dashboard read it from here.
 */
export async function fetchPendingShipmentDraft(): Promise<GuestDraft | null> {
  try {
    const res = await fetch("/api/client/pending-draft", { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as { draft?: GuestDraft | null };
    const draft = data?.draft;
    return draft && (draft.kind === "express" || draft.kind === "local") ? draft : null;
  } catch {
    // A draft we cannot fetch is not worth blocking a page over.
    return null;
  }
}

/** Clear the server-held draft, so it is offered exactly once. */
export async function dismissPendingShipmentDraft(): Promise<void> {
  try {
    await fetch("/api/client/pending-draft/dismiss", { method: "POST", credentials: "include" });
  } catch {
    // Best effort: the worst case is the banner appearing one more time.
  }
}

/**
 * What a guest sees instead of their (non-existent) account data.
 *
 * Deliberately honest rather than flattering: the feature flags are all off, which is exactly
 * what a real new account gets, and the stats are zero rather than invented. The permissions are
 * the one place we hand out everything — `ClientLayout` hides every permissioned nav item when
 * `/api/client/my-permissions` has no data, so without this a guest would browse a one-item
 * sidebar and see none of the product.
 */
const GUEST_ACCOUNT = {
  id: "guest",
  accountNumber: "—",
  accountType: "individual",
  name: "Guest",
  companyName: null,
  email: "",
  phone: "",
  country: "Saudi Arabia",
  profile: "regular",
  isActive: true,
  creditEnabled: false,
  creditLimitSar: "0",
  salesFeaturesEnabled: false,
  dangerousGoodsEnabled: false,
  preferredCurrency: "SAR",
  createdAt: new Date().toISOString(),
};

const GUEST_RESPONSES: Record<string, unknown> = {
  "/api/client/account": GUEST_ACCOUNT,
  "/api/client/my-permissions": {
    permissions: ALL_CLIENT_PERMISSIONS,
    isPrimaryContact: false,
  },
  "/api/client/stats": {
    totalShipments: 0,
    activeShipments: 0,
    deliveredShipments: 0,
    totalSpent: 0,
    shipmentsTrend: 0,
    spendTrend: 0,
  },
  "/api/client/credit-access": { creditEnabled: false, hasPendingRequest: false },
  "/api/client/dangerous-goods": { enabled: false, hasPendingRequest: false },
  "/api/client/sales-features": { enabled: false, hasPendingRequest: false },
  "/api/client/fx-rate": { currency: "SAR", rate: 1 },
  "/api/client/pending-draft": { draft: null },
  "/api/notifications": [],
  "/api/profile-badges": [],
};

/**
 * The canned answer for a client read in guest mode, or `undefined` when the caller should let
 * the request go to the network.
 *
 * Unknown `/api/client/*` reads fall back to an empty list, which every list page already knows
 * how to render — that is what lets the whole portal be browsable without touching each page.
 */
export function getGuestQueryResponse(path: string): unknown {
  if (path in GUEST_RESPONSES) {
    return GUEST_RESPONSES[path];
  }
  if (path.startsWith("/api/client/")) {
    return [];
  }
  return undefined;
}
