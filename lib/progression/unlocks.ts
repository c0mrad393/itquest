/**
 * ITQuest — Progressive unlocks
 * ==============================
 * The desk does not hand an intern the keys to the rack on day one. Apps and
 * ticket tiers open up as the operator levels, so the OS starts small and
 * legible and grows into the full estate.
 *
 * Levels are the gate rather than tickets-completed because XP already
 * accounts for quality: a player who breaches every SLA levels slower and
 * waits longer for the rack, which is the correct outcome.
 */

import type { HostAppId, TicketDifficulty } from "@/lib/core";
import { firstTierReaching, type TierSpec } from "@/lib/platform/tiers";

/**
 * Level at which each app becomes available. Anything absent is available
 * from the start — the intern's core loop is read the ticket, talk to the
 * requester, look it up in the wiki.
 */
export const APP_UNLOCK_LEVEL: Partial<Record<HostAppId, number>> = {
  // Remoting into a machine IS entry-level helpdesk work, so the gateway ships
  // with the intern kit — without it there is nothing an intern can action.
  leaderboard: 2,
  edge: 2, // the perimeter: firewall rules, links and traffic
  switches: 3, // the access layer: ports, PoE and addressing
  backup: 4, // protect the estate — and pay for the storage that does it
  hardwarelab: 3, // touch hardware
  assetmanager: 4, // manage stock
  procurement: 4, // spend money
  racklab: 5, // build infrastructure
  serverman: 5, // ...and run what is in it
  aethercloud: 6, // run the cloud
};

/**
 * Which app a scenario needs before it can be worked, inferred from its tags.
 *
 * Tag-driven rather than a field on every template: there are 130+ templates
 * and the tags already describe the work. Ordered most-specific first.
 */
const TAG_APP: [string, HostAppId][] = [
  ["aether", "aethercloud"],
  ["cloud", "aethercloud"],
  // NOTE: "ad" and "identity" are deliberately NOT mapped to the directory
  // console. Lockouts and password resets are Tier-1 intern work and stay
  // reachable the original way — Remote Gateway, RDP into the DC, ADUC. The
  // host-level console is a convenience, not a new gate on old tickets.
  ["shares", "gateway"],
  ["acl", "gateway"],
  ["migration", "serverman"],
  ["capacity-plan", "serverman"],
  ["rack", "racklab"],
  ["procurement", "procurement"],
  ["shipping", "procurement"],
  ["hardware", "hardwarelab"],
  ["ram", "hardwarelab"],
  ["raid", "hardwarelab"],
  ["bios", "hardwarelab"],
  ["imaging", "hardwarelab"],
  ["ransomware", "backup"],
  ["backup", "backup"],
  ["recovery", "backup"],
  ["disaster-recovery", "backup"],
  ["poe", "switches"],
  ["ip-conflict", "switches"],
  ["camera", "switches"],
  ["congestion", "edge"],
  ["firewall", "edge"],
  ["containment", "edge"],
  ["isolation", "edge"],
  ["intrusion", "edge"],
  ["capacity", "edge"],
  ["logs", "edge"],
];

/**
 * The level at which a scenario becomes workable. Handing an intern a ticket
 * whose tool is still locked is just a dead end in the queue, so the factory
 * filters on this.
 */
export function templateMinLevel(tags: string[]): number {
  let min = 1;
  for (const [tag, app] of TAG_APP) {
    if (tags.includes(tag)) min = Math.max(min, appUnlockLevel(app));
  }
  return min;
}

/** Ticket tiers only start arriving once the operator can handle them. */
export const TIER_UNLOCK_LEVEL: Record<TicketDifficulty, number> = {
  Tier_1_Easy: 1,
  Tier_2_Medium: 2,
  Tier_3_Hard: 5,
  Tier_4_Expert: 7,
};

export function appUnlockLevel(appId: HostAppId): number {
  return APP_UNLOCK_LEVEL[appId] ?? 1;
}

export function isAppUnlocked(appId: HostAppId, level: number): boolean {
  return level >= appUnlockLevel(appId);
}

export function unlockedTiers(level: number): TicketDifficulty[] {
  return (Object.keys(TIER_UNLOCK_LEVEL) as TicketDifficulty[]).filter(
    (t) => level >= TIER_UNLOCK_LEVEL[t],
  );
}

/** Apps that become available exactly at `level` — drives the promotion toast. */
export function appsUnlockedAt(level: number): HostAppId[] {
  return (Object.keys(APP_UNLOCK_LEVEL) as HostAppId[]).filter(
    (id) => APP_UNLOCK_LEVEL[id] === level,
  );
}

/** Tiers that become available exactly at `level`. */
export function tiersUnlockedAt(level: number): TicketDifficulty[] {
  return (Object.keys(TIER_UNLOCK_LEVEL) as TicketDifficulty[]).filter(
    (t) => TIER_UNLOCK_LEVEL[t] === level,
  );
}

// ── Why an app is locked ────────────────────────────────────────────────────

/**
 * WHICH KIND OF LOCKED, and this distinction is the whole point.
 *
 * "Unlocks at level 5" is a promise: keep working and it opens. On the free
 * plan it was a promise the product could not keep — the ceiling is level 4,
 * and the Datacenter Floor, the Server Manager and the cloud console all sit
 * above it. Three apps were being advertised to free operators as something
 * they could earn, in a grid they would have ground towards forever.
 *
 * The ladder and the plan's ceiling were designed apart and never introduced.
 * They meet here: a lock past the ceiling is a question about a PLAN, not
 * about effort, and it has to be worded as one.
 */
export type AppLock =
  | { kind: "open" }
  /** Reachable on this plan — keep going. */
  | { kind: "level"; need: number }
  /** Past this plan's ceiling. No amount of play reaches it. */
  | { kind: "plan"; need: number; tier: TierSpec | null };

export function appLock(appId: HostAppId, level: number, cap: number | null): AppLock {
  const need = appUnlockLevel(appId);
  if (level >= need) return { kind: "open" };
  if (cap !== null && need > cap) return { kind: "plan", need, tier: firstTierReaching(need) };
  return { kind: "level", need };
}

/** The short line under a locked tile. */
export function lockLabel(lock: AppLock): string {
  if (lock.kind === "open") return "";
  if (lock.kind === "level") return `Unlocks at level ${lock.need}`;
  return lock.tier ? `Part of ${lock.tier.label}` : "Beyond this plan";
}

/** The longer form, for a tooltip or a toast — it says WHY, not just what. */
export function lockExplanation(lock: AppLock, title: string): string {
  if (lock.kind === "open") return "";
  if (lock.kind === "level") return `${title} unlocks at level ${lock.need}.`;
  return `${title} opens at level ${lock.need}, which is past this plan's ceiling.${
    lock.tier ? ` ${lock.tier.label} reaches it.` : ""
  }`;
}
