/**
 * TriageOS — Host workstation seed
 * ================================
 * The operator's Level-0 workstation profile. (The ticket queue is now minted
 * by the procedural TicketFactory in lib/tickets/factory.ts.)
 */

import type { HostWorkstationState } from "@/lib/core";
import { EMPTY_SKILLS } from "@/lib/progression/tracks";

export function createHostWorkstation(): HostWorkstationState {
  return {
    user: {
      displayName: "Operator",
      // Title is DERIVED from level + skills at render time (see
      // lib/progression/tracks.ts). This is only the day-one seed.
      role: "IT Intern",
      avatar: "indigo",
      level: 1,
      xp: 0,
      // An intern's float: one memory module and a couple of cables.
      budget: 400,
      skills: { ...EMPTY_SKILLS },
    },
    wallpaper: "bloom",
    soundEnabled: true,
    licenses: [],
    clock24h: true,
    tray: { networkConnected: true, volume: 65, notifications: 3 },
  };
}
