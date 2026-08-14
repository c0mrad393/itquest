"use client";

/**
 * TriageOS — Theme engine (v0.9.0)
 * ================================
 * Three states, not two: light, dark, and SYSTEM. System is the default and it
 * stays live — if the operator's OS flips to dark at sunset, so does this,
 * without them touching anything. Collapsing that to a boolean toggle would
 * silently opt every new player out of a preference they already expressed.
 *
 * The class lands on <html>, so it reaches everything: the Host desktop, the
 * ticket inbox, the DevTools tray, the ServerOS desktop inside an RDP window
 * and the DeskOS client inside that. Custom properties inherit, so no
 * component has to know a theme exists.
 *
 * SSR SAFETY. localStorage and matchMedia do not exist on the server, so the
 * store starts at "system" and settles on mount. `ThemeScript` runs before
 * paint to stamp the right class up front — without it the first frame is
 * whichever theme the CSS defaults to, and a white flash on a dark setup is
 * exactly the kind of thing an accessibility pass is supposed to remove.
 */

import { create } from "zustand";

const KEY = "triageos-theme";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/** What the operating system is asking for right now. */
export function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === "system" ? systemTheme() : pref;
}

function readStored(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const raw = localStorage.getItem(KEY);
    return raw === "light" || raw === "dark" ? raw : "system";
  } catch {
    return "system";
  }
}

/** Stamp the resolved theme on <html>. The single point of application. */
export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("theme-light", "theme-dark");
  root.classList.add(`theme-${resolved}`);
  root.style.colorScheme = resolved;
}

interface ThemeStore {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  /** True once the client has read storage — guards against SSR mismatch. */
  ready: boolean;

  /** Read storage, apply, and start following the system when set to system. */
  init: () => () => void;
  setPreference: (pref: ThemePreference) => void;
  /** Cycle light -> dark -> system, for the taskbar toggle. */
  cycle: () => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  preference: "system",
  resolved: "dark",
  ready: false,

  init: () => {
    const pref = readStored();
    const resolved = resolveTheme(pref);
    applyTheme(resolved);
    set({ preference: pref, resolved, ready: true });

    // Keep following the OS while the preference is "system". A listener that
    // fired regardless would override an explicit choice at sunset.
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!mq) return () => {};
    const onChange = () => {
      if (get().preference !== "system") return;
      const next = systemTheme();
      applyTheme(next);
      set({ resolved: next });
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  },

  setPreference: (pref) => {
    try {
      if (pref === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, pref);
    } catch {
      /* storage unavailable — the choice simply does not persist */
    }
    const resolved = resolveTheme(pref);
    applyTheme(resolved);
    set({ preference: pref, resolved });
  },

  cycle: () => {
    const order: ThemePreference[] = ["light", "dark", "system"];
    const next = order[(order.indexOf(get().preference) + 1) % order.length];
    get().setPreference(next);
  },
}));

/**
 * Inline script that runs before first paint.
 *
 * Deliberately duplicates a few lines of the logic above rather than importing
 * it: this has to execute as a blocking string in <head>, before any bundle
 * has loaded. The duplication is three lines and it buys a flash-free start.
 */
export const THEME_BOOT_SCRIPT = `
(function () {
  try {
    var p = localStorage.getItem("${KEY}");
    var t = p === "light" || p === "dark"
      ? p
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.classList.add("theme-" + t);
    document.documentElement.style.colorScheme = t;
  } catch (e) {
    document.documentElement.classList.add("theme-dark");
  }
})();
`.trim();
