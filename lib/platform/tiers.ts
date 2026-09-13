/**
 * ITQuest — what each tier is, as data
 * =====================================
 * One table. The app asks this module what a plan allows; nothing anywhere
 * else decides, and no screen hard-codes "if free then".
 *
 * ── WHY THE TIERS ARE NOT A FEATURE LIST ────────────────────────────────────
 *
 * The obvious way to sell a simulator is by module: helpdesk free, servers
 * paid. It breaks the product. The estate is ONE estate and the scenarios cut
 * across it — a locked-out user is an Active Directory job, so a free tier
 * without AD has a queue full of tickets it cannot answer. That teaches a new
 * player that the product is broken, not that they should pay.
 *
 * So the axis is the ARC, not the feature set: how far along a career you may
 * travel, how fast, and whether the journey is remembered well enough to prove.
 *
 * Free is a COMPLETE first job, not a crippled edition. It ends where the
 * story ends a chapter — the company is about to grow, and growing with it is
 * the thing you buy.
 */

import { phaseForLevel, type GrowthPhase } from "@/lib/core/growth";

export type TierId = "free" | "pro" | "enterprise";

/**
 * Capabilities a plan can carry.
 *
 * Deliberately coarse. Every one of these is a thing a person would recognise
 * on a pricing page; none of them is an internal implementation detail, which
 * is what keeps the table honest when marketing and code have to agree.
 */
export type Feature =
  /** Reopen and study tickets you have already resolved. */
  | "ticket-history"
  /** Appear on, and read, the global ranking. */
  | "leaderboard"
  /** Progress follows the account rather than the browser. */
  | "cloud-save"
  /** Exportable evidence of what you completed. */
  | "certificates"
  /** An instructor can see this seat's progress. */
  | "cohort-reporting"
  /** The organisation may author its own scenarios. */
  | "custom-scenarios";

export interface TierSpec {
  id: TierId;
  label: string;
  /** One line, as it would read on a pricing page. */
  blurb: string;
  /**
   * Highest operator level this plan reaches. `null` is uncapped.
   *
   * The cap is a story beat rather than a wall: level 4 is exactly where the
   * company outgrows its first rack, so the ceiling arrives at the moment the
   * next chapter starts.
   */
  levelCap: number | null;
  /**
   * Tickets that may be TAKEN ON per shift. `null` is unlimited.
   *
   * It limits what you start, never what you finish — see `shift.ts`.
   */
  shiftAllowance: number | null;
  features: readonly Feature[];
}

export const TIERS: Record<TierId, TierSpec> = {
  free: {
    id: "free",
    label: "Free",
    blurb: "A complete first shift on the service desk.",
    levelCap: 4,
    shiftAllowance: 5,
    /*
     * The leaderboard is here on purpose. A ranking that only paying players
     * can see is a ranking of paying players, which is not the same thing and
     * is worth much less to everyone on it. Progress is saved too — locally,
     * which is what "cloud-save" is the upgrade to.
     */
    features: ["leaderboard"],
  },
  pro: {
    id: "pro",
    label: "Pro",
    blurb: "The whole career, from intern to principal.",
    levelCap: null,
    shiftAllowance: null,
    features: ["ticket-history", "leaderboard", "cloud-save", "certificates"],
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    blurb: "Pro for every seat, plus the things only a cohort needs.",
    levelCap: null,
    shiftAllowance: null,
    features: [
      "ticket-history",
      "leaderboard",
      "cloud-save",
      "certificates",
      "cohort-reporting",
      "custom-scenarios",
    ],
  },
};

/**
 * The company growth phase a plan reaches.
 *
 * DERIVED, because it was never an independent fact. `phaseCap: 1` sat beside
 * `levelCap: 4` as a second constant saying the same thing in another unit —
 * the phases are themselves a function of level, so the two agreed only for as
 * long as nobody moved a phase threshold. Moving phase 2 down to level 4 would
 * have left the pricing page quietly advertising a limit the product no longer
 * applied, with nothing to catch it.
 *
 * Nothing enforces this separately either, and nothing needs to: capping the
 * level caps the phase, because that is where a phase comes from.
 */
export function phaseCapOf(id: TierId): GrowthPhase | null {
  const cap = TIERS[id].levelCap;
  return cap === null ? null : phaseForLevel(cap);
}

/**
 * The cheapest plan that reaches a given level — what a level-gated lock
 * should name when the level is past the current plan's ceiling.
 *
 * Returns null when no plan reaches it, which today cannot happen: Pro is
 * uncapped. It is a null rather than a throw because a future plan shape is
 * not this function's problem to be certain about.
 */
export function firstTierReaching(level: number): TierSpec | null {
  const order: TierId[] = ["free", "pro", "enterprise"];
  for (const id of order) {
    const cap = TIERS[id].levelCap;
    if (cap === null || cap >= level) return TIERS[id];
  }
  return null;
}

/**
 * IS THIS CAPABILITY WORKING TODAY?
 *
 * The price list is built from `TIERS` so it cannot invent a feature the
 * product does not sell — but nothing stopped it listing one the product does
 * not yet DO. Four of the six below have no code path at all: they are real
 * commitments that arrive with the server, and printing them in the same ink
 * as the two that work today is the kind of small dishonesty a beta cannot
 * afford.
 *
 * `live` means an operator can use it in this build. Everything else waits on
 * accounts, and says so wherever it is listed.
 */
export type FeatureStatus = "live" | "with-accounts";

export const FEATURE_STATUS: Record<Feature, FeatureStatus> = {
  leaderboard: "live",
  "ticket-history": "live",
  // Needs somewhere to put the save that is not this browser.
  "cloud-save": "with-accounts",
  // Needs an identity to name on the certificate.
  certificates: "with-accounts",
  // The console at /org is built and reads a real ledger — of sample data.
  // It has no way to receive a cohort's runs until there are accounts.
  "cohort-reporting": "with-accounts",
  "custom-scenarios": "with-accounts",
};

export const isLive = (f: Feature): boolean => FEATURE_STATUS[f] === "live";

export function tierOf(id: TierId): TierSpec {
  return TIERS[id];
}

export function allows(id: TierId, f: Feature): boolean {
  return TIERS[id].features.includes(f);
}

/** The plan that first offers a capability — what an upsell should name. */
export function firstTierWith(f: Feature): TierSpec | null {
  const order: TierId[] = ["free", "pro", "enterprise"];
  for (const id of order) if (allows(id, f)) return TIERS[id];
  return null;
}

/**
 * Why a capability is unavailable, in words a player should see.
 *
 * Returned from one place so four screens cannot each write their own version
 * of the upsell, one of which ends up sounding like an error message.
 */
export function lockReason(current: TierId, f: Feature): string | null {
  if (allows(current, f)) return null;
  const need = firstTierWith(f);
  const what: Record<Feature, string> = {
    "ticket-history": "Reviewing tickets you have already closed",
    leaderboard: "The global ranking",
    "cloud-save": "Progress that follows your account",
    certificates: "Exportable evidence of what you completed",
    "cohort-reporting": "Instructor reporting",
    "custom-scenarios": "Authoring your own scenarios",
  };
  return `${what[f]} is part of ${need?.label ?? "a paid plan"}.`;
}
