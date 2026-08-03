/**
 * TriageOS — Leaderboard field (shared)
 * =====================================
 * Seeded rival roster + rank math, shared by the Leaderboard app and the
 * Profile app's gamification dashboard. Static until multiplayer sync lands.
 */

export interface LeaderboardEntry {
  name: string;
  role: string;
  avatar: string;
  xp: number;
  resolved: number;
  breaches: number;
  csat: number | null;
  you?: boolean;
}

export const RIVALS: LeaderboardEntry[] = [
  { name: "D. Okafor", role: "Tier-3 SRE", avatar: "emerald", xp: 12480, resolved: 61, breaches: 2, csat: 91 },
  { name: "M. Ivanova", role: "SecOps Analyst", avatar: "rose", xp: 9310, resolved: 44, breaches: 4, csat: 88 },
  { name: "K. Tanaka", role: "Tier-2 Sysadmin", avatar: "sky", xp: 7420, resolved: 39, breaches: 6, csat: 84 },
  { name: "S. Weber", role: "NetOps Engineer", avatar: "amber", xp: 5150, resolved: 28, breaches: 3, csat: 86 },
  { name: "A. Haddad", role: "Helpdesk Lead", avatar: "violet", xp: 3890, resolved: 33, breaches: 9, csat: 79 },
];

/** 1-based global rank for a given XP total against the seeded field. */
export function rankForXp(xp: number): number {
  return RIVALS.filter((r) => r.xp > xp).length + 1;
}
