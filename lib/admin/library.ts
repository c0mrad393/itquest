/**
 * ITQuest — the scenario library, described (pure)
 * =================================================
 * What the ticket library actually contains, computed from the library itself.
 *
 * ── COUNTED, NOT LISTED ─────────────────────────────────────────────────────
 *
 * The obvious build is a hand-kept table of families for the admin panel to
 * render. It would be wrong within a week, and wrong in the direction that
 * matters: somebody adds a family, the catalogue still says 15, and the one
 * screen whose job is to tell you what exists is the screen that lies.
 *
 * So this derives everything from `ticketLibrary` — the same function the game
 * generates from. If a family is not in here, it is not in the game either.
 *
 * ── AND IT CHECKS, NOT JUST COUNTS ──────────────────────────────────────────
 *
 * "138 templates" is not the useful number. The useful numbers are: which of
 * them a given plan can ever be handed, and which of them can actually bind to
 * an estate of a given size — because a template that cannot bind is not
 * content, it is a silent absence. Both are computed here rather than trusted.
 */

import { mulberry32 } from "@/lib/org/rng";
import { generateWorld } from "@/lib/org/generator";
import { ticketLibrary } from "@/lib/tickets/factory";
import { templateMinLevel, unlockedTiers } from "@/lib/progression/unlocks";
import type { InfrastructureState, TicketDifficulty } from "@/lib/core";
import type { GrowthPhase } from "@/lib/core";

export interface LibraryEntry {
  /** The family, e.g. `gen-print-spooler`. Hand-written templates are their own. */
  family: string;
  /** Ids minted from it, one per (tier, variant). */
  templateIds: string[];
  procedural: boolean;
  track: string;
  category: string;
  tiers: TicketDifficulty[];
  tags: string[];
  /** Lowest operator level this can be handed at, from its tags and tiers. */
  minLevel: number;
  /** Does its win-condition run in this build? */
  playable: boolean;
  /** Can it bind to the sampled estate at all? */
  binds: boolean;
  /** Does it bind on EVERY attempt, or only when the dice agree? */
  reliable: boolean;
}

/**
 * The family an id belongs to.
 *
 * `generateProceduralTemplates` mints `${family}-${tierNumber}-${variant}`, so
 * `gen-lockout-1-3` is the third variant of the Tier-1 lockout. My first
 * version of this matched the tier WORD — which never appears — so every
 * template became its own family and the page cheerfully reported 247 of them.
 * Worth the scar: a catalogue that miscounts is the one thing this screen must
 * not do, and it took rendering it once to see.
 *
 * Hand-written templates carry no such suffix and are their own family.
 */
const FAMILY_OF = (id: string) => id.replace(/-\d+-\d+$/, "");

/** Lowest level at which a template can be generated: its tier AND its tags. */
export function levelFor(difficulty: TicketDifficulty, tags: string[]): number {
  for (let lvl = 1; lvl <= 20; lvl++) {
    if (unlockedTiers(lvl).includes(difficulty) && templateMinLevel(tags) <= lvl) return lvl;
  }
  return 99;
}

/**
 * Describe the library against one estate.
 *
 * `phase` matters: a template that needs a database tier is real content at
 * phase 3 and a silent absence at phase 1, and the panel should be able to say
 * which of the two it is looking at.
 */
export function describeLibrary(phase: GrowthPhase = 1, seeds = [1, 4242, 99]): LibraryEntry[] {
  const worlds: InfrastructureState[] = seeds.map((s) => generateWorld(s, phase));
  const lib = ticketLibrary(worlds[0]);

  const byFamily = new Map<string, LibraryEntry>();
  for (const [id, t] of Object.entries(lib)) {
    const family = FAMILY_OF(id);
    const attempts = 12;
    let hits = 0;
    for (const w of worlds) {
      for (let i = 0; i < attempts; i++) if (t.makeContext(w, mulberry32(i * 13 + 1))) hits++;
    }
    const total = worlds.length * attempts;

    const existing = byFamily.get(family);
    if (existing) {
      existing.templateIds.push(id);
      if (!existing.tiers.includes(t.difficulty)) existing.tiers.push(t.difficulty);
      existing.minLevel = Math.min(existing.minLevel, levelFor(t.difficulty, t.tags));
      existing.binds ||= hits > 0;
      existing.reliable &&= hits === total;
      existing.playable &&= t.playable;
      continue;
    }
    byFamily.set(family, {
      family,
      templateIds: [id],
      procedural: family.startsWith("gen-"),
      track: t.track,
      category: t.category,
      tiers: [t.difficulty],
      tags: t.tags,
      minLevel: levelFor(t.difficulty, t.tags),
      playable: t.playable,
      binds: hits > 0,
      reliable: hits === total,
    });
  }

  return [...byFamily.values()].sort(
    (a, b) => a.minLevel - b.minLevel || a.category.localeCompare(b.category) || a.family.localeCompare(b.family),
  );
}

export interface LibrarySummary {
  families: number;
  templates: number;
  /** Families whose lowest level is within a plan's ceiling. */
  reachableBy: (levelCap: number | null) => number;
  byTrack: Record<string, number>;
  byCategory: Record<string, number>;
  /** Families that cannot bind to this estate at all. */
  unhostable: LibraryEntry[];
  /** Families that bind only sometimes — a silent, intermittent absence. */
  unreliable: LibraryEntry[];
  /** Families whose win-condition is not interactive in this build. */
  unplayable: LibraryEntry[];
}

export function summarise(entries: LibraryEntry[]): LibrarySummary {
  const tally = (key: "track" | "category") =>
    entries.reduce<Record<string, number>>((a, e) => ((a[e[key]] = (a[e[key]] ?? 0) + 1), a), {});
  return {
    families: entries.length,
    templates: entries.reduce((n, e) => n + e.templateIds.length, 0),
    reachableBy: (cap) => entries.filter((e) => cap === null || e.minLevel <= cap).length,
    byTrack: tally("track"),
    byCategory: tally("category"),
    unhostable: entries.filter((e) => !e.binds),
    unreliable: entries.filter((e) => e.binds && !e.reliable),
    unplayable: entries.filter((e) => !e.playable),
  };
}
