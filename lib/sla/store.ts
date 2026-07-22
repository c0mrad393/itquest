/**
 * TriageOS — SLA clock store
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
