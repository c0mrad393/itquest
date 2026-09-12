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
  /** Highest company growth phase. `null` is uncapped. */
  phaseCap: number | null;
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
    phaseCap: 1,
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
    phaseCap: null,
    shiftAllowance: null,
    features: ["ticket-history", "leaderboard", "cloud-save", "certificates"],
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    blurb: "Pro for every seat, plus the things only a cohort needs.",
    levelCap: null,
    phaseCap: null,
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
