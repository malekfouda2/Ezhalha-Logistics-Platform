// store/useGuestStore.ts

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Guest mode: browsing the client portal without an account.
//
// There is no guest session on the server — no `users` row, no `client_accounts` row — so this
// flag lives entirely on the device. Persisted the same way `useLanguageStore` persists the
// active language: zustand's `persist` middleware over AsyncStorage. `hasHydrated` exists so
// the route guards (app/index.tsx, the protected layouts) don't render a redirect-to-login for
// one frame before the persisted flag has been read back off disk.
//
// The security model this leans on: a guest never holds an access or refresh token, so
// `apiRequest` (mobile/src/api/client.ts) never has anything to attach to an authenticated
// request. Every `/api/client/*` GET a guest can trigger is intercepted with canned data
// (see lib/guestMode.ts) before it would ever reach the network.
const GUEST_STORAGE_KEY = "ezhalha.guest.v1";

interface GuestState {
  isGuest: boolean;
  hasHydrated: boolean;
  startGuestSession: () => void;
  endGuestSession: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useGuestStore = create<GuestState>()(
  persist(
    (set) => ({
      isGuest: false,
      hasHydrated: false,

      startGuestSession: () => set({ isGuest: true }),
      // Called on real sign-in (a session always outranks a stale guest flag) and when the
      // visitor deliberately exits guest mode from Profile.
      endGuestSession: () => set({ isGuest: false }),

      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: GUEST_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ isGuest: state.isGuest }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

/** For call sites outside React — services, `api/client.ts` — where a hook can't be used. */
export function isGuestActive(): boolean {
  return useGuestStore.getState().isGuest;
}

export function endGuestSession(): void {
  useGuestStore.getState().endGuestSession();
}

export function useGuestMode() {
  const isGuest = useGuestStore((s) => s.isGuest);
  const hasHydrated = useGuestStore((s) => s.hasHydrated);
  const start = useGuestStore((s) => s.startGuestSession);
  const end = useGuestStore((s) => s.endGuestSession);
  return { isGuest, hasHydrated, start, end };
}
