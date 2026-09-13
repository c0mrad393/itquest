"use client";

/**
 * ITQuest — Local operator session (v0.7.0)
 * ==========================================
 * Replaces the whole authentication layer: a Supabase client, email/password
 * and Google sign-in, a profiles table with RLS, a guest fallback, a QA "God
 * Mode" identity and a Sandbox mode — six ways into a single-player browser
 * game that only ever needed one.
 *
 * WHAT IS LEFT is what the game actually uses: a name, an avatar, and the
 * level and XP that come out of the save. There is one operator, stored
 * locally, and two ways to begin:
 *
 *   Start Game    wipe the slot and generate a fresh phase-1 world
 *   Continue      load the save that is already there
 *
 * WHERE THE TESTING POWER WENT. God Mode and Sandbox both existed to reach
 * the late game quickly. That is now a button in DevTools which drives the
 * real growth engine (`growCompany`) instead of a second world generator —
 * so the shortcut exercises the same code the slow path does, rather than
 * bypassing it.
 */

import { create } from "zustand";
import { clearSave, loadSave, setSaveScope } from "@/lib/persistence/save";
import { storedLevelCap } from "@/lib/platform/entitlements";
import { standingOf } from "@/lib/progression/standing";

export interface OperatorProfile {
  username: string;
  /** Palette id or an https image URL. */
  avatar: string;
  xp: number;
  /**
   * Derived from `xp` and the stored plan, never read back out of the save —
   * see lib/progression/standing.ts. Kept on the profile because the landing
   * page shows it before any store has hydrated.
   */
  level: number;
}

const DEFAULT_PROFILE: OperatorProfile = {
  username: "Operator",
  avatar: "indigo",
  xp: 0,
  level: 1,
};

/** Is there a save worth continuing? Drives the landing page's second button. */
export function hasSavedGame(): boolean {
  if (typeof window === "undefined") return false;
  setSaveScope("local");
  return !!loadSave();
}

/** The operator as the save remembers them. */
export function savedProfile(): OperatorProfile {
  const saved = loadSave()?.user;
  if (!saved) return DEFAULT_PROFILE;
  return {
    username: saved.displayName,
    avatar: saved.avatar,
    xp: saved.xp,
    level: standingOf(saved.xp, storedLevelCap()).level,
  };
}

interface SessionStore {
  profile: OperatorProfile;
  /** True once the profile has been read from storage on the client. */
  ready: boolean;

  /** Read the save slot into the store. Safe to call more than once. */
  hydrate: () => void;
  /** Wipe the slot so the desktop generates a fresh world. */
  startNewGame: () => void;
  updateProfile: (patch: Partial<OperatorProfile>) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  profile: DEFAULT_PROFILE,
  ready: false,

  hydrate: () => {
    setSaveScope("local");
    set({ profile: savedProfile(), ready: true });
  },

  startNewGame: () => {
    setSaveScope("local");
    clearSave();
    set({ profile: DEFAULT_PROFILE, ready: true });
  },

  updateProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
}));

/** Push the session profile onto the host desktop's operator record. */
export async function applyProfileToHost(profile: OperatorProfile): Promise<void> {
  const { useHostStore } = await import("@/lib/host/store");
  useHostStore.setState((s) => ({
    host: {
      ...s.host,
      user: {
        ...s.host.user,
        displayName: profile.username,
        avatar: profile.avatar,
        xp: profile.xp,
      },
    },
  }));
}
