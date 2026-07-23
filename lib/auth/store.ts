/**
 * TriageOS — Auth store (Entry/Identity layer)
 * ============================================
 * Owns the session lifecycle: boot resolution, email/password auth, Google
 * OAuth, guest sessions, profile fetch/update, and progression sync.
 *
 * Identity flow on sign-in:
 *   session → ensureProfile (fetch or create public.profiles row)
 *           → scope the LocalStorage save to the user id
 *           → hydrate the in-sim HostUser (name / avatar / xp / level)
 *
 * NOTE ON IMPORTS: this store dynamically imports the host store (never
 * statically) so `host/store → auth/store` can stay a static edge without a
 * cycle.
 */

"use client";

import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import { loadSave, setSaveScope } from "@/lib/persistence/save";
import type { AuthStatus, UserProfile } from "@/lib/core";

const GUEST_FLAG = "triageos-guest";

const GUEST_DEFAULTS: UserProfile = {
  id: "guest",
  email: null,
  username: "Guest Operator",
  avatar: "🧑‍💻",
  provider: "guest",
  xp: 6420,
  level: 4,
  createdAt: Date.now(),
};

/**
 * Guest identity is sourced from the guest save slot (username/avatar/xp are
 * persisted with the sim), falling back to defaults on a fresh device.
 * MUST be called after setSaveScope("guest").
 */
function guestProfile(): UserProfile {
  const saved = loadSave()?.user;
  if (!saved) return GUEST_DEFAULTS;
  return {
    ...GUEST_DEFAULTS,
    username: saved.displayName,
    avatar: saved.avatar,
    xp: saved.xp,
    level: saved.level,
  };
}

interface AuthStore {
  status: AuthStatus;
  profile: UserProfile | null;
  /** Last auth error, surfaced by the AuthModal. */
  error: string | null;
  busy: boolean;
  initialized: boolean;

  /** Resolve the existing session (call once from the app shell). */
  init: () => Promise<void>;
  signUp: (email: string, password: string, username: string) => Promise<boolean>;
  signInWithPassword: (email: string, password: string) => Promise<boolean>;
  signInWithGoogle: () => Promise<void>;
  continueAsGuest: () => void;
  signOut: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<UserProfile, "username" | "avatar">>) => Promise<void>;
  clearError: () => void;
}

/** Build a UserProfile from an auth user + its profiles row (may be partial). */
function toProfile(user: User, row: Partial<UserProfile> | null): UserProfile {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const provider = user.app_metadata?.provider === "google" ? "google" : "password";
  return {
    id: user.id,
    email: user.email ?? null,
    username:
      (row?.username as string) ??
      (meta.username as string) ??
      (meta.full_name as string) ??
      user.email?.split("@")[0] ??
      "Operator",
    avatar: (row?.avatar as string) ?? (meta.avatar_url as string) ?? "🧑‍💻",
    provider,
    xp: row?.xp ?? 6420,
    level: row?.level ?? 4,
    createdAt: row?.createdAt ?? Date.parse(user.created_at) ?? Date.now(),
  };
}

/** Fetch the profiles row, creating it on first sign-in. */
async function ensureProfileRow(user: User): Promise<UserProfile> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, avatar, xp, level, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (data) {
    return toProfile(user, {
      username: data.username,
      avatar: data.avatar,
      xp: data.xp,
      level: data.level,
      createdAt: data.created_at ? Date.parse(data.created_at) : undefined,
    });
  }

  const fresh = toProfile(user, null);
  // Best-effort insert (RLS: users may insert their own row).
  await supabase.from("profiles").upsert({
    id: fresh.id,
    username: fresh.username,
    avatar: fresh.avatar,
    xp: fresh.xp,
    level: fresh.level,
  });
  return fresh;
}

/** Hydrate the in-sim operator identity from the persistent profile. */
async function applyProfileToHost(profile: UserProfile): Promise<void> {
  const { useHostStore } = await import("@/lib/host/store");
  useHostStore.setState((s) => ({
    host: {
      ...s.host,
      user: {
        ...s.host.user,
        displayName: profile.username,
        avatar: profile.avatar,
        xp: profile.xp,
        level: profile.level,
      },
    },
  }));
}

async function enterSession(user: User, set: (p: Partial<AuthStore>) => void): Promise<void> {
  const profile = await ensureProfileRow(user);
  setSaveScope(profile.id); // per-account save slot, BEFORE desktop hydration
  await applyProfileToHost(profile);
  set({ status: "signedIn", profile, error: null });
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  status: "loading",
  profile: null,
  error: null,
  busy: false,
  initialized: false,

  init: async () => {
    if (get().initialized) return;
    set({ initialized: true });

    if (!isSupabaseConfigured) {
      // Degraded mode: only guest sessions exist.
      if (typeof window !== "undefined" && localStorage.getItem(GUEST_FLAG)) {
        setSaveScope("guest");
        const gp = guestProfile();
        await applyProfileToHost(gp);
        set({ status: "guest", profile: gp });
      } else {
        set({ status: "signedOut" });
      }
      return;
    }

    const supabase = getSupabase();

    // React to future sign-ins/outs (incl. the OAuth redirect landing).
    supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      if (session?.user) {
        void enterSession(session.user, set);
      } else if (get().status !== "guest") {
        set({ status: "signedOut", profile: null });
      }
    });

    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      await enterSession(data.session.user, set);
    } else if (typeof window !== "undefined" && localStorage.getItem(GUEST_FLAG)) {
      setSaveScope("guest");
      const gp = guestProfile();
      await applyProfileToHost(gp);
      set({ status: "guest", profile: gp });
    } else {
      set({ status: "signedOut" });
    }
  },

  signUp: async (email, password, username) => {
    if (!isSupabaseConfigured) {
      set({ error: "Supabase is not configured — use Guest mode or add env keys." });
      return false;
    }
    set({ busy: true, error: null });
    const { data, error } = await getSupabase().auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    set({ busy: false });
    if (error) {
      set({ error: error.message });
      return false;
    }
    // Email confirmation may be required; if a session exists we're in.
    if (data.session?.user) return true;
    set({ error: "Check your inbox to confirm your email, then sign in." });
    return false;
  },

  signInWithPassword: async (email, password) => {
    if (!isSupabaseConfigured) {
      set({ error: "Supabase is not configured — use Guest mode or add env keys." });
      return false;
    }
    set({ busy: true, error: null });
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    set({ busy: false });
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true; // onAuthStateChange completes the transition
  },

  signInWithGoogle: async () => {
    if (!isSupabaseConfigured) {
      set({ error: "Supabase is not configured — use Guest mode or add env keys." });
      return;
    }
    set({ busy: true, error: null });
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/desktop` },
    });
    if (error) set({ busy: false, error: error.message });
    // On success the browser navigates away to Google.
  },

  continueAsGuest: () => {
    localStorage.setItem(GUEST_FLAG, "1");
    setSaveScope("guest");
    const gp = guestProfile();
    void applyProfileToHost(gp);
    set({ status: "guest", profile: gp, error: null });
  },

  signOut: async () => {
    localStorage.removeItem(GUEST_FLAG);
    if (isSupabaseConfigured) {
      await getSupabase().auth.signOut();
    }
    set({ status: "signedOut", profile: null });
  },

  updateProfile: async (patch) => {
    const current = get().profile;
    if (!current) return;
    const next = { ...current, ...patch };
    set({ profile: next });
    await applyProfileToHost(next);
    if (get().status === "signedIn" && isSupabaseConfigured) {
      await getSupabase()
        .from("profiles")
        .update({ username: next.username, avatar: next.avatar })
        .eq("id", next.id);
    }
  },

  clearError: () => set({ error: null }),
}));

/**
 * Fire-and-forget progression sync, called by the host store on XP awards.
 * Safe to call from anywhere; no-ops for guests / unconfigured Supabase.
 */
export function reportProgress(xp: number, level: number): void {
  const { status, profile } = useAuthStore.getState();
  if (!profile) return;
  useAuthStore.setState({ profile: { ...profile, xp, level } });
  if (status === "signedIn" && isSupabaseConfigured) {
    void getSupabase().from("profiles").update({ xp, level }).eq("id", profile.id);
  }
}
