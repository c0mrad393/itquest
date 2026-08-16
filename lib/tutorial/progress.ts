/**
 * ITQuest — Tutorial progress persistence
 * ========================================
 * Which tours the operator has already been through.
 *
 * ── WHY THIS IS NOT IN THE SAVE ─────────────────────────────────────────────
 *
 * Two reasons, and both matter.
 *
 * First, SCOPE. The save is a snapshot of a world: this estate, these tickets,
 * this budget. Knowing where the Ticket Center is belongs to the person, not
 * the estate — so "start a new estate" must not re-teach the UI to someone who
 * has been playing for a week. Putting it in `PersistedState` would have tied
 * it to exactly the wrong lifetime.
 *
 * Second, COST. `loadSave` discards any snapshot whose version does not match
 * exactly (save.ts:102). Adding a field to the save means bumping VERSION,
 * which throws away every save in existence — an unreasonable price for
 * remembering that a tour was seen. A separate key costs nothing and cannot
 * invalidate anything.
 *
 * The escape hatch is `clearProgress`, wired to a Settings control, for anyone
 * who genuinely wants the tours back.
 */

"use client";

const KEY = "triageos-tutorial";
const VERSION = 1;

interface StoredProgress {
  version: number;
  completed: string[];
}

/**
 * Read the completed list. Returns empty for anything unreadable — a corrupt
 * or stale record means "we do not know what they have seen", and showing a
 * tour again is a far smaller failure than suppressing it forever.
 */
export function loadProgress(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredProgress;
    if (parsed.version !== VERSION || !Array.isArray(parsed.completed)) return [];
    return parsed.completed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function saveProgress(completed: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredProgress = { version: VERSION, completed: [...completed] };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Storage full or blocked. The tour still runs for this session; it will
    // simply offer itself again next time, which is the harmless direction.
  }
}

export function clearProgress(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
