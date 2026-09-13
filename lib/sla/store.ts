/**
 * ITQuest — SLA clock store
 * ==========================
 * Holds a shared `now` that the SlaEngine advances every second, so every SLA
 * countdown in the app re-renders live. Also remembers which tickets have
 * already fired a warning/breach so events aren't duplicated.
 */

"use client";

import { create } from "zustand";

interface SlaStore {
  now: number;
  warned: Record<string, boolean>;
  breached: Record<string, boolean>;
  tick: (now: number) => void;
  markWarned: (ticketId: string) => void;
  markBreached: (ticketId: string) => void;
}

export const useSlaStore = create<SlaStore>((set) => ({
  now: Date.now(),
  warned: {},
  breached: {},
  tick: (now) => set({ now }),
  markWarned: (ticketId) => set((s) => ({ warned: { ...s.warned, [ticketId]: true } })),
  markBreached: (ticketId) => set((s) => ({ breached: { ...s.breached, [ticketId]: true } })),
}));

/** Live-ticking `now` for countdown displays. */
export function useNow(): number {
  return useSlaStore((s) => s.now);
}

/**
 * The same clock, snapped to the minute.
 *
 * For countdowns told in minutes and hours — the shift timer, chiefly. It is
 * the selector's RESULT that decides whether a subscriber re-renders, so a
 * component reading this wakes once a minute instead of once a second, while
 * still following the same tick as everything else.
 *
 * Read it for the subscription and take the time itself from `Date.now()`: the
 * bucket is a change signal, not a clock to display.
 */
export function useMinute(): number {
  return useSlaStore((s) => Math.floor(s.now / 60_000));
}
