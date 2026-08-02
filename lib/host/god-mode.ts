"use client";

/**
 * TriageOS — "God Mode" QA profile
 * ================================
 * A tester identity that bypasses normal progression so any ticket can be
 * QA'd without playing up through the tiers:
 *
 *   • the ticket factory emits EVERY template at once (not the curated
 *     4×T1 / 2×T2 / 2×T3 starter spread)
 *   • XP/level gating is bypassed — the operator starts maxed
 *
 * It is opt-in and sticky per browser (localStorage), so a QA session survives
 * reloads. Enable from the landing page, the Settings app, or the console:
 *
 *   TriageOS.godMode(true)   // then reload
 */

const KEY = "triageos-god-mode";

export const GOD_MODE_USERNAME = "QA Tester";
/** Level/XP handed to the QA profile so nothing is progression-locked. */
export const GOD_MODE_XP = 999_999;

export function isGodMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Flip the flag. Returns true when the mode actually CHANGED — callers use that
 * to wipe the save slot, because a God Mode world (every template at once) and
 * a normal world are not interchangeable in either direction.
 */
export function setGodMode(on: boolean): boolean {
  const changed = isGodMode() !== on;
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — QA mode simply stays off */
    return false;
  }
  return changed;
}

/** Expose a tiny console handle for testers. */
export function installGodModeConsoleApi(): void {
  if (typeof window === "undefined") return;
  (window as unknown as { TriageOS?: Record<string, unknown> }).TriageOS = {
    ...((window as unknown as { TriageOS?: Record<string, unknown> }).TriageOS ?? {}),
    godMode: (on = true) => {
      setGodMode(on);
      return `God Mode ${on ? "enabled" : "disabled"} — reload to apply.`;
    },
    isGodMode,
  };
}
