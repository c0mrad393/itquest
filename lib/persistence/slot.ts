/**
 * ITQuest — Decoding a save slot (pure)
 * ======================================
 * Given the raw string in storage, what has this build actually got?
 *
 * ── WHY THIS IS ITS OWN FILE ────────────────────────────────────────────────
 *
 * `save.ts` imports every persistent store, so nothing in it can be exercised
 * without a browser. The decision it was making — four distinct outcomes,
 * collapsed into `null` — is pure, is where the damage was, and belongs
 * somewhere a spec can reach.
 *
 * It is deliberately generic over the save's shape. All it needs is a version
 * to compare and a timestamp to report; knowing what an estate looks like
 * would drag the stores back in and buy nothing.
 */

/** The least a save must carry for this module to reason about it. */
export interface VersionedSave {
  version: number;
  savedAt: number;
}

/**
 * Moves a save exactly ONE version forward, keyed by the version it upgrades
 * FROM. One hop per entry, so a chain composes and nobody writes 26 → 28.
 */
export type Migrations<T> = Record<number, (s: T) => T>;

export type Decoded<T> =
  | { kind: "empty" }
  | { kind: "ok"; state: T; migrated: boolean }
  | {
      kind: "stale";
      reason: "outdated" | "unreadable";
      /** The version that wrote it, where that could be read at all. */
      version: number | null;
      savedAt: number | null;
    };

/**
 * Walk a save forward to `current`, or say it cannot be walked.
 *
 * The hop limit is not defensive noise: a migration that forgets to advance
 * `version` would otherwise spin here forever, inside the boot path, with no
 * output. It is caught and reported as outdated, which is true.
 */
export function migrate<T extends VersionedSave>(
  s: T,
  current: number,
  migrations: Migrations<T>,
): T | null {
  let cur = s;
  for (let hops = 0; cur.version !== current; hops++) {
    if (hops > current) return null;
    const step = migrations[cur.version];
    if (!step) return null;
    const next = step(cur);
    if (next.version === cur.version) return null;
    cur = next;
  }
  return cur;
}

/**
 * FOUR OUTCOMES, NOT TWO.
 *
 * This used to be `parsed.version !== VERSION ? null : parsed`, and the null
 * meant all of "nothing saved", "unreadable", and "written by an older
 * build". The caller could not tell them apart, so it treated the last two as
 * the first: it generated a new world and its autosave overwrote the old one
 * within four seconds. Silent, total, and it had been the behaviour for
 * twenty-eight schema versions.
 *
 * Distinguishing them is what lets the caller keep the old blob and say so.
 */
export function decodeSlot<T extends VersionedSave>(
  raw: string | null,
  current: number,
  migrations: Migrations<T>,
): Decoded<T> {
  if (!raw) return { kind: "empty" };

  let parsed: T;
  try {
    parsed = JSON.parse(raw) as T;
  } catch {
    return { kind: "stale", reason: "unreadable", version: null, savedAt: null };
  }

  // Parsed, but not a save. `JSON.parse("4")` succeeds, and a shape with no
  // version is not something to guess about.
  if (!parsed || typeof parsed !== "object" || typeof parsed.version !== "number") {
    return { kind: "stale", reason: "unreadable", version: null, savedAt: null };
  }

  if (parsed.version === current) return { kind: "ok", state: parsed, migrated: false };

  const moved = migrate(parsed, current, migrations);
  if (moved) return { kind: "ok", state: moved, migrated: true };

  return {
    kind: "stale",
    reason: "outdated",
    version: parsed.version,
    savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : null,
  };
}
