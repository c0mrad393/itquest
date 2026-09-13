/**
 * ITQuest — Operator standing (pure)
 * ===================================
 * How far the operator has got, and how far their plan lets them act on it.
 *
 * ── WHY THERE ARE TWO NUMBERS AND NOT ONE ───────────────────────────────────
 *
 * These are genuinely different facts and the product needs both:
 *
 *   earned   the levels the operator's XP has actually bought. Never capped.
 *            It is the honest record of the work they did.
 *   level    the level their PLAN grants. Every gate in the estate reads this
 *            one — app unlocks, ticket tiers, job title, growth phase.
 *
 * They were the same number for as long as nothing capped anything. The free
 * tier introduced a ceiling and the two silently forked: `awardXp` wrote the
 * CAPPED figure into the operator record, while Settings, Profile and the
 * leaderboard each computed the UNCAPPED one straight from XP. A free operator
 * at the ceiling read level 4 in the taskbar and level 7 on their own profile,
 * both rendered as "your level", neither aware of the other.
 *
 * ── SO NEITHER ONE IS STORED ────────────────────────────────────────────────
 *
 * XP is the only progression fact worth keeping; both numbers fall out of it
 * on read. That is the estate's own rule — store what happened, derive what is
 * true — and it is what makes an upgrade work: raise the cap and the operator
 * is immediately standing where their XP already put them, with nothing to
 * recompute and nothing left holding a stale figure.
 *
 * The file is PURE on purpose. `lib/host/store.ts` needs the level inside its
 * own `openApp` gate, so anything here that reached for a store would close a
 * cycle. The React-side reader lives in `use-standing.ts`.
 */

import { levelForXp, xpForLevel } from "@/lib/scenario/scoring";

export interface Standing {
  /** The only stored fact. */
  xp: number;
  /** Levels the XP has bought, ignoring any plan. */
  earned: number;
  /** The level the plan grants — what every gate asks for. */
  level: number;
  /** The plan's ceiling, or null when the plan does not have one. */
  cap: number | null;
  /**
   * Is the plan holding the operator below what they earned?
   *
   * Distinct from "standing exactly on the cap": someone who has just reached
   * level 4 with no surplus is AT the ceiling but nothing is being withheld,
   * and telling them they have banked progress they do not have would be a
   * lie in the other direction.
   */
  held: boolean;
  /** Levels banked above the ceiling, waiting on an upgrade. 0 when not held. */
  banked: number;
  /** XP standing at the cap, so a held operator can be shown their surplus. */
  xpAtCap: number;
}

export function standingOf(xp: number, cap: number | null): Standing {
  const earned = levelForXp(xp);
  const level = cap === null ? earned : Math.min(earned, cap);
  const held = earned > level;
  return {
    xp,
    earned,
    level,
    cap,
    held,
    banked: earned - level,
    xpAtCap: cap === null ? 0 : xpForLevel(cap),
  };
}

/**
 * XP still to go before the next level — or null when the plan's ceiling, not
 * the XP, is what stands in the way.
 *
 * Returning null rather than a number is the point: a progress bar creeping
 * towards a level the plan will not grant is a promise the product cannot
 * keep, so the caller is made to render something else.
 */
export function toNextLevel(s: Standing): { need: number; have: number } | null {
  if (s.cap !== null && s.level >= s.cap) return null;
  return { need: xpForLevel(s.level + 1), have: s.xp };
}
