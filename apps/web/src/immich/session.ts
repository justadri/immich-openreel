/** Who is signed in to Immich in this browser, and whether Immich is reachable through the proxy at all. */
import { create } from "zustand";
import * as api from "./api";
import { useImportedSources } from "./sources";

export type ImmichPhase = "checking" | "unavailable" | "signed-out" | "ready";

interface SessionState {
  phase: ImmichPhase;
  user: api.ImmichUser | null;
  features: api.ImmichFeatures;
  busy: boolean;
  error: string | null;
  /** Probes the proxy and any existing session. "unavailable" hides the integration entirely. */
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

const DEFAULT_FEATURES: api.ImmichFeatures = { passwordLogin: true, oauth: false, oauthAutoLaunch: false };

export const useImmichSession = create<SessionState>((set) => ({
  phase: "checking",
  user: null,
  features: DEFAULT_FEATURES,
  busy: false,
  error: null,

  init: async () => {
    set({ phase: "checking", error: null });
    if (!(await api.ping())) { set({ phase: "unavailable" }); return; }
    const features = await api.getFeatures().catch(() => DEFAULT_FEATURES);
    try {
      const user = await api.getMe();
      set({ features, user, phase: user ? "ready" : "signed-out" });
    } catch (e) {
      set({ features, user: null, phase: "signed-out", error: e instanceof Error ? e.message : String(e) });
    }
  },

  signIn: async (email, password) => {
    set({ busy: true, error: null });
    try {
      const user = await api.login(email.trim(), password);
      set({ user, phase: "ready", busy: false });
      return true;
    } catch (e) {
      set({ busy: false, error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  },

  signOut: async () => {
    await api.logout();
    useImportedSources.getState().clear();
    set({ user: null, phase: "signed-out", error: null });
  },
}));
