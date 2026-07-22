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
  breached: boolean;
  onTime: boolean;
}

export function computeScore(ticket: Ticket, csat: number, breached: boolean): ScoreResult {
  const onTime = !breached;
  // SLA multiplier: bonus for in-SLA, penalty for a breach.
  const slaFactor = breached ? 0.5 : 1.15;
  // CSAT multiplier: 0.5 (angry) → 1.2 (delighted).
  const csatFactor = 0.5 + (Math.max(0, Math.min(100, csat)) / 100) * 0.7;
  const xp = Math.round(ticket.xpReward * slaFactor * csatFactor);
  return { xp, csat: Math.round(csat), slaFactor, csatFactor, breached, onTime };
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
