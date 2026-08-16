"use client";

/**
 * ITQuest — Dev Tools session state (Build 3)
 * ============================================
 * The stress-bench knobs: bitrate multipliers, forced congestion, and whether
 * the bandwidth debugger is pinned open.
 *
 * ── WHY THIS IS NOT IN `InfrastructureState` ────────────────────────────────
 *
 * Because it is not a fact about the world. "Cameras are forced to 50 Mbps" is
 * something a developer is doing for the next thirty seconds, and putting it
 * in the estate would persist it into the save file — so a player would reopen
 * their game to find a network inexplicably on fire, with nothing in any app
 * to explain why or any way to undo it.
 *
 * Session-scoped instead, and passed INTO the pure derivation as overrides.
 * That keeps one property that matters: the bench and the live game run the
 * same `computeTraffic()`. A stress test that took its own code path would be
 * testing something other than the thing it is supposed to prove.
 *
 * Everything here resets on reload, which is the correct lifetime for a probe.
 */

import { create } from "zustand";
import type { SaturationLevel, TrafficOverrides } from "@/lib/core";

interface DevToolsState extends TrafficOverrides {
  /** 1 = off. Multiplies every camera's rated bitrate. */
  stressMultiplier: number;
  /** Overrides the profile entirely when set. */
  forceMbpsPerCamera: number | null;
  /** Pins the saturation state, bypassing the arithmetic. */
  forceState: SaturationLevel | null;

  setStress: (n: number) => void;
  setForceMbps: (n: number | null) => void;
  setForceState: (l: SaturationLevel | null) => void;
  /** Back to a clean, unforced world. */
  reset: () => void;
  /** True when anything is being overridden — the UI must say so. */
  active: () => boolean;
}

export const useDevToolsStore = create<DevToolsState>((set, get) => ({
  stressMultiplier: 1,
  forceMbpsPerCamera: null,
  forceState: null,

  setStress: (n) => set({ stressMultiplier: n }),
  setForceMbps: (n) => set({ forceMbpsPerCamera: n }),
  setForceState: (l) => set({ forceState: l }),
  reset: () => set({ stressMultiplier: 1, forceMbpsPerCamera: null, forceState: null }),

  active: () => {
    const s = get();
    return s.stressMultiplier !== 1 || s.forceMbpsPerCamera !== null || s.forceState !== null;
  },
}));

/**
 * The overrides as a plain object for `computeTraffic`.
 *
 * A selector rather than a hook so non-React callers (the engines, the spec
 * suite) can read the same values without pulling in React.
 */
export function trafficOverrides(): TrafficOverrides {
  const s = useDevToolsStore.getState();
  return {
    stressMultiplier: s.stressMultiplier,
    forceMbpsPerCamera: s.forceMbpsPerCamera,
    forceState: s.forceState,
  };
}

/**
 * Subscribe to the overrides in a component.
 *
 * Returns a NEW object each call by design — the values are primitives and the
 * store is tiny, so identity churn costs nothing, and memoising it would be one
 * more thing that can go stale while a slider is being dragged.
 */
export function useTrafficOverrides(): TrafficOverrides {
  const stressMultiplier = useDevToolsStore((s) => s.stressMultiplier);
  const forceMbpsPerCamera = useDevToolsStore((s) => s.forceMbpsPerCamera);
  const forceState = useDevToolsStore((s) => s.forceState);
  return { stressMultiplier, forceMbpsPerCamera, forceState };
}
