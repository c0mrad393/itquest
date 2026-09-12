"use client";

/**
 * ITQuest — the entitlements seam
 * ===============================
 * The ONE question every screen asks: what is this account allowed to do?
 *
 * ── WHY THIS IS A SEAM AND NOT A FEATURE ────────────────────────────────────
 *
 * There is no backend yet, and the plan is to build the whole paid experience
 * before there is one. That only works if the shape of the answer is fixed now
 * and the source of the answer is swapped later. So screens call
 * `useEntitlements()` and never read a plan, a level cap or a counter
 * directly; today those come from local state, tomorrow from a session the
 * server signed, and no screen changes either way.
 *
 * ── THE CLIENT IS NOT THE AUTHORITY, AND SAYS SO ────────────────────────────
 *
 * Everything here is advisory. The tier sits in the player's own browser and
 * so does the shift counter, which means anyone determined can raise their own
 * limits. That is an accepted property of a client-only build, not an
 * oversight: the caps exist to pace a new player and to make the next chapter
 * worth buying. Enforcement that matters — billing, cohort data, certificates
 * — is work the server will do when there is one, and none of it is claimed
 * here.
 */

import { create } from "zustand";
import {
  TIERS,
  allows,
  lockReason,
  tierOf,
  type Feature,
  type TierId,
  type TierSpec,
} from "./tiers";
import {
  canTakeOn,
  freshShift,
  nextShiftAt,
  remaining,
  rollover,
  takeOn,
  untilNextShift,
  type ShiftState,
} from "./shift";

const TIER_KEY = "itquest-tier";
const SHIFT_KEY = "itquest-shift";

/** localStorage does not exist during SSR, and may throw in private modes. */
function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage refused. The session still works; it just will not be remembered. */
  }
}

interface EntitlementStore {
  tier: TierId;
  shift: ShiftState;
  /** True once the browser's own values have been read. */
  ready: boolean;

  hydrate: () => void;
  /** Development and, later, the billing callback. */
  setTier: (t: TierId) => void;
  /** Spend one of the shift's tickets. False when the shift is over. */
  spendShift: () => boolean;
  /** The plan's level ceiling, or null when uncapped. For non-React callers. */
  levelCap: () => number | null;
  resetShift: () => void;
}

export const useEntitlementStore = create<EntitlementStore>((set, get) => ({
  tier: "free",
  shift: freshShift(0),
  ready: false,

  hydrate: () =>
    set({
      tier: readLocal<TierId>(TIER_KEY, "free"),
      // Rolled on read, so a session left open overnight starts a new shift.
      shift: rollover(readLocal<ShiftState>(SHIFT_KEY, freshShift())),
      ready: true,
    }),

  setTier: (t) => {
    writeLocal(TIER_KEY, t);
    set({ tier: t });
  },

  spendShift: () => {
    const { tier, shift } = get();
    const allowance = tierOf(tier).shiftAllowance;
    const rolled = rollover(shift);
    if (!canTakeOn(rolled, allowance)) {
      // Still persist the rollover, or a stale day sits there until something
      // else happens to write.
      if (rolled !== shift) {
        writeLocal(SHIFT_KEY, rolled);
        set({ shift: rolled });
      }
      return false;
    }
    const next = takeOn(rolled, allowance);
    writeLocal(SHIFT_KEY, next);
    set({ shift: next });
    return true;
  },

  levelCap: () => tierOf(get().tier).levelCap,

  resetShift: () => {
    const fresh = freshShift();
    writeLocal(SHIFT_KEY, fresh);
    set({ shift: fresh });
  },
}));

export interface Entitlements {
  tier: TierId;
  spec: TierSpec;
  ready: boolean;
  /** Is this capability part of the plan? */
  can: (f: Feature) => boolean;
  /** Why not, in words a player should read. Null when they can. */
  why: (f: Feature) => string | null;
  /** Highest level this plan reaches, or null when uncapped. */
  levelCap: number | null;
  /** Highest company growth phase, or null when uncapped. */
  phaseCap: number | null;
  /** Has the operator reached the plan's ceiling? */
  atLevelCap: (level: number) => boolean;
  shift: {
    allowance: number | null;
    used: number;
    /** Null when unlimited. */
    remaining: number | null;
    /** True while there is another ticket to take on. */
    open: boolean;
    resetsAt: number;
    resetsIn: string;
  };
}

/**
 * What a screen asks.
 *
 * Everything is derived on read. There is no cached "isPro" anywhere to fall
 * out of step with the plan, which is the same rule the rest of the estate
 * follows: store what happened, derive what is true.
 */
export function useEntitlements(): Entitlements {
  const tier = useEntitlementStore((s) => s.tier);
  const shift = useEntitlementStore((s) => s.shift);
  const ready = useEntitlementStore((s) => s.ready);

  const spec = tierOf(tier);
  const allowance = spec.shiftAllowance;
  const rolled = rollover(shift);
  const left = remaining(rolled, allowance);

  return {
    tier,
    spec,
    ready,
    can: (f) => allows(tier, f),
    why: (f) => lockReason(tier, f),
    levelCap: spec.levelCap,
    phaseCap: spec.phaseCap,
    atLevelCap: (level) => spec.levelCap !== null && level >= spec.levelCap,
    shift: {
      allowance,
      used: rolled.used,
      remaining: left,
      open: left === null || left > 0,
      resetsAt: nextShiftAt(),
      resetsIn: untilNextShift(),
    },
  };
}

export { TIERS };
export type { Feature, TierId, TierSpec };
