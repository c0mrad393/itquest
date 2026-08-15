/**
 * TriageOS — The ambient ticket engine (polish pass)
 * ==================================================
 * The service desk never runs out of work. Before this file, this one did.
 *
 * ── THE BUG THIS EXISTS TO FIX ──────────────────────────────────────────────
 *
 * Ticket supply had exactly three sources, and every one of them was an EVENT
 * rather than a process:
 *
 *   1. world generation — five Tier-1 tickets, once
 *   2. promotion — `spawnForTiers`, and only for tiers unlocked AT that exact
 *      level. Tiers unlock at 1, 2, 5 and 7, so being promoted to 3, 4, 6 or
 *      anything past 7 produced nothing at all
 *   3. reactive physics — a tripped breaker, a thermal shutdown, an unplanned
 *      outage. All of which require the PLAYER to have broken something
 *
 * So an operator who cleared the starter queue and broke nothing had no source
 * of work. And because XP comes from tickets, no tickets meant no XP, which
 * meant no promotion, which meant no tickets. Not a stall — a closed loop with
 * no way out, which is why it always looked like the generator had "stopped"
 * at around the eighth ticket.
 *
 * ── WHY A PROCESS, NOT MORE EVENTS ──────────────────────────────────────────
 *
 * The tempting fix is another trigger: spawn on promotion regardless of tier,
 * or top up when the queue empties. Both would work today and break the next
 * time someone adds a level band, because they treat "there is work to do" as
 * something that HAPPENS rather than something that is CONTINUOUSLY TRUE of a
 * company with three hundred staff.
 *
 * So this is a paced process with one question: given the estate, the level,
 * and how much is already open, should another ticket arrive right now? It has
 * no memory beyond a timestamp, which means it cannot deadlock — there is no
 * state to get stuck in.
 *
 * ── PACING ──────────────────────────────────────────────────────────────────
 *
 * Two independent brakes, because either alone fails:
 *
 *   - AN INTERVAL, so tickets do not arrive faster than they can be worked.
 *   - A BACKLOG CEILING, so an operator who steps away does not return to
 *     forty tickets and a wall of breached SLAs. When the queue is full the
 *     engine simply waits — the company still has problems, it just is not
 *     reporting them to somebody already underwater.
 *
 * The interval SHORTENS as the company grows, because a 450-person company
 * genuinely does raise more tickets than a 35-person one, and that is the
 * clearest possible signal that the estate got bigger.
 */

import type { InfrastructureState, TicketDifficulty } from "@/lib/core";
import { unlockedTiers, templateMinLevel } from "@/lib/progression/unlocks";
import type { TicketTemplate } from "./matrix";

/**
 * How long between arrivals, by growth phase.
 *
 * Deliberately generous. A ticket every ninety seconds sounds slow until you
 * remember each one is a multi-step investigation across three apps; the
 * failure mode this pass is fixing was an EMPTY queue, and overcorrecting into
 * a flood would trade one unplayable state for another.
 */
export const ARRIVAL_MS_BY_PHASE: Record<number, number> = {
  0: 150_000, // startup, 35 staff
  1: 110_000, // small business, 150
  2: 80_000, // mid-market, 300
  3: 60_000, // enterprise, 450
};

/** Never let the board grow past this many unresolved dashboard tickets. */
export const BACKLOG_CEILING = 7;

/**
 * The queue is considered EMPTY below this, and the engine ignores its own
 * interval to refill immediately.
 *
 * Without this, clearing the board still meant waiting out a full interval
 * staring at "Inbox zero" — technically not a deadlock, and indistinguishable
 * from one to the person looking at it.
 */
export const URGENT_REFILL_BELOW = 2;

export interface AmbientDecision {
  /** Spawn one now? */
  spawn: boolean;
  /** Which template — chosen from what the operator can actually work. */
  template: TicketTemplate | null;
  /** Why not, for the DevTools readout. Null when spawning. */
  reason: string | null;
  /** When the next arrival is due, for the same readout. */
  nextDueAt: number;
}

export interface AmbientInput {
  infra: InfrastructureState;
  level: number;
  /** Unresolved, non-mail tickets currently on the board. */
  openCount: number;
  /** Template ids with an open ticket — one live instance per family. */
  openTemplateIds: string[];
  library: Record<string, TicketTemplate>;
  lastSpawnAt: number;
  now: number;
  /** Injected so the decision is reproducible in tests. */
  rng: () => number;
}

/**
 * Should a ticket arrive right now, and which?
 *
 * PURE. Given the same inputs it returns the same answer, which is what lets
 * the spec drive a thousand simulated minutes through it and assert that the
 * queue never runs dry — a property that is impossible to test against a
 * function that reads the clock and the store itself.
 */
export function ambientDecision(input: AmbientInput): AmbientDecision {
  const { infra, level, openCount, openTemplateIds, library, lastSpawnAt, now, rng } = input;

  const phase = infra.growth?.phase ?? 0;
  const interval = ARRIVAL_MS_BY_PHASE[phase] ?? ARRIVAL_MS_BY_PHASE[0];
  const nextDueAt = lastSpawnAt + interval;

  if (openCount >= BACKLOG_CEILING) {
    return {
      spawn: false,
      template: null,
      reason: `Backlog full (${openCount}/${BACKLOG_CEILING}) — holding until the operator clears some.`,
      nextDueAt,
    };
  }

  // An empty board jumps the queue. Waiting out a full interval on "Inbox
  // zero" is indistinguishable from the bug this file fixes.
  const urgent = openCount < URGENT_REFILL_BELOW;
  if (!urgent && now < nextDueAt) {
    return {
      spawn: false,
      template: null,
      reason: `Next arrival in ${Math.ceil((nextDueAt - now) / 1000)}s.`,
      nextDueAt,
    };
  }

  const candidates = eligibleTemplates({ infra, level, library, openTemplateIds });
  if (candidates.length === 0) {
    return {
      spawn: false,
      template: null,
      // Reachable in principle — a tiny world where every eligible family is
      // already open. Reported rather than silently doing nothing, because
      // "no eligible templates" is exactly the symptom of a prerequisite bug.
      reason: "No eligible template — every unlocked family already has an open ticket.",
      nextDueAt,
    };
  }

  return {
    spawn: true,
    template: candidates[Math.floor(rng() * candidates.length)],
    reason: null,
    nextDueAt: now + interval,
  };
}

/**
 * Templates this operator could actually work right now.
 *
 * THE PREREQUISITE GATE, and the only one. Every spawn path routes through
 * here so a ticket can never arrive demanding an app the player cannot open —
 * which was previously only enforced on the STARTER queue, leaving reactive
 * incidents and promotion batches free to hand out work with no tool to do it.
 */
export function eligibleTemplates({
  infra,
  level,
  library,
  openTemplateIds,
}: {
  infra: InfrastructureState;
  level: number;
  library: Record<string, TicketTemplate>;
  openTemplateIds: string[];
}): TicketTemplate[] {
  const tiers = new Set<TicketDifficulty>(unlockedTiers(level));
  const openFamilies = new Set(openTemplateIds.map(familyOf));

  return Object.values(library).filter((t) => {
    // 1. The tier has to be open to this operator.
    if (!tiers.has(t.difficulty)) return false;

    // 2. Every tool the ticket needs has to be unlocked. `templateMinLevel`
    //    maps tags to apps to unlock levels, so a `poe` ticket cannot arrive
    //    before Network Switches does.
    if (templateMinLevel(t.tags) > level) return false;

    // 3. One live ticket per family. Two identical lockout tickets on the
    //    board is noise, and the second cannot be resolved independently
    //    anyway because they grade the same world state.
    if (openFamilies.has(familyOf(t.id))) return false;

    // 4. The world has to be able to host it. A template whose context cannot
    //    bind produces a ticket about a machine that does not exist.
    if (!t.playable) return false;

    // 5. Systemic set-pieces stay out of the ambient rotation. The ransomware
    //    incident rewrites the estate through `injectFault`; having one arrive
    //    unannounced every ninety seconds would be a different game. Those are
    //    dispatched deliberately — by a scripted beat or from DevTools.
    if (t.injectFault && t.difficulty === "Tier_4_Expert") return false;

    return true;
  });
}

/** Procedural ids are `<family>-<tier>-<variant>`; hand-authored are whole. */
export function familyOf(templateId: string): string {
  const m = /^(gen-.+?)-\d+-\d+$/.exec(templateId);
  return m ? m[1] : templateId;
}
