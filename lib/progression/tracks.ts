/**
 * ITQuest — Skill tracks & career specialisation
 * ===============================================
 * XP is no longer a single number. Every resolved ticket also credits ONE
 * skill track, and the operator's job title is derived from where that
 * experience has actually accumulated.
 *
 * The point is that the title is EARNED, not chosen: a player who keeps
 * picking up rack work becomes a Hardware Technician because that is what
 * they have been doing, and it changes as their habits change.
 */

import type { Ticket, TicketCategory } from "@/lib/core";

export type SkillTrack = "hardware" | "networking" | "systems" | "security" | "identity" | "cloud";

export const SKILL_TRACKS: SkillTrack[] = [
  "hardware",
  "networking",
  "systems",
  "security",
  "identity",
  "cloud",
];

export interface TrackMeta {
  id: SkillTrack;
  label: string;
  /** Discipline noun used to build the job title. */
  discipline: string;
  iconId: string;
  color: string;
}

export const TRACK_META: Record<SkillTrack, TrackMeta> = {
  hardware: {
    id: "hardware",
    label: "Hardware",
    discipline: "Hardware Technician",
    iconId: "wrench",
    color: "text-amber-300",
  },
  networking: {
    id: "networking",
    label: "Networking",
    discipline: "Network Engineer",
    iconId: "globe",
    color: "text-teal-300",
  },
  systems: {
    id: "systems",
    label: "Systems",
    discipline: "SysAdmin",
    iconId: "server",
    color: "text-sky-300",
  },
  security: {
    id: "security",
    label: "Security",
    discipline: "Security Analyst",
    iconId: "shield",
    color: "text-rose-300",
  },
  identity: {
    id: "identity",
    label: "Identity",
    discipline: "Identity Engineer",
    iconId: "users",
    color: "text-violet-300",
  },
  cloud: {
    id: "cloud",
    label: "Cloud",
    discipline: "Cloud Engineer",
    iconId: "cloud",
    color: "text-indigo-300",
  },
};

/**
 * Persisted as a plain record (HostUser.skills) so the save stays schemaless;
 * readers tolerate missing tracks rather than requiring a migration when a new
 * discipline is added.
 */
export type SkillXp = Partial<Record<SkillTrack, number>> & Record<string, number>;

const xpIn = (skills: SkillXp, t: SkillTrack): number => skills[t] ?? 0;

export const EMPTY_SKILLS: SkillXp = {
  hardware: 0,
  networking: 0,
  systems: 0,
  security: 0,
  identity: 0,
  cloud: 0,
};

/**
 * Which discipline a ticket trains.
 *
 * Tags win over category, because a ticket's category describes the business
 * impact while its tags describe the work: a cloud VPN outage is filed under
 * "Network & Routing" but the skill being exercised is cloud.
 */
const TAG_TRACK: [string, SkillTrack][] = [
  ["cloud", "cloud"],
  ["aether", "cloud"],
  ["rack", "hardware"],
  ["hardware", "hardware"],
  ["ram", "hardware"],
  ["disk", "hardware"],
  ["raid", "hardware"],
  ["bios", "hardware"],
  ["imaging", "hardware"],
  ["shipping", "hardware"],
];

const CATEGORY_TRACK: Record<TicketCategory, SkillTrack> = {
  "Identity & Access": "identity",
  "Network & Routing": "networking",
  "System & Web Services": "systems",
  "Security & Incident": "security",
};

export function skillOf(ticket: Pick<Ticket, "tags" | "category">): SkillTrack {
  for (const [tag, track] of TAG_TRACK) {
    if (ticket.tags.includes(tag)) return track;
  }
  return CATEGORY_TRACK[ticket.category] ?? "systems";
}

// ── Career title ────────────────────────────────────────────────────────────

/**
 * Seniority by level. The prefix is what promotion feels like; the discipline
 * is what specialisation feels like. Combining them means both axes are
 * visible in one line of text.
 */
export const RANK_TIERS: { minLevel: number; prefix: string }[] = [
  { minLevel: 1, prefix: "Intern" },
  { minLevel: 2, prefix: "Junior" },
  { minLevel: 4, prefix: "L2" },
  { minLevel: 6, prefix: "Senior" },
  { minLevel: 9, prefix: "Lead" },
  { minLevel: 12, prefix: "Principal" },
];

export function rankPrefix(level: number): string {
  let prefix = RANK_TIERS[0].prefix;
  for (const t of RANK_TIERS) if (level >= t.minLevel) prefix = t.prefix;
  return prefix;
}

/**
 * Experience in one track needed before the desk will label someone a
 * specialist. Below it they are a generalist — which is the honest read on
 * someone two tickets into the job.
 */
export const SPECIALISATION_THRESHOLD = 1200;

/** The track carrying the most XP, or null while still a generalist. */
export function dominantTrack(skills: SkillXp): SkillTrack | null {
  let best: SkillTrack | null = null;
  let bestXp = 0;
  for (const t of SKILL_TRACKS) {
    if (xpIn(skills, t) > bestXp) {
      bestXp = xpIn(skills, t);
      best = t;
    }
  }
  return bestXp >= SPECIALISATION_THRESHOLD ? best : null;
}

/**
 * The operator's live job title, e.g. "IT Intern" → "Junior SysAdmin" →
 * "L2 Network Engineer". Recomputed from state on every render, so it tracks
 * the player's actual behaviour rather than a one-time choice.
 */
export function jobTitle(level: number, skills: SkillXp): string {
  const track = dominantTrack(skills);
  const prefix = rankPrefix(level);
  if (!track) return prefix === "Intern" ? "IT Intern" : `${prefix} IT Generalist`;
  return `${prefix} ${TRACK_META[track].discipline}`;
}

/** Share of total experience per track, for the profile's specialisation bars. */
export function trackShares(skills: SkillXp): { track: SkillTrack; xp: number; pct: number }[] {
  const total = SKILL_TRACKS.reduce((t, k) => t + xpIn(skills, k), 0);
  return SKILL_TRACKS.map((track) => ({
    track,
    xp: xpIn(skills, track),
    pct: total === 0 ? 0 : Math.round((xpIn(skills, track) / total) * 100),
  })).sort((a, b) => b.xp - a.xp);
}
