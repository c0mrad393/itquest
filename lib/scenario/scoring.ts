/**
 * ITQuest — Resolution scoring
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
  budgetFactor: number;
  breached: boolean;
  onTime: boolean;
}

/** Credits/hour of cloud spend the desk is expected to work inside. */
export const BUDGET_ALLOWANCE = 6;
/** Share of reward lost per credit/hour over the allowance. */
export const BUDGET_PENALTY_PER_CREDIT = 0.02;
export const BUDGET_PENALTY_FLOOR = 0.75;

/**
 * FinOps multiplier — "Budget Inefficiency".
 *
 * Solving a ticket by throwing High-Spec vNodes at it works, but it costs. The
 * penalty is proportional to the overspend rather than binary, so a Standard
 * node that was genuinely needed barely registers while a wall of oversized
 * nodes is felt. Floored so a wasteful fix still beats no fix.
 */
export function budgetFactor(burnPerHour: number): number {
  const over = Math.max(0, burnPerHour - BUDGET_ALLOWANCE);
  return Math.max(BUDGET_PENALTY_FLOOR, 1 - over * BUDGET_PENALTY_PER_CREDIT);
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
export function projectedXp(ticket: Ticket, csat = 70, burnPerHour = 0): number {
  return computeScore(ticket, csat, false, burnPerHour).xp;
}

export function computeScore(
  ticket: Ticket,
  csat: number,
  breached: boolean,
  /** Live cloud burn rate in credits/hour, when the world has a cloud tenant. */
  burnPerHour = 0,
): ScoreResult {
  const onTime = !breached;
  // SLA multiplier: bonus for in-SLA, penalty for a breach.
  const slaFactor = breached ? 0.5 : 1.15;
  // CSAT multiplier: 0.5 (angry) → 1.2 (delighted).
  const csatFactor = 0.5 + (Math.max(0, Math.min(100, csat)) / 100) * 0.7;
  // Hint multiplier: the player traded reward for guidance.
  const hints = hintFactor(ticket.hintsRevealed ?? 0);
  // FinOps multiplier: over-provisioned cloud spend erodes the reward.
  const budget = budgetFactor(burnPerHour);
  const xp = Math.round(ticket.xpReward * slaFactor * csatFactor * hints * budget);
  return {
    xp,
    csat: Math.round(csat),
    slaFactor,
    csatFactor,
    hintFactor: hints,
    budgetFactor: budget,
    breached,
    onTime,
  };
}

// ── IT Budget ───────────────────────────────────────────────────────────────

/**
 * Budget paid out per difficulty tier. Steeper than the XP curve on purpose:
 * an Expert incident should fund a switch, a Tier-1 should barely fund a
 * memory module. That gradient is what makes taking hard work worthwhile once
 * the store room is empty.
 */
export const BUDGET_BY_TIER: Record<string, number> = {
  Tier_1_Easy: 180,
  Tier_2_Medium: 520,
  Tier_3_Hard: 1400,
  Tier_4_Expert: 3000,
};

/** Finance withholds half the recharge on work delivered outside SLA. */
export const BUDGET_BREACH_FACTOR = 0.5;

/**
 * Budget awarded for resolving a ticket.
 *
 * Deliberately NOT reduced by hints or cloud overspend — those are skill and
 * engineering judgement, and they are already priced into XP. Budget answers a
 * different question ("did the business get what it paid for?"), so the only
 * thing that moves it is the SLA. Keeping the two currencies on separate
 * penalty tracks stops one mistake from cascading into both.
 */
export function budgetReward(ticket: Ticket, breached: boolean): number {
  const base = BUDGET_BY_TIER[ticket.difficulty] ?? BUDGET_BY_TIER.Tier_1_Easy;
  return Math.round(base * (breached ? BUDGET_BREACH_FACTOR : 1));
}

/**
 * XP required to reach a given level.
 *
 * Deliberately gentle through the intern phase: the first promotions gate the
 * apps, so a new player should feel the OS opening up within a couple of
 * tickets rather than after an hour. It steepens from there.
 */
export function xpForLevel(level: number): number {
  return Math.round(250 * level * (level - 1));
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  return level;
}
