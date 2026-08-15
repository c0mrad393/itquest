/**
 * TriageOS — Progressive unlocks
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

/**
 * Level at which each app becomes available. Anything absent is available
 * from the start — the intern's core loop is read the ticket, talk to the
 * requester, look it up in the wiki.
 */
export const APP_UNLOCK_LEVEL: Partial<Record<HostAppId, number>> = {
  // Remoting into a machine IS entry-level helpdesk work, so the gateway ships
  // with the intern kit — without it there is nothing an intern can action.
  monitor: 2, // watch the estate
  leaderboard: 2,
  netops: 2, // touch the network
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
  ["congestion", "netops"],
  ["firewall", "netops"],
  ["containment", "netops"],
  ["isolation", "netops"],
  ["intrusion", "netops"],
  ["capacity", "netops"],
  ["logs", "netops"],
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
