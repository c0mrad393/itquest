"use client";

/**
 * ITQuest — reading the operator's standing from React
 * =====================================================
 * The one place a component asks "what level is the operator?".
 *
 * Separate from `standing.ts` because that file has to stay free of stores:
 * `lib/host/store.ts` derives the level inside its own `openApp` gate, so a
 * store import there would close a cycle. Pure maths in one file, the wiring
 * in this one.
 *
 * Everything a gate needs comes from here, so no component reaches into
 * `host.user` for a level again — the field it used to read no longer exists,
 * which is the point: the two-number split that produced a level 4 taskbar
 * over a level 7 profile is now unrepresentable.
 */

import { useEntitlementStore } from "@/lib/platform/entitlements";
import { useHostStore } from "@/lib/host/store";
import { standingOf, type Standing } from "./standing";
import { tierOf } from "@/lib/platform/tiers";

/** The operator's standing, derived from live XP and the live plan. */
export function useStanding(): Standing {
  const xp = useHostStore((s) => s.host.user.xp);
  const tier = useEntitlementStore((s) => s.tier);
  return standingOf(xp, tierOf(tier).levelCap);
}

/** Just the gating level, for the many callers that want nothing else. */
export function useOperatorLevel(): number {
  return useStanding().level;
}
