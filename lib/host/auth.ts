"use client";

/**
 * ITQuest — Workstation sign-in
 * =============================
 *
 * ── THIS IS NOT SECURITY, AND SAYING SO IS THE POINT ────────────────────────
 *
 * There is no backend, no session token and no server to check anything
 * against. The credential below is in the shipped bundle, and anyone who opens
 * devtools can set `isLoggedIn` directly. This gate is SET DRESSING: it makes
 * the boot sequence land somewhere that feels like a workstation instead of
 * dumping the player straight onto a desktop.
 *
 * That distinction matters because the moment a real backend arrives, someone
 * will look at this file and decide it is "the auth layer" to extend. It is
 * not. Real auth would need the check to happen somewhere the player cannot
 * reach, which is exactly the thing this codebase does not have. Anything
 * gated behind this — Enterprise included — is gated cosmetically.
 *
 * ── SESSION SCOPE, NOT PERSISTENT ───────────────────────────────────────────
 *
 * Sign-in lives in sessionStorage beside the boot flag, so a reload during a
 * working session does not throw the operator back to a password box, but a
 * new tab starts the sequence properly. Persisting it to localStorage would
 * mean the login screen was seen exactly once, ever, which is not worth
 * building.
 *
 * The DEV BYPASS is separate and persistent, because it is a workstation
 * preference for someone debugging, not part of the fiction.
 */

import { create } from "zustand";

const SESSION_KEY = "itquest-signed-in";
const BYPASS_KEY = "itquest-skip-signin";

/**
 * The demo credential.
 *
 * Deliberately obvious. A convincing-looking password on a local simulator
 * invites someone to treat it as a secret; this one cannot be mistaken for
 * anything but a placeholder, and it is printed on the screen anyway.
 */
export const DEMO_USERNAME = "Operator";
export const DEMO_PASSWORD = "itquest";

function readSession(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function readBypass(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(BYPASS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Is the sign-in screen skipped entirely? Also read by the boot shell. */
export function signInBypassed(): boolean {
  return readBypass();
}

interface AuthStore {
  isLoggedIn: boolean;
  /** True once sessionStorage has been read on the client. */
  ready: boolean;
  /** Debug switch: skip boot AND sign-in on every load. */
  bypass: boolean;

  hydrate: () => void;
  /**
   * Attempt a sign-in. Returns an error string, or null on success — a
   * returned message rather than a thrown error, because a wrong password is
   * an expected outcome of a form, not an exception.
   */
  signIn: (username: string, password: string) => string | null;
  /** Skip the form. Used by the dev button and the DevTools toggle. */
  forceSignIn: () => void;
  signOut: () => void;
  setBypass: (on: boolean) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  isLoggedIn: false,
  ready: false,
  bypass: false,

  hydrate: () => {
    const bypass = readBypass();
    set({ isLoggedIn: bypass || readSession(SESSION_KEY), ready: true, bypass });
  },

  signIn: (username, password) => {
    if (username.trim().toLowerCase() !== DEMO_USERNAME.toLowerCase()) {
      return `Unknown account. Try ${DEMO_USERNAME}.`;
    }
    if (password !== DEMO_PASSWORD) return "Incorrect password.";
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* not persisted; the session still proceeds */
    }
    set({ isLoggedIn: true });
    return null;
  },

  forceSignIn: () => {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* noop */
    }
    set({ isLoggedIn: true });
  },

  signOut: () => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* noop */
    }
    set({ isLoggedIn: false });
  },

  setBypass: (on) => {
    try {
      if (on) localStorage.setItem(BYPASS_KEY, "1");
      else localStorage.removeItem(BYPASS_KEY);
    } catch {
      /* noop */
    }
    set({ bypass: on });
  },
}));
