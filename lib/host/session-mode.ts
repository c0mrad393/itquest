/**
 * TriageOS — Career vs Sandbox (v0.6.0)
 * =====================================
 * How big the world is when it is generated.
 *
 * CAREER starts at phase 1: a 35-person startup with one rack. That is the
 * whole point of the growth arc — the enterprise is something the operator
 * builds, not something they inherit.
 *
 * SANDBOX starts at phase 4: full enterprise, every app, unlimited budget and
 * the debug panel on. It exists so the late-game systems can be exercised
 * without playing fifteen levels first, which is what the QA console has been
 * used for and what it was never quite shaped for.
 *
 * WHY THIS IS A MODULE AND NOT STORE STATE. `generateWorld` runs in the infra
 * store's INITIALIZER, at module load, long before React renders — so the
 * choice has to be readable from localStorage at that instant. This is the same
 * constraint that made God Mode navigate with a full page load rather than a
 * client-side route change, and the same fix applies.
 */

import type { GrowthPhase } from "@/lib/core";
import { isGodMode } from "./god-mode";

const KEY = "triageos-session-mode";

export type SessionMode = "career" | "sandbox";

export function sessionMode(): SessionMode {
  if (typeof window === "undefined") return "career";
  try {
    return localStorage.getItem(KEY) === "sandbox" ? "sandbox" : "career";
  } catch {
    return "career";
  }
}

export function isSandbox(): boolean {
  return sessionMode() === "sandbox";
}

/**
 * Set the mode. Returns true when it actually CHANGED, because a startup world
 * and an enterprise world are not interchangeable — the caller has to wipe the
 * save slot and do a real page load so the store initializer re-runs.
 */
export function setSessionMode(mode: SessionMode): boolean {
  const changed = sessionMode() !== mode;
  try {
    if (mode === "sandbox") localStorage.setItem(KEY, "sandbox");
    else localStorage.removeItem(KEY);
  } catch {
    return false;
  }
  return changed;
}

/**
 * The phase a freshly generated world starts at.
 *
 * God Mode implies sandbox scale for the reason it always has: many templates
 * bind to roles a small org never generates, and a QA profile whose scenarios
 * silently drop out of the queue is not a QA profile.
 */
export function startingPhase(): GrowthPhase {
  return isSandbox() || isGodMode() ? 4 : 1;
}

/** Is the debug panel available in this session? */
export function debugEnabled(): boolean {
  return isSandbox() || isGodMode();
}
