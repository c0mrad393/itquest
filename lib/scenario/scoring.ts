/**
 * TriageOS — Resolution scoring
 * =============================
 * Turns a resolved ticket + its conversation outcome into XP. Reward scales
 * with SLA compliance and final CSAT, so speed AND customer handling matter.
 */

import type { Ticket } from "@/lib/core";

export interface ScoreResult {
  xp: number;
  csat: number; // 0-100 final customer satisfaction
  slaFactor: number;
  csatFactor: number;
  hintFactor: number;
  breached: boolean;
  onTime: boolean;
}

/** Each revealed hint costs this share of the ticket's base reward. */
export const HINT_PENALTY_PER_STEP = 0.15;
/** Never below this share, so a fully-hinted fix is still worth finishing. */
export const HINT_PENALTY_FLOOR = 0.25;

/**
 * Multiplier applied for hints already revealed on a ticket. Linear at 15% a
 * step and clamped, so the fifth hint stops mattering and the player is never
 * incentivised to abandon a ticket they've opened up.
 */
export function hintFactor(revealed: number): number {
  return Math.max(HINT_PENALTY_FLOOR, 1 - HINT_PENALTY_PER_STEP * Math.max(0, revealed));
}

/**
 * Projected XP for a ticket that has not been resolved yet — what the ticket UI
 * shows the player while they decide whether to spend another hint. Assumes an
 * in-SLA finish at the conversation's current CSAT, which is the same maths
 * `computeScore` will run at resolution.
 */
export function projectedXp(ticket: Ticket, csat = 70): number {
  return computeScore(ticket, csat, false).xp;
}

export function computeScore(ticket: Ticket, csat: number, breached: boolean): ScoreResult {
  const onTime = !breached;
  // SLA multiplier: bonus for in-SLA, penalty for a breach.
  const slaFactor = breached ? 0.5 : 1.15;
  // CSAT multiplier: 0.5 (angry) → 1.2 (delighted).
  const csatFactor = 0.5 + (Math.max(0, Math.min(100, csat)) / 100) * 0.7;
  // Hint multiplier: the player traded reward for guidance.
  const hints = hintFactor(ticket.hintsRevealed ?? 0);
  const xp = Math.round(ticket.xpReward * slaFactor * csatFactor * hints);
  return { xp, csat: Math.round(csat), slaFactor, csatFactor, hintFactor: hints, breached, onTime };
}

/** XP required to reach a given level (simple escalating curve). */
export function xpForLevel(level: number): number {
  return Math.round(500 * level * (level + 1) * 0.5);
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  return level;
}
